本章我们来实现websocket版本的通信层底层逻辑。

![chapter12.png](https://p9-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/78f594421d7c4ca98de09cb54ead8800~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

**目录如下：**

```go
- websocket  <-- websocket实现
    client.go
    connection.go
    server.go
channel.go   <-- channel实现
server.go    <-- 定义了通信层接口
```

### kim.Conn vs kim.Channel

在上一章节，我们介绍了Server端管理的对象就是Channel，而不是kim.Conn连接对象。**原因在于kim.Conn只提供了两个最基本的Frame读写的方法**，它是一个相对**底层**的接口，而Channel则是相对**上层**的接口，也就是说kim.Conn更抽象简单，而kim.Channel功能更强。如下图是三者的关系：

![channel.png](https://p9-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/19590d61c5c245b9939327fd38a59020~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

接下来我们分别来了解Conn与Channel实现细节！

#### kim.Conn

kim.Conn的意义在于**解决了websocket/tcp两种协议读、写逻辑上的差异**。但是它是依赖Frame的实现，而我们定义的Frame接口就是在`Websocket协议上做的减法`，因此websocket版本的Frame就很简单了，如下：
```go
package websocket

import (
	"net"

	"github.com/gobwas/ws"
	"github.com/klintcheng/kim"
)

type Frame struct {
	raw ws.Frame
}

func (f *Frame) SetOpCode(code kim.OpCode) {
	f.raw.Header.OpCode = ws.OpCode(code)
}

func (f *Frame) GetOpCode() kim.OpCode {
	return kim.OpCode(f.raw.Header.OpCode)
}

func (f *Frame) SetPayload(payload []byte) {
	f.raw.Payload = payload
}

func (f *Frame) GetPayload() []byte {
	if f.raw.Header.Masked {
		ws.Cipher(f.raw.Payload, f.raw.Header.Mask, 0)
	}
	f.raw.Header.Masked = false
	return f.raw.Payload
}
```

可以看出来它就是把`ws.Frame`包装了下。唯一需要说明的是`GetPayload()`方法，由于在Frame中没有Server与Client端的区别，基于服务端逻辑优先的考虑，我们在GetPayload()中对Payload做了Mask解码简化Server读取逻辑，但是在SetPayload中是没有使用Mask来编码。因此`客户端发送消息时不能直接使用websocket.Conn这个对象`，这点是要注意的。

接下来看看kim.Conn接口的实现，它包括**ReadFrame**与**WriteFrame**两个方法：
```go
type WsConn struct {
	net.Conn
}

func NewConn(conn net.Conn) *WsConn {
	return &WsConn{
		Conn: conn,
	}
}

func (c *WsConn) ReadFrame() (kim.Frame, error) {
	f, err := ws.ReadFrame(c.Conn)
	if err != nil {
		return nil, err
	}
	return &Frame{raw: f}, nil
}

func (c *WsConn) WriteFrame(code kim.OpCode, payload []byte) error {
	f := ws.NewFrame(ws.OpCode(code), true, payload)
	return ws.WriteFrame(c.Conn, f)
}

func (c *WsConn) Flush() error {
	return nil
}
```

这里说明一下WriteFrame中`ws.NewFrame(ws.OpCode(code), true, payload)`方法。
```go
func NewFrame(op OpCode, fin bool, p []byte) Frame {
```

在websocket协议中第一个bit位就是fin，表示当前帧是否为**连续帧中的最后一帧**。由于我们的数据包大小不会超过一个websocket协议**单个帧最大值**，因此这里全部使用true，**也就是不会把包拆分成多个**。

> Golang小知识 Golang中的`多态`与java中的显式实现不同。在上面的示例中，websocket.Frame（实现）看不出与kim.Frame(接口)有任何关系，但是只要websocket.Frame实现了kim.Frame中定义的所有方法，那么它就是kim.Frame的一种实现。

#### kim.Channel

Channel的价值在于一些`上层通用逻辑的封装`，而且由于Channel底层是kim.Conn，**因此它已经不依赖协议层**，这就使得这些通用逻辑**无需使用websocket和tcp重复实现**，无疑是减少了很多工作量哈~

我们先来看看Channel接口的定义：
```go
package kim

type Channel interface {
	Conn   <-- 这个就是前面说的kim.Conn
	Agent
	Close() error <-- 重写net.Conn中的Close方法
	Readloop(lst MessageListener) error
	SetWriteWait(time.Duration)
	SetReadWait(time.Duration)
}

type Agent interface {
	ID() string
	Push([]byte) error
}
```

**其中核心逻辑在Push和Readloop两个方法中：**

- Push是一个`线程安全`的发送数据的方法，并且我们在channel中实现了消息的异步批量发送。
- Readloop是一个阻塞的方法，它把消息的**读取**和**心跳处理**的逻辑封装在一起。

首先，我们看看channel中的`Push`方法逻辑：
```go
package kim

import (
	"errors"
	"sync"
	"time"

	"github.com/klintcheng/kim/logger"
)

// ChannelImpl is a websocket implement of channel
type ChannelImpl struct {
        sync.Mutex
	id string
	Conn
	writechan chan []byte
	once      sync.Once
	writeWait time.Duration
	closed    *Event
}

func NewChannel(id string, conn Conn) Channel {
	log := logger.WithFields(logger.Fields{
		"module": "tcp_channel",
		"id":     id,
	})
	ch := &ChannelImpl{
		id:        id,
		Conn:      conn,
		writechan: make(chan []byte, 5),
		closed:    NewEvent(),
		writeWait: time.Second * 10, //default value
	}
	go func() {
		err := ch.writeloop()
		if err != nil {
			log.Info(err)
		}
	}()
	return ch
}

func (ch *ChannelImpl) writeloop() error {
	for {
		select {
		case payload := <-ch.writechan:
			err := ch.WriteFrame(OpBinary, payload)
			if err != nil {
				return err
			}
                        // 批量写
			chanlen := len(ch.writechan)
			for i := 0; i < chanlen; i++ {
				payload = <-ch.writechan
				err := ch.WriteFrame(OpBinary, payload)
				if err != nil {
					return err
				}
			}
			err = ch.Conn.Flush()
			if err != nil {
				return err
			}
		case <-ch.closed.Done():
			return nil
		}
	}
}

func (ch *ChannelImpl) Push(payload []byte) error {
	if ch.closed.HasFired() {
		return errors.New("channel has closed")
	}
	// 异步写
	ch.writechan <- payload
	return nil
}

// overwrite Conn
func (ch *ChannelImpl) WriteFrame(code OpCode, payload []byte) error {
	_ = ch.Conn.SetWriteDeadline(time.Now().Add(ch.writeWait))
	return ch.Conn.WriteFrame(code, payload)
}
```

**Push主要做了如下两个工作：**

1. 在Channel中我们定义了一个名为writechan的`管道`，发送的消息直接通过writechan发送给了一个独立的goruntine中`writeloop()`执行，这样就使得Push变成了一个`线程安全`方法。
2. **重写**了Kim.Conn中的WriteFrame方法；增加了`重置写超时`的逻辑。

**一个调用时序如下所示：**

![channel.push.png](https://p1-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/5b97c2f770614ce2bd3737f04371e199~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

其次是`Readloop`这个方法：
```go
func (ch *ChannelImpl) Readloop(lst MessageListener) error {
	ch.Lock()
	defer ch.Unlock()
	log := logger.WithFields(logger.Fields{
		"struct": "ChannelImpl",
		"func":   "Readloop",
		"id":     ch.id,
	})
	for {
		_ = ch.SetReadDeadline(time.Now().Add(ch.readwait))

		frame, err := ch.ReadFrame()
		if err != nil {
			return err
		}
		if frame.GetOpCode() == OpClose {
			return errors.New("remote side close the channel")
		}
		if frame.GetOpCode() == OpPing {
			log.Trace("recv a ping; resp with a pong")
			_ = ch.WriteFrame(OpPong, nil)
			continue
		}
		payload := frame.GetPayload()
		if len(payload) == 0 {
			continue
		}
		go lst.Receive(ch, payload)
	}
}
```

> 前面说过，**这个是一个阻塞的方法，并且只允许被一个线程读取**，因此我们直接在前面加了锁ch.Lock()，防止上层多次调用。

可以看到这个方法中已经使用到了kim.Conn中的ReadFrame()，而且对心跳协议Ping做出了处理。

另一个需要说明的细节是`go lst.Receive(ch, payload)`，这里的ch就是`Channel`本身，但是在MessageListener中定义的是`Agent`。
```go
type MessageListener interface {
	Receive(Agent, []byte)
}
```

这是为什么呢？

> 答案就是Channel的生命周期是被通信层中的Server管理的，因此不希望Channel被上层`消息处理器`直接操作，**比如误调用Close()导致连接关闭**。

### 服务端server.go

Server实现中`核心逻辑在Start()`方法，其它的都是一个参数设置之类的逻辑，读者可以直接看源代码，这里就忽略了。
```go
package websocket

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/gobwas/ws"
	"github.com/klintcheng/kim"
	"github.com/klintcheng/kim/logger"
	"github.com/klintcheng/kim/naming"
	"github.com/segmentio/ksuid"
)

// ServerOptions ServerOptions
type ServerOptions struct {
	loginwait time.Duration //登录超时
	readwait  time.Duration //读超时
	writewait time.Duration //写超时
}

// Server is a websocket implement of the Server
type Server struct {
	listen string
	naming.ServiceRegistration
	kim.ChannelMap
	kim.Acceptor
	kim.MessageListener
	kim.StateListener
	once    sync.Once
	options ServerOptions
}

// NewServer NewServer
func NewServer(listen string, service naming.ServiceRegistration) kim.Server {
	return &Server{
		listen:              listen,
		ServiceRegistration: service,
		options: ServerOptions{
			loginwait: kim.DefaultLoginWait,
			readwait:  kim.DefaultReadWait,
			writewait: time.Second * 10,
		},
	}
}

// Start server
func (s *Server) Start() error {
	mux := http.NewServeMux()
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
        // 连接管理器
	if s.ChannelMap == nil {
		s.ChannelMap = kim.NewChannels(100)
	}

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// step 1
		rawconn, _, _, err := ws.UpgradeHTTP(r, w)
		if err != nil {
			resp(w, http.StatusBadRequest, err.Error())
			return
		}

		// step 2 包装conn
		conn := NewConn(rawconn)

		// step 3
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
		// step 4
		channel := kim.NewChannel(id, conn)
		channel.SetWriteWait(s.options.writewait)
		channel.SetReadWait(s.options.readwait)
		s.Add(channel)

		go func(ch kim.Channel) {
			// step 5
			err := ch.Readloop(s.MessageListener)
			if err != nil {
				log.Info(err)
			}
			// step 6
			s.Remove(ch.ID())
			err = s.Disconnect(ch.ID())
			if err != nil {
				log.Warn(err)
			}
			ch.Close()
		}(channel)

	})
	log.Infoln("started")
	return http.ListenAndServe(s.listen, mux)
}
```

**其中`s.ChannelMap = kim.NewChannels(100)`就是创建一个默认的连接管理器，我们通过包装sync.Map实现了一个简单的ChannelMap，读者可以看代码，这里不详解了**。

**逻辑如下：**

- **step.1** `ws.UpgradeHTTP(r, w)` 握手升级成websocket长连接，我们在`第四章`有过协议介绍，在这个方法内部主要做两件事：

```go
1. 从tcp缓冲中读取并解析Http请求包

// Read HTTP request line like "GET /ws HTTP/1.1".
rl, err := readLine(br)
if err != nil {
        return
}
// Parse request line data like HTTP version, uri and method.
req, err := httpParseRequestLine(rl)
if err != nil {
        return
}

2. 返回101协议码。表示升级成功。

const (
	textHeadUpgrade = "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
)
bw.WriteString(textHeadUpgrade)
```

- **step.2** `NewConn(rawconn)` 把net.Conn包装成为Kim.Conn。
- **step.3** `s.Accept(conn, s.options.loginwait)`回调给上层业务完成权限认证之类的逻辑处理。
- **step.4** `s.Add(channel)` 自动添加到kim.ChannelMap**连接管理器**中。
- **step.5** `ch.Readloop(s.MessageListener)` 开启一个goroutine中循环读取消息。`这里是调用了Channel中的Readloop方法`，上面有过介绍。

### 客户端逻辑client.go

client主要逻辑有四个：

- Connect：拨号建立连接并握手。
- heartbealoop: 发送心跳。
- Read：读取消息。
- Send: 发送消息。

#### Connect建立连接

```go
// ClientOptions ClientOptions
type ClientOptions struct {
	Heartbeat time.Duration //登录超时
	ReadWait  time.Duration //读超时
	WriteWait time.Duration //写超时
}

// Client is a websocket implement of the terminal
type Client struct {
	sync.Mutex
	kim.Dialer
	once    sync.Once
	id      string
	name    string
	conn    net.Conn
	state   int32
	options ClientOptions
}

// NewClient NewClient
func NewClient(id, name string, opts ClientOptions) kim.Client {
	if opts.WriteWait == 0 {
		opts.WriteWait = kim.DefaultWriteWait
	}
	if opts.ReadWait == 0 {
		opts.ReadWait = kim.DefaultReadWait
	}
	cli := &Client{
		id:      id,
		name:    name,
		options: opts,
	}
	return cli
}

// Connect to server
func (c *Client) Connect(addr string) error {
	_, err := url.Parse(addr)
	if err != nil {
		return err
	}
	if !atomic.CompareAndSwapInt32(&c.state, 0, 1) {
		return fmt.Errorf("client has connected")
	}
        // 拨号与握手
	conn, err := c.Dialer.DialAndHandshake(kim.DialerContext{
		Id:      c.id,
		Name:    c.name,
		Address: addr,
		Timeout: kim.DefaultLoginWait,
	})
	if err != nil {
		atomic.CompareAndSwapInt32(&c.state, 1, 0)
		return err
	}
	if conn == nil {
		return fmt.Errorf("conn is nil")
	}
	c.conn = conn

	if c.options.Heartbeat > 0 {
		go func() {
			err := c.heartbealoop(conn)
			if err != nil {
				logger.Error("heartbealoop stopped ", err)
			}
		}()
	}
	return nil
}
```

实际上整个方法就是调用`c.Dialer.DialAndHandshake`交给业务层拨号与握手。**我们在前一章节的mock示例中介绍过上层业务的实现逻辑**。

#### heartbealoop心跳

建立连接并完成握手之后，就完成了初始工作。接下来就要**保持连接的稳定**，因此在客户端就会执行 `c.heartbealoop(conn)`，启用一个定时器发送心跳包。
```go
func (c *Client) heartbealoop(conn net.Conn) error {
	tick := time.NewTicker(c.options.Heartbeat)
	for range tick.C {
		// 发送一个ping的心跳包给服务端
		if err := c.ping(conn); err != nil {
			return err
		}
	}
	return nil
}

func (c *Client) ping(conn net.Conn) error {
	c.Lock()
	defer c.Unlock()
	err := conn.SetWriteDeadline(time.Now().Add(c.options.WriteWait))
	if err != nil {
		return err
	}
	logger.Tracef("%s send ping to server", c.id)
	return wsutil.WriteClientMessage(conn, ws.OpPing, nil)
}
```

可以看到在写消息之前，我们都会通过`conn.SetWriteDeadline`**重置写超时**，通过这个逻辑，如果连接异常在`发送端可以感知到`。

> 注意：只要设置过一次SetWriteDeadline，以后每次写消息都要重置这个时间，否则连接就会中断。读者可以测试下。

#### Read读取消息

Read()对上层提供了统一的读取kim.Frame的逻辑。把基本的`读超时重置`，`OpClose消息包`统一处理。
```go
func (c *Client) Read() (kim.Frame, error) {
	if c.conn == nil {
		return nil, errors.New("connection is nil")
	}
	if c.options.Heartbeat > 0 {
		_ = c.conn.SetReadDeadline(time.Now().Add(c.options.ReadWait))
	}
	frame, err := ws.ReadFrame(c.conn)
	if err != nil {
		return nil, err
	}
	if frame.Header.OpCode == ws.OpClose {
		return nil, errors.New("remote side close the channel")
	}
	return &Frame{
		raw: frame,
	}, nil
} 
```

> 注意：这个方法不是线程安全的！

#### Send发送消息

```go
//Send data to connection
func (c *Client) Send(payload []byte) error {
	if atomic.LoadInt32(&c.state) == 0 {
		return fmt.Errorf("connection is nil")
	}
	c.Lock()
	defer c.Unlock()
	err := c.conn.SetWriteDeadline(time.Now().Add(c.options.WriteWait))
	if err != nil {
		return err
	}
	// 客户端消息需要使用MASK
	return wsutil.WriteClientMessage(c.conn, ws.OpBinary, payload)
}
```

在前面的kim.Conn实现中，我们介绍了client无法直接使用它，因此这里只能调用WriteClientMessage方法发送数据包。

**wsutil.WriteClientMessage方法内部逻辑如下：**

```go
package wsutil

func writeFrame(w io.Writer, s ws.State, op ws.OpCode, fin bool, p []byte) error {
	var frame ws.Frame
	if s.ClientSide() {  <-- 区分客户端逻辑
		// Should copy bytes to prevent corruption of caller data.
		payload := pbytes.GetLen(len(p))
		defer pbytes.Put(payload)

		copy(payload, p)

		frame = ws.NewFrame(op, fin, payload)
		frame = ws.MaskFrameInPlace(frame) <-- 对payload做了处理
	} else {
		frame = ws.NewFrame(op, fin, p)
	}

	return ws.WriteFrame(w, frame)
}
```

### 代码演示

终于介绍完了websocket全部实现细节，接下来我们使用`通信层框架设计`章节中的mock示例演示运行结果。

首先进入examples目录，然后先后启用server和client示例。

1. 启用服务端

```sh
go run main.go mock_srv -p ws
INFO[0000] started                                       id=srv1 listen=":8000" module=ws.server
```

2. 启用客户端

```sh
$ go run main.go mock_cli -p ws
WARN[0000] 1uWbA9ajf86A44J8t4k2AtsadQG receive message [hello from server ] 
WARN[0001] 1uWbA9ajf86A44J8t4k2AtsadQG receive message [hello from server ] 
WARN[0002] 1uWbA9ajf86A44J8t4k2AtsadQG receive message [hello from server ] 
WARN[0003] 1uWbA9ajf86A44J8t4k2AtsadQG receive message [hello from server ] 
...
```

**本章完！**