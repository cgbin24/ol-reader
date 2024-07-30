
![chapter26.png](https://p1-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/f1d55651195140cba401e0b890e726ab~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

### 如何优化

性能优化的目的就是**降本增效**，特别是在大型系统中，10%的资源节约一个月就可以降本几十万或更多。但是优化本身也是有成本的，因此需要一种可量化可评估的方法来执行与落地。比如在上一章节，我们通过基准测试，对系统做了一个相对公平、可重复验证的一个性能评估，这对接下来的优化提供了一个**起点**。

#### 优化顺序

在一个系统中，越是上层的业务逻辑，优化的效果是越好的，比如优化了一个流程，减少了一次数据库的读或写操作，可能吞吐量立刻提高了**30%**，效果是非常明显的，不过它的**受众面小**，可能只对单个任务有效；而越是底层的优化，提升的空间越小，可能对单个任务来说只有**1%** 的提升，但是它**受众面广**，反馈到整个系统上时就会有可观的优化收益。

> 那么，针对一个系统，如何去优化呢？

首先，最好的优化肯定是从顶层设计入手，在系统框架设计时期就把容量与性能评估好，并留有一定的扩展空间；当然这需要设计者在相关领域有深度理解，并有足够的知识储备，否则一旦系统主干落地成形，可塑造性及优化空间就要视具体情况而定了。回到本小册的即时通信系统中，前期的架构设计与实现已经成型，也就没必要在此时考虑重构的必要性。因此，接下来将从如下几个局部方向尝试进行一定程度的性能优化：

1. `底层优化`：主要是从**通信层**入手，提高**空载情况**下网络IO的吞吐量，同时尽量减少资源占用。
2. `逻辑优化`：实际上可优化的流程逻辑目前不多，主要从缓存入手提高读性能。
3. `IO优化`：主要是针对IO类耗时操作优化，比如消息的持久化。

总结来说，要达成以上目标，我们既要有性能分析工具和方法来支撑**底层优化**的执行，也要有整体的**测试结果**来校验**整体优化**的成果。而整体测试结果我们已经在上一章节完成；接下来，就是性能分析工具入场了。

#### pprof性能分析

`pprof`就是指导优化前进方向的一座灯塔，它是一款非常强大的分析工具，也是golang官方提供的性能调优分析工具，可以对程序进行性能分析，并可视化数据。

它可以从如下几个方面分析系统性能：

- `CPU profile`：报告程序的CPU使用情况，按照一定频率去采集应用程序在CPU和寄存器上面的数据。
- `Memory Profile（Heap Profile）`：报告程序的内存使用情况。
- `Block Profiling`：可以用来分析和查找死锁等性能瓶颈。
- `Goroutine Profiling`：报告goroutines的使用情况，有哪些goroutine，它们的调用关系是怎样的。

`最重要的是`，使用pprof很非常简单，只需要`两步`即可：

1. 引入`net/http/pprof`包，如下：

```go
import (
	_ "net/http/pprof"
)
```

2. 如果你的应用程序未开启http服务，可以单独启用一个http服务。如下：

```go
go func() {
        logger.Println(http.ListenAndServe(":6060", nil))
}()
```

以上两步好像没什么关系，实际上pprof会把handler注册到默认的`DefaultServeMux`中。

```go
package pprof

func init() {
	http.HandleFunc("/debug/pprof/", Index)        <-- 首页
	http.HandleFunc("/debug/pprof/cmdline", Cmdline)
	http.HandleFunc("/debug/pprof/profile", Profile)
	http.HandleFunc("/debug/pprof/symbol", Symbol)
	http.HandleFunc("/debug/pprof/trace", Trace)
}
```

> 如果从安全的角度考虑不想暴露给外部访问，可以自定义一个ServeMux，手动注册pprof的Handler到这个mux中。

<!-- 启动服务之后，访问 [http://localhost:6060/debug/pprof/](http://localhost:6060/debug/pprof/%E3%80%82)。 就会显示如下内容： -->启动本地服务:6060

![image.png](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/fc6ad1cf787a43f786a23658a94bd365~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

至于具体如何分析，将在下面的优化部分详细介绍。

### ws.Upgrade优化

#### 环境准备

虽然我们可以把整个系统运行起来，对网关或者逻辑服务做压力测试，并使用pprof生成分析结果。不过，在本项目中，大可不必如此，由于整个系统的分层结构**清晰明了**。因此，要对通信层做分析很方便，直接启用`examples/mock`中的测试服务即可。

首先，**启用pprof**，添加如下代码到server.go中：
```go
//examples/mock/server.go
package mock

import (
	"errors"
	"net/http"
	_ "net/http/pprof"
)

type ServerDemo struct{}

func (s *ServerDemo) Start(id, protocol, addr string) {
	go func() {
		logger.Println(http.ListenAndServe(":6060", nil))
	}()
        ...
}
```

其次，编写一个压力测试脚本如下:
```go
// examples/benchmark/server_test.go

func Test_Parallel(t *testing.T) {
	const count = 10000
	gpool, _ := ants.NewPool(50, ants.WithPreAlloc(true))
	defer gpool.Release()
	var wg sync.WaitGroup
	wg.Add(count)

	clis := make([]kim.Client, count)
	t0 := time.Now()
	for i := 0; i < count; i++ {
		idx := i
		_ = gpool.Submit(func() {
			cli := websocket.NewClient(fmt.Sprintf("test_%v", idx), "client", websocket.ClientOptions{
				Heartbeat: kim.DefaultHeartbeat,
			})
			// set dialer
			cli.SetDialer(&mock.WebsocketDialer{})

			// step2: 建立连接
			err := cli.Connect(wsurl)
			if err != nil {
				logger.Error(err)
			}
			clis[idx] = cli
			wg.Done()
		})
	}
	wg.Wait()
	t.Logf("logined %d cost %v", count, time.Since(t0))
	t.Logf("done connecting")
	time.Sleep(time.Second * 30)
	t.Logf("closed")

	for i := 0; i < count; i++ {
		clis[i].Close()
	}
}
```

以上逻辑就登录`10000`个用户，然后保持`time.Second * 30`之后，再断开的测试流程。登录的并发数为50，这是一个线程池，读者可以自行修改并发大小。

> 注意: 需要修改本机连接数相关的配置，否则默认配置是无法建立10000个连接的，具体如何修改可以参考 **上一章节** 中的配置修改。

#### 性能分析实战

首先，我们需要开启服务：
```sh
$ cd examples \
$ go run main.go mock_srv
```

如果要分析CPU的执行情况，必须在`执行测试脚本之前`，先开启cpu采集，因为这个采集对系统性能影响较大，默认情况下是没有采样数据的。执行如下命令：
```sh
$ go tool pprof --http=:6061 http://localhost:6060/debug/pprof/profile\?debug\=1\&second\=20
```

这里的second表示采集的时间，单位秒。

> 如果你的电脑上没有安装graphviz，它会提示你先安装。在MAC下，只需执行`brew install graphviz`即可。其它平台可以从这里[graphviz](https://www.graphviz.org/download/)下载安装。

执行之后，它会挂起20秒，你必须在这个**时间段内** 执行完测试脚本。运行命令如下：
```sh
$ cd examples/benchmark \
$ go test -run ^Test_Parallel$ -v --count=1
```

当采集结束之后，pprof会下载服务端的**数据**，并使用graphviz生成一个可视化的web界面。

![image.png](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/9b42a34006474641872ba2b727a7d4c8~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

**选择View->Frame Graph**，得到如下图：

![image.png](https://p9-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/a6459cab1a514728a166d9be9571a8a7~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

从左往右，分**三个段**，占用的cpu情况如下：

1. `http.(*conn).readRequest`: 解析http请求产生的耗时`0.19s`。

![image.png](https://p1-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/9d634ca911e6419ca456c63c93179e82~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

2. `mock.(*ServerHandler).Accept`：登录认证逻辑产生的耗时`0.63s`。

![image.png](https://p6-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/0ba95dba7f194ccd880d33d006a2eb49~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

3. `ws.HTTPUpgrader.Upgrade`: 升级websocket产生的耗时`0.35s`。

![image.png](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/3d16393331c548ca9258dcec493519d9~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

**结果分析：**

- 第1和第3点，实际上就是处理http请求，升级为websocket的过程。
- 第2点优化是最简单的，只要尽量减少日志输出即可，或者调整一个合理的日志级别，这一点在后面的代码优化中通用。

> 当然，知道了性能问题所有，我们并不一定具有优化的知识与能力。

#### no-copy优化

在前面章节中，实际上已经提到过为什么使用`gobwas/ws`这个websocket库。它可以在tcp的基础中，直接解析http头，跳过了go默认的http包中的逻辑。

**如下是官方http包中生成request和response的核心方法：**

```go
package http

// Read next request from connection.
func (c *conn) readRequest(ctx context.Context) (w *response, err error) {
	if c.hijacked() {
		return nil, ErrHijacked
	}

	var (
		wholeReqDeadline time.Time // or zero if none
		hdrDeadline      time.Time // or zero if none
	)
	t0 := time.Now()
	if d := c.server.readHeaderTimeout(); d != 0 {
		hdrDeadline = t0.Add(d)
	}
	if d := c.server.ReadTimeout; d != 0 {
		wholeReqDeadline = t0.Add(d)
	}
	c.rwc.SetReadDeadline(hdrDeadline)
	if d := c.server.WriteTimeout; d != 0 {
		defer func() {
			c.rwc.SetWriteDeadline(time.Now().Add(d))
		}()
	}

	c.r.setReadLimit(c.server.initialReadLimitSize())
	if c.lastMethod == "POST" {
		// RFC 7230 section 3 tolerance for old buggy clients.
		peek, _ := c.bufr.Peek(4) // ReadRequest will get err below
		c.bufr.Discard(numLeadingCRorLF(peek))
	}
	req, err := readRequest(c.bufr, keepHostHeader)             <----- 读取Http请求包
	if err != nil {
		if c.r.hitReadLimit() {
			return nil, errTooLarge
		}
		return nil, err
	}

	if !http1ServerSupportsRequest(req) {
		return nil, statusError{StatusHTTPVersionNotSupported, "unsupported protocol version"}
	}

	c.lastMethod = req.Method
	c.r.setInfiniteReadLimit()

	hosts, haveHost := req.Header["Host"]
	isH2Upgrade := req.isH2Upgrade()
	if req.ProtoAtLeast(1, 1) && (!haveHost || len(hosts) == 0) && !isH2Upgrade && req.Method != "CONNECT" {
		return nil, badRequestError("missing required Host header")
	}
	if len(hosts) > 1 {
		return nil, badRequestError("too many Host headers")
	}
	if len(hosts) == 1 && !httpguts.ValidHostHeader(hosts[0]) {
		return nil, badRequestError("malformed Host header")
	}
	for k, vv := range req.Header {
		if !httpguts.ValidHeaderFieldName(k) {
			return nil, badRequestError("invalid header name")
		}
		for _, v := range vv {
			if !httpguts.ValidHeaderFieldValue(v) {
				return nil, badRequestError("invalid header value")
			}
		}
	}
	delete(req.Header, "Host")

	ctx, cancelCtx := context.WithCancel(ctx)
	req.ctx = ctx
	req.RemoteAddr = c.remoteAddr
	req.TLS = c.tlsState
	if body, ok := req.Body.(*body); ok {
		body.doEarlyClose = true
	}

	// Adjust the read deadline if necessary.
	if !hdrDeadline.Equal(wholeReqDeadline) {
		c.rwc.SetReadDeadline(wholeReqDeadline)
	}

	w = &response{                                         <----- 生成response
		conn:          c,
		cancelCtx:     cancelCtx,
		req:           req,
		reqBody:       req.Body,
		handlerHeader: make(Header),
		contentLength: -1,
		closeNotifyCh: make(chan bool, 1),

		// We populate these ahead of time so we're not
		// reading from req.Header after their Handler starts
		// and maybe mutates it (Issue 14940)
		wants10KeepAlive: req.wantsHttp10KeepAlive(),
		wantsClose:       req.wantsClose(),
	}
	if isH2Upgrade {
		w.closeAfterReply = true
	}
	w.cw.res = w
	w.w = newBufioWriterSize(&w.cw, bufferBeforeChunkingSize)
	return w, nil
}
```

在前面的性能分析中，我们是从CPU性能的角度分析的。那么，执行`readRequest`从内存的角度产生了什么影响呢？接下就使用pprof的allocs来分析下建立`1w` 个连接过程中的内存分配情况。这里会使用到如下指标：

- `inuse_space` — 已分配但尚未释放的内存量
- `inuse_objects` — 已分配但尚未释放的对象数量
- `alloc_space` — 分配的内存总量
- `alloc_objects` — 分配的对象总数

**与CPU性能分析不同的是**：内存分析要在执行完测试，服务端采集到数据之后，再执行如下命令：
```sh
$ go tool pprof --http=:6062 http://localhost:6060/debug/pprof/allocs\?debug\=1\&second\=10
```

可以看到，建立1w连接之后的inuse_objects存活对象数（堆中）如下，大部分对象都是在处理`readRequest`过程中产生。

![image.png](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/aeaff2c2eb7046e99cbae50f25c29a07~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

选择`SAMPLE` -> inuse_space，如下：

![image.png](https://p9-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/0e14c93a729744f0ba5e83076b8a63d1~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

切换到inuse_space视角，如下图所示：

![image.png](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/56a2e9a390a147ccbb052e89e0b49319~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

其中`readRequest`处理过程产生的还有13MB堆内存未被回收。实际上总分配的内存为108M(alloc_space)，减除栈中分配的内存空间与GC回收的对象，还有57MB存活对象占用的空间。上图**右边**标出的**读写缓冲**堆内存是在执行`ws.UpgradeHTTP(r, w)`时产生，分另占用了19.07MB和20.48MB空间。

> 那么，使用no-copy有什么效果呢，我们在优化之后再来分析内存情况。

实际上，升级到no-copy非常简单。只需要两步：

1. 监听tcp端口：

```go
ln, err := net.Listen("tcp", ":8080")   
if err != nil {
        log.Fatal(err)
}
```

2. 建立连接之后，握手升级Websocket。

```go
for {
        conn, err := ln.Accept()  <-- 建立连接，返回socket。
        if err != nil {
                // handle error
        }
        _, err = ws.Upgrade(conn)  <-- 在tcp协议的基础上直接握手升级。
        if err != nil {
                // handle error
        }
}
```

接下来，修改kim中的websocket中的代码：
```go
//websocket/server.go
func (s *Server) Start() error {
	log := logger.WithFields(logger.Fields{
		"module": "ws.server",
		"listen": s.listen,
		"id":     s.ServiceID(),
	})

	if s.Acceptor == nil {
		s.Acceptor = new(defaultAcceptor)
	}
	if s.StateListener == nil {
		return fmt.Errorf("StateListener is nil")
	}
	if s.ChannelMap == nil {
		s.ChannelMap = kim.NewChannels(100)
	}

	lst, err := net.Listen("tcp", s.listen)
	if err != nil {
		return err
	}
	log.Info("started")
	for {
		rawconn, err := lst.Accept()
		if err != nil {
			rawconn.Close()
			log.Warn(err)
			continue
		}
                _, err = ws.Upgrade(rawconn)  <-- 升级
		if err != nil {
			rawconn.Close()
			log.Warn(err)
			continue
		}
		go func(rawconn net.Conn) {
			conn := NewConn(rawconn)

			id, err := s.Accept(conn, s.options.loginwait)
			if err != nil {
				_ = conn.WriteFrame(kim.OpClose, []byte(err.Error()))
				conn.Close()
				return
			}
			if _, ok := s.Get(id); ok {
				log.Warnf("channel %s existed", id)
				_ = conn.WriteFrame(kim.OpClose, []byte("channelId is repeated"))
				conn.Close()
				return
			}

			channel := kim.NewChannel(id, conn)
			channel.SetReadWait(s.options.readwait)
			channel.SetWriteWait(s.options.writewait)

			s.Add(channel)
			err = channel.Readloop(s.MessageListener)
			if err != nil {
				log.Info(err)
			}
			s.Remove(channel.ID())
			_ = s.Disconnect(channel.ID())
			channel.Close()
		}(rawconn)
	}
}
```

同时，优化掉相关log的输出，这里就不详细介绍了。

#### 优化结果

**再次执行上面的CPU性能分析**，得到如下结果：

![image.png](https://p9-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/492ae5d6fb4c4ee88286891072150414~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

> 由于采样的时间段没办法确定。因此同样的10秒采集时间，下面这张图中多了一些runtime运行时的执行信息。

再次**从左往右**，主要有`三段耗时`，看上图：

1. tcp连接建立（暂时已经无法优化）。
2. websocket握手（被优化之后的结果）。
3. Accept登录认证逻辑（没有了日志的耗时）。

第二段如下图，耗时为`0.13s`，优化前是0.19+0.35=`0.54s`。

![image.png](https://p1-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/9f8d2b83fdab44aa8c78cc46f470a0f9~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

第三段如下图，耗时为`0.31s`，优化前是`0.63s`。

![image.png](https://p1-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/ae3f927d0caf432b8f04d78bbb2fe694~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

**再次执行上面的allocs性能分析**，优化后inuse_space存活对象占用空间图如下：

![image.png](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/4390a3259fb94e27bdb5388d7928cb77~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

读者可以向上翻对比下**优化前的分配情**况，可以得知inuse内存从`57MB`下降为`5.6MB`，减少堆内存分配也就在一定程序上降低了GC压力。

### 逻辑优化

通过前面的no-copy优化，websocket与tcp的连接建立及**升级握手逻辑**已经相差不大，具有再次抽象的必要性，可以极大提高逻辑的复用性。对比websocket.Server和tcp.Server代码逻辑，只有如下差异：

![image.png](https://p1-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/2ab7aa90fa6141a3a66d12246798158b~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

#### 抽象Upgrader

因此，通过抽象一个`Upgrader`接口，再次实现对Server端握手升级的抽象，实现`net.Conn`到`kim.Conn`的转化过程：
```go
//default_server.go
package kim

type Upgrader interface {
	Name() string
	Upgrade(rawconn net.Conn, rd *bufio.Reader, wr *bufio.Writer) (Conn, error)
}
```

至于，为什么多了Reader和Writer，我们在下一章节的缓冲优化中介绍。

如此一来，我们实现一个默认的Server即可：
```go
//default_server.go
package kim

type DefaultServer struct {
	Upgrader             <--- Upgrader 
	listen string
	ServiceRegistration
	ChannelMap
	Acceptor
	MessageListener
	StateListener
	once    sync.Once
	options *ServerOptions
	quit    int32
}

func NewServer(listen string, service ServiceRegistration, upgrader Upgrader, options ...ServerOption) *DefaultServer {
	defaultOpts := &ServerOptions{
		Loginwait:       DefaultLoginWait,
		Readwait:        DefaultReadWait,
		Writewait:       DefaultWriteWait,
		MessageGPool:    DefaultMessageReadPool,
		ConnectionGPool: DefaultUpgradeConnectionPool,
	}
	for _, option := range options {
		option(defaultOpts)
	}
	return &DefaultServer{
		listen:              listen,
		ServiceRegistration: service,
		options:             defaultOpts,
		Upgrader:            upgrader,
		quit:                0,
	}
}
```

修改Start方法中的Upgrade逻辑为如下：
```go
func (s *DefaultServer) Start() error {
        for {
		rawconn, err := lst.Accept()
		if err != nil {
			rawconn.Close()
			log.Warn(err)
			continue
		}
                //... 省略
                conn, err := s.Upgrade(rawconn, rd, wr)
                if err != nil {
                        log.Info(err)
                        conn.Close()
                        return
                }
        }
        
}
```

#### Server重构

那么websocket.Server的逻辑就非常简单了：
```go
//websocket/server.go
package websocket

import (
	"bufio"
	"net"

	"github.com/gobwas/ws"
	"github.com/klintcheng/kim"
)

type Upgrader struct {
}

// NewServer NewServer
func NewServer(listen string, service kim.ServiceRegistration, options ...kim.ServerOption) kim.Server {
	return kim.NewServer(listen, service, new(Upgrader), options...)
}

func (u *Upgrader) Name() string {
	return "websocket.Server"
}

func (u *Upgrader) Upgrade(rawconn net.Conn, rd *bufio.Reader, wr *bufio.Writer) (kim.Conn, error) {
	_, err := ws.Upgrade(rawconn)
	if err != nil {
		return nil, err
	}
	conn := NewConnWithRW(rawconn, rd, wr)
	return conn, nil
}
```

而tcp.Server也是同样的逻辑：
```go
package tcp

import (
	"bufio"
	"net"

	"github.com/klintcheng/kim"
)

type Upgrader struct {
}

// NewServer NewServer
func NewServer(listen string, service kim.ServiceRegistration, options ...kim.ServerOption) kim.Server {
	return kim.NewServer(listen, service, new(Upgrader), options...)
}

func (u *Upgrader) Name() string {
	return "tcp.Server"
}

func (u *Upgrader) Upgrade(rawconn net.Conn, rd *bufio.Reader, wr *bufio.Writer) (kim.Conn, error) {
	conn := NewConnWithRW(rawconn, rd, wr)
	return conn, nil
}
```

### 最后总结

本章介绍了pprof的CPU与内存分析工具的使用，并通过分析结果，完成了对通信层握手升级的优化，可以极大提高websocket网关的性能。通过no-copy，除了逻辑优化减少了CPU的消耗之外，主要体现在两点：

1. 减少了对象的在栈和堆中的分配。
2. 减少对象从**栈逃逸到堆**中的情况。

最后，细心的读者应该发现了，在ws.UpgradeHTTP中，会默认使用到`读写缓冲`。那么下一章节，我们一起来了解下缓冲与线程的优化。

**本章完！**