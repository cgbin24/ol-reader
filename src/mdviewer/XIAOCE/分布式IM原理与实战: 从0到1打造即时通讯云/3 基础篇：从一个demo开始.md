
![chapter3.png](https://p9-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/4aa1054b273d4e49ba7c2f304f8c89ac~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

### 为什么使用Websocket

可能现在的前端已经不知道了，多年前三国类策略`页游`流行的时候，Web端迎来了一次大发展，因为**页游**无需安装客户端就可以玩，对用户非常友好，虽然是策略类游戏，**但是web端的复杂度确大大增加**，大量逻辑从后端放到了Web端。这就导致Web端除了对**组件的复用**和**模块动态加载**开始有强烈的需求之外（还处于jquery时代），同时在游戏中一些实时类的消息需要尽快推送给其它用户，因此对web端`长连`的需求大大增加。但是，那时候web端要实现长连还是很复杂的，其中一个主要原因就是**用户终端的浏览器对Websocket的兼容很差**，主要是那时候的网民Window电脑上基本上都是**IE6浏览器**，它是不支持websocket的。

> 因此，那时候做长连的主要方法有两种：

- 直接使用`Flash`开发游戏界面，或者集成一个Flash的插件做长连。
- 基于Http的`Long-polling`（长轮询）技术模拟长连接。

Flash技术如今已经淘汰就不说了，而Long-polling技术虽然一定程序上也可以实现消息的即时推送，但是它有两个主要缺点：

- 服务端需要Hold住Http连接一段时间，除了对服务端并发压力增大之外，重复的连接建立与断开也是对性能的影响很大。
- Http是超文本传输协议，而长连服务通常会使用私有二进制协议。

当然它也有优点，比如前端逻辑简单，不会存在长连接的异常断开等问题，比如微信web版本就是基于长轮询实现。至于后来出现的结合`Long-polling`与`websocket`两种协议的SocketIO协议又是后话了。如今在移动互联网时代，基本上手机或者电脑上都支持了Websocket协议。另一方面原生的应用除了可以直接使用Socket做长连通信外，也可以直接使用Websocket库做长连接，因此Websocket的优势就体现出来了。

> 这也是本章节使用websocket实现一个聊天demo的原因了。

### 一个简单的websocket服务器

**先来看下演示：**

![chat_demo_min.gif](https://p9-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/b743089930ff445ba9c2b18043318ee6~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

如下就是一个只有150行代码实现的一个简单的群聊服务。

#### 一、监听连接

启用服务监听请求，因为websocket协议是在http基础上升级而来，因此我们只需要**启用一个http服务**就可以处理websocket连接请求。
```go
package serv

import (
	"errors"
	"fmt"
	"net"
	"net/http"
	"sync"

	"github.com/gobwas/ws"
	"github.com/sirupsen/logrus"
)

// Server is a websocket Server
type Server struct {
	once sync.Once
	id      string
	address string
	sync.Mutex
	// 会话列表
	users map[string]net.Conn
}

// NewServer NewServer
func NewServer(id, address string) *Server {
	return newServer(id, address)
}

func newServer(id, address string) *Server {
	return &Server{
		id:      id,
		address: address,
		users:   make(map[string]net.Conn, 100),
	}
}

// Start server
func (s *Server) Start() error {
	mux := http.NewServeMux()
	log := logrus.WithFields(logrus.Fields{
		"module": "Server",
		"listen": s.address,
		"id":     s.id,
	})

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
                // step1. 升级
		conn, _, _, err := ws.UpgradeHTTP(r, w)
		if err != nil {
			conn.Close()
			return
		}
		//step2. 读取userId
		user := r.URL.Query().Get("user")
		if user == "" {
			conn.Close()
			return
		}
		//step3. 添加到会话管理中
		old, ok := s.addUser(user, conn)
		if ok {
			// 断开旧的连接
			old.Close()
		}
		log.Infof("user %s in", user)

		go func(user string, conn net.Conn) {
                        //step4. 读取消息
			err := s.readloop(user, conn)
			if err != nil {
				log.Error(err)
			}
			conn.Close()
			//step5. 连接断开，删除用户
			s.delUser(user)

			log.Infof("connection of %s closed", user)
		}(user, conn)

	})
	log.Infoln("started")
	return http.ListenAndServe(s.address, mux)
}

func (s *Server) addUser(user string, conn net.Conn) (net.Conn, bool) {
	s.Lock()
	defer s.Unlock()
	old, ok := s.users[user] //返回旧的连接
	s.users[user] = conn //缓存
	return old, ok
}

func (s *Server) delUser(user string) {
	s.Lock()
	defer s.Unlock()
	delete(s.users, user)
}

// Shutdown Shutdown
func (s *Server) Shutdown() {
	s.once.Do(func() {
		s.Lock()
		defer s.Unlock()
		for _, conn := range s.users {
			conn.Close()
		}
	})
}
```

上面的核心部分就是handleFunc中的握手升级过程，它实现了一个连接的**生命周期管理**，我们来看这个连接的**状态图**：

![demo状态.png](https://p1-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/9e8b1067be0949f1a000ec6f8929063d~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

逻辑如下：

1. **ws.UpgradeHTTP(r, w)**： 通过websocket库来为一个websocket长连接。
2. **r.URL.Query().Get("user")**：模拟了识别用户，由于是demo，就不做权限方面的认证了。
3. **old, ok := s.addUser(user, conn)**：这里模拟了一个最简单的**同账号互踢**的逻辑。
4. **s.readloop(user, conn)**：启用一个goroutine（轻线程）读取客户端发送过来的数据。

> github.com/gobwas/ws 是golang中一个websocket库，你可以理解web服务中的http库。

#### 二、读取客户端发送的数据

```go
func (s *Server) readloop(user string, conn net.Conn) error {
	for {
		frame, err := ws.ReadFrame(conn)
		if err != nil {
			return err
		}
		if frame.Header.OpCode == ws.OpClose {
			return errors.New("remote side close the conn")
		}

		if frame.Header.Masked {
			ws.Cipher(frame.Payload, frame.Header.Mask, 0)
		}
		// 接收文本帧内容
		if frame.Header.OpCode == ws.OpText {
			go s.handle(user, string(frame.Payload))
		}
	}
}
```

**上面就是一个消息读取过程：**

1. **ws.ReadFrame(conn)**：从TCP缓冲中读取一帧的消息。
2. **ws.Cipher(frame.Payload, frame.Header.Mask, 0)**：使用Mask解码数据包，由于websocket协议规定客户端发送数据时，必须使用一个随机的mask值对消息体做一次编码，因此在服务端就需要解码，否则内容是乱的。

> 至于websocket协议的Upgrade握手逻辑以及协议帧Frame的格式，请移步**通信协议之状态篇**。

#### 三、处理消息

接下来，我们看看消息的处理逻辑；不过这里只是简单的对消息进行全网广播，演示一个最基本的消息转发逻辑。
```go
// 广播消息
func (s *Server) handle(user string, message string) {
	logrus.Infof("recv message %s from %s", message, user)
	s.Lock()
	defer s.Unlock()
	broadcast := fmt.Sprintf("%s -- FROM %s", message, user)
	for u, conn := range s.users {
		if u == user { // 不发给自己
			continue
		}
		logrus.Infof("send to %s : %s", u, broadcast)
		err := s.writeText(conn, broadcast)
		if err != nil {
			logrus.Errorf("write to %s failed, error: %v", user, err)
		}
	}
}

func (s *Server) writeText(conn net.Conn, message string) error {
	// 创建文本帧数据
	f := ws.NewTextFrame([]byte(message))
	return ws.WriteFrame(conn, f)
}
```

需要注意的是，在多线程环境下：

1. **s.users** 是map线程不安全的，这里要加**读锁**。
2. **ws.WriteFrame(conn, f)** 也是一个线程不安全的操作，要用**写锁**。

因此，我们简单的对整个handle加了一个锁。

> 为什么WriteFrame是线程不安全的？

如下是它的内部实现：
```go
//gobwas 
func WriteFrame(w io.Writer, f Frame) error {
	err := WriteHeader(w, f.Header)
	if err != nil {
		return err
	}
	_, err = w.Write(f.Payload)
	return err
}
```

可以看到这里我们的参数`io.Writer`直接使用了net.Conn连接对象，而WriteHeader与Write(f.Payload)不是一个**原子操作**，并发写消息时会乱序。

> 读者可以思考一下，如何在不加锁的情况下使ws.WriteFrame(conn, f)变成线程安全！

#### 四、启动

```go
func RunServerStart(ctx context.Context, opts *ServerStartOptions, version string) error {
	server := NewServer(opts.id, opts.listen)
	defer server.Shutdown()
	return server.Start()
}
```

### web端演示

启动服务：
```sh
go run main.go chat
```

#### 一、演示登录

在网上找个websocket测试界面，分别输入三个url并点击**连接**
```ini
ws://localhost:8000?user=张三
ws://localhost:8000?user=李四
ws://localhost:8000?user=王五
```

服务后台日志如下：
```sh
$ go run main.go chat
INFO[0000] started                                       id=demo listen=":8000" module=Server
INFO[2506] user 张三 in                                    id=demo listen=":8000" module=Server
INFO[2770] user 王五 in                                    id=demo listen=":8000" module=Server
INFO[2782] user 李四 in                                    id=demo listen=":8000" module=Server
```

#### 二、演示消息转发

在其中一个界面发送消息：

![Screen Shot 2021-05-24 at 10.32.11 PM.png](https://p6-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/92f597ad22674971bcb8db240a559a13~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

在另外两个界面中就可以看到如下消息：

![Screen Shot 2021-05-24 at 10.30.06 PM.png](https://p6-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/17b08b1ea82b421dbedc79c846f3c2f0~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

#### 三、演示互踢

在另一页面登录张三，就可以看到后台打印的信息
```sh
ERRO[3482] read tcp [::1]:8000->[::1]:65287: use of closed network connection  id=demo listen=":8000" module=Server
INFO[3482] user 张三 in                                    id=demo listen=":8000" module=Server
INFO[3482] connection of 张三 closed                       id=demo listen=":8000" module=Server
```

> 这个demo实际上是有漏洞的，读者可以自己动手测试下。

### 客户端实现

接着我们实现一个websocket客户端来测试服务。

#### 一、拨号连接

首先我们实现一个连接服务的方法，它返回一个**handler**处理器对象，代码如下：
```go
func connect(addr string) (*handler, error) {
	_, err := url.Parse(addr)
	if err != nil {
		return nil, err
	}

	conn, _, _, err := ws.Dial(context.Background(), addr)
	if err != nil {
		return nil, err
	}

	h := handler{
		conn:  conn,
		close: make(chan struct{}, 1),
		recv:  make(chan []byte, 10),
	}

	go func() {
		err := h.readloop(conn)
		if err != nil {
			logrus.Warn(err)
		}
		// 通知上层
		h.close <- struct{}{}
	}()

	return &h, nil
}
```

主要逻辑：

1. 调用ws.Dial拨号，与服务器建立连接
2. 创建handler实例
3. 启用readloop开始读取消息

#### 二、消息读取

```go
type handler struct {
	conn  net.Conn
	close chan struct{}
	recv  chan []byte
}

func (h *handler) readloop(conn net.Conn) error {
	logrus.Info("readloop started")
	for {
		frame, err := ws.ReadFrame(conn)
		if err != nil {
			return err
		}
		if frame.Header.OpCode == ws.OpClose {
			return errors.New("remote side close the channel")
		}
		if frame.Header.OpCode == ws.OpText {
			h.recv <- frame.Payload
		}
	}
}
```

客户端的readloop方法与服务端的类似，但是这里少了一个**ws.Cipher**的过程，我们在后面详细说明。

另外一个区别是这里我们使用chan通道`h.recv <- frame.Payload`，而不是像server端另启一个线程处理消息，它们实际上是两种不同的用法，在golang中有个哲学：

> 不要通过共享内存来通信，而应该通过通信来共享内存！

**不要通过共享内存来通信**就比如前面server端示例中的`users map[string]net.Conn`，我们在多线程的操作中必须要使用锁来解决同步问题，否则就会逻辑异常，而加锁的代价是很高的，因为线程会阻塞，对性能影响是很大的。**应该通过通信来共享内存**指的就是通过chan来实现多线程之间的通信，这样线程之间可以是阻塞也可以不阻塞，性能是非常高的。

> 在后面章节，我会实现一个users的`无锁版本`，提高读写性能。**在本小册的实战部分读者会见到chan的各种运用**。

不扯远了，回到主题上来~

#### 三、消息发送测试

这是一个入口方法，在这里我们连接到服务，并通返回的hander对象，开始定时发送消息给服务器。
```go
func run(ctx context.Context, opts *StartOptions) error {
	url := fmt.Sprintf("%s?user=%s", opts.address, opts.user)
	logrus.Info("connect to ", url)
        //连接到服务，并返回hander对象
	h, err := connect(url)
	if err != nil {
		return err
	}
	go func() {
                // 读取消息并显示
		for msg := range h.recv {
			logrus.Info("Receive message:", string(msg))
		}
	}()

	tk := time.NewTicker(time.Second * 6)
	for {
		select {
		case <-tk.C:
                        //每6秒发送一个消息
			err := h.sendText("hello")
			if err != nil {
				logrus.Error(err)
			}
		case <-h.close:
			logrus.Printf("connection closed")
			return nil
		}
	}
}

func (h *handler) sendText(msg string) error {
	logrus.Info("send message :", msg)
	return wsutil.WriteClientText(h.conn, []byte(msg))
}
```

这里主要逻辑有两个：

1. **for msg := range han.recv**：从recv这个chan中读取消息并显示出来。
2. **err := han.sendText("hello")**：启用了一个6秒的Ticker，发送消息。

如果连接断开，h.close这个chan就收到了信息，发送消息的for循环就会退出。

#### 四、测试

最后，我们分别启用两个客户端，可以看到其中控制台输出的消息如下：
```sh
$ go run main.go client --user=aaa
INFO[0000] connect to ws://127.0.0.1:8000?user=aaa      
INFO[0000] readloop started                             
INFO[0006] send message :hello                          
INFO[0012] send message :hello                          
INFO[0018] send message :hello                          
INFO[0022] Receive message:hello -- FROM bbb            
INFO[0024] send message :hello  


$ go run main.go client --user=bbb 
INFO[0000] connect to ws://127.0.0.1:8000?user=bbb      
INFO[0000] readloop started                             
INFO[0001] Receive message:hello -- FROM aaa            
INFO[0006] send message :hello                          
INFO[0007] Receive message:hello -- FROM aaa  
```

**知识点巩固**：

在客户端的`sendText(msg string)`方法内部调用了**wsutil.WriteClientText**，这个方法实际上在内部又调用了如下方法：

```go
func writeFrame(w io.Writer, s ws.State, op ws.OpCode, fin bool, p []byte) error {
	var frame ws.Frame
	if s.ClientSide() {
		// Should copy bytes to prevent corruption of caller data.
		payload := pbytes.GetLen(len(p))
		defer pbytes.Put(payload)

		copy(payload, p)

		frame = ws.NewFrame(op, fin, payload)
		frame = ws.MaskFrameInPlace(frame)
	} else {
		frame = ws.NewFrame(op, fin, p)
	}

	return ws.WriteFrame(w, frame)
}
```

我们主要看`MaskFrameInPlace`这个方法，它解释了websocket协议中Mask的逻辑：**客户端发送消息时，会设置Masked=true，并且对数据包做一次编码，其中Mask值是随机生成**。

我们通过它的代码来验证这个逻辑：
```go
func MaskFrameInPlace(f Frame) Frame {
	return MaskFrameInPlaceWith(f, NewMask())
}

func MaskFrameInPlaceWith(f Frame, m [4]byte) Frame {
	f.Header.Masked = true
	f.Header.Mask = m
	Cipher(f.Payload, m, 0)
	return f
}

//生成一个mask值 
func NewMask() (ret [4]byte) {
	binary.BigEndian.PutUint32(ret[:], rand.Uint32())
	return
}
```

### 最后总结：

本章虽然只是一个简单的demo，但是它包括即时通信系统中的几个基本逻辑，登录、互踢、连接管理、封包与解包。**复杂的逻辑往往也是从这些简单逻辑演化而来**，搞懂了这些，后面的代码不会晕。既然是个demo，就说明它只能在开发环境玩玩，无法使用到生产环境，除了它是单体架构系统可用性不高之外，**其中有一个原因是生产环境下网络是很复杂的**。因此我们接下了讲讲这方面的知识点，并通过实战详细分析。

本章 [Github源码 及 环境配置](https://github.com/klintcheng/chatdemo.git)

本章完！

> [websocket在线测试网站](http://www.websocket-test.com/)
