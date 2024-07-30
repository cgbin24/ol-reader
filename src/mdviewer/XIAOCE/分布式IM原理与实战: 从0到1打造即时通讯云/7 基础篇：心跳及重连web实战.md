在上一章节中我们介绍了连接保活及自动重连方面的理论知识。但是光说不练，说了白说，因此本章我们在demo示例的基础上，通过实战代码实现客户端的心跳与自动重连逻辑。其中，Web端SDK使用的是`Typescript`开发。

![chapter7.png](https://p6-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/f8f070ed2faf4e0789b5e4a448043529~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

### 实战讲解

下面我们开始介绍具体实现逻辑。通过修改`前面demo章节`的示例代码，来演示心跳和故障检测。

#### 一、心跳客户端实现

首先，在客户端写一个定时器，发送心跳包ws.OpPing，这就是一个保活的逻辑。
```go
func (h *handler) heartbeatloop() error {
	logrus.Info("heartbeatloop started")

	tick := time.NewTicker(h.heartbeat) //heartbeat=50s
	for range tick.C {
		logrus.Info("ping...")
                // 发送一个ping的心跳包给服务端
		if err := wsutil.WriteClientMessage(h.conn, ws.OpPing, nil); err != nil {
			return err
		}
	}
	return nil
}
```

通过`go h.heartbeatloop()`来启用它。同时，客户端也需要检查在指定时间内是否收到pong消息：
```go
func (h *handler) readloop(conn net.Conn) error {
	logrus.Info("readloop started")
	//新增1：要求在指定时间 heartbeat（50秒）*3内，可以读到数据
	err := h.conn.SetReadDeadline(time.Now().Add(h.heartbeat * 3))
	if err != nil {
		return err
	}
	for {
		frame, err := ws.ReadFrame(conn)
		if err != nil {
			return err
		}
		if frame.Header.OpCode == ws.OpPong {
			// 新增2：重置读取超时时间
			_ = h.conn.SetReadDeadline(time.Now().Add(h.heartbeat * 3))
		}

		...省略
	}
}
```

在读的方法中，我们新增了两个逻辑，用于设置读超时时间，也就是如果发送了ping包之后，在三个周期内还未收到任何消息，ws.ReadFrame(conn)就会返回一个err，我们在服务端不回复消息的前提下，可以看到如下错误：
```sh
INFO[0060] ping...                                      
WARN[0060] readloop - read tcp 127.0.0.1:51315->127.0.0.1:8000: i/o timeout 
INFO[0060] connection closed  
```

TIPS: 使用读超时而不是在一个线程中使用定时器检查是否有收到pong消息，效率更高，而且减少了系统开销。

#### 二、心跳服务端实现

我们在服务端做如下修改：
```go
func (s *Server) readloop(user string, conn net.Conn) error {
	readwait := time.Minute * 2
	for {
		// 要求客户端必须在指定时间内发送一条消息过来，可以是ping，也可以是正常数据包
		_ = conn.SetReadDeadline(time.Now().Add(readwait))

		frame, err := ws.ReadFrame(conn)
		if err != nil {
			return err
		}
		if frame.Header.OpCode == ws.OpPing {
			// 返回一个pong消息
			_ = wsutil.WriteServerMessage(conn, ws.OpPong, nil)
			continue
		}
		...省
	}
}
```

> 在for的第一行代码中，**服务端要求客户端必须在指定的时间内发送一条消息**，可以是ping包也可以是正常数据消息。这样做的优点就是服务端不用主动发送心跳包检测客户端是否存活，也就少了一个的线程；缺点就是客户端与服务端的心跳相关配置必须达成一致，比如客户端发送心跳的间隔超过了这个值，连接就会被断开。

由于Golang中runtime对goruntine的调度逻辑决定，在读取Socket缓冲区数据时，如果没有拿到数据，当前这个goroutine会被挂起加入`等待队列`，因此每次设置SetReadDeadline之后，**除非读到数据或者读超时**，否则readloop这个goroutine不会被唤醒。如果超时就返回一个【read tcp ... i/o timeout】的error，这样上层就判断连接异常了。

下面，我们关掉客户端的心跳和消息发送，再来看下服务端在等待2分钟之后输出的错误。
```sh
INFO[0007] user aaa in from 127.0.0.1:51564              id=demo listen=":8000" module=Server
WARN[0127] readloop - read tcp 127.0.0.1:8000->127.0.0.1:51564: i/o timeout  id=demo listen=":8000" module=Server
INFO[0127] connection of aaa closed                      id=demo listen=":8000" module=Server
```

### Web端实现

重点来了~

![pingpong_w3c.png](https://p1-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/4e617748d5654efe933bdfa7fc392dbb~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

上面的内部摘自参考【W3C The WebSocket API】，意思就是`ping/pong数据没有开放在API中，用户可以使用代理来发送ping和回pong消息`。正常情况下，不可能在客户端使用代理。

> 那么web端如何实现心跳逻辑？

实际上使用过websocket的用户应该知道，接口只有一个send(data) 方法用于发送消息，而消息类型是通过Websocket对象的binaryType决定的。

![WebSocket_ping.png](https://p6-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/28714c103f8e482897fc5c2b5b41a7d8~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

因此websocket协议的ping/pong是无法使用了，那么就没有办法了吗？

答案就是`在业务层协议中定义一个ping/pong的消息类型`。

**协议格式：**

|消息指令 Command|	消息长度 Length|	消息载体 Payload|
| - | - | - |
|2bytes|	4bytes|	n bytes|

比如我们给出的Command常量定义：

- 100 : 表示ping消息
- 101 : 表示pong消息
- 102 : 表示一个文本消息

接下来通过业务指令来实现心跳逻辑。

#### 实战之服务端

首先，我们要对上面服务端做些修改，支持业务层协议，并处理ping消息：
```go
// command of message
const (
	CommandPing = 100
	CommandPong = 101
)

func (s *Server) handleBinary(user string, message []byte) {
	logrus.Infof("recv message %v from %s", message, user)
	s.RLock()
	defer s.RUnlock()
	// handle ping request
	i := 0
	command := binary.BigEndian.Uint16(message[i : i+2])
	i += 2
	payloadLen := binary.BigEndian.Uint32(message[i : i+4])
	logrus.Infof("command: %v payloadLen: %v", command, payloadLen)
	if command == CommandPing {
		u := s.users[user]
		// return pong
		err := wsutil.WriteServerBinary(u, []byte{0, CommandPong, 0, 0, 0, 0})
		if err != nil {
			logrus.Errorf("write to %s failed, error: %v", user, err)
		}
	}
}
```

在`网络传输详解`一章中有介绍过大小头字节序及序列化相关知道，上面的代码中，通过一个解析**自定义协议**数据包得到了命令类型**command**，如果是一个Ping消息，就返回一个Pong消息。由于消息体为空，所以数据包就是`[]byte{0, CommandPong, 0, 0, 0, 0}`。

在readloop中收到二进制消息时调用上面这个handleBinary处理，与前面的逻辑不冲突。
```go
func (s *Server) readloop(user string, conn net.Conn) error {
	for {
		。。。省略
		// 接收文本帧内容
		if frame.Header.OpCode == ws.OpText {
			go s.handle(user, string(frame.Payload))
		} else if frame.Header.OpCode == ws.OpBinary {
			go s.handleBinary(user, frame.Payload)
		}
	}
}
```

#### 实战之Web端

接下来，我们使用Typescript语言来实现一个客户端！

**一、首先写一个登录方法：**

新增文件sdk.ts，并输入如下内容：
```ts
import { w3cwebsocket, IMessageEvent, ICloseEvent } from 'websocket';
import { Buffer } from 'buffer';

export const Ping = new Uint8Array([0, 100, 0, 0, 0, 0])
export const Pong = new Uint8Array([0, 101, 0, 0, 0, 0])

const heartbeatInterval = 10 // seconds

export let sleep = async (second: number): Promise<void> => {
    return new Promise((resolve, _) => {
        setTimeout(() => {
            resolve()
        }, second * 1000)
    })
}

export enum Ack {
    Success = "Success",
    Timeout = "Timeout",
    Loginfailed = "LoginFailed",
    Logined = "Logined",
}

export let doLogin = async (url: string): Promise<{ status: string, conn: w3cwebsocket }> => {
    const LoginTimeout = 5 // 5 seconds
    return new Promise((resolve, reject) => {
        let conn = new w3cwebsocket(url)
        conn.binaryType = "arraybuffer"

        // 设置一个登录超时器
        let tr = setTimeout(() => {
            resolve({ status: Ack.Timeout, conn: conn });
        }, LoginTimeout * 1000);

        conn.onopen = () => {
            console.info("websocket open - readyState:", conn.readyState)

            if (conn.readyState === w3cwebsocket.OPEN) {
                clearTimeout(tr)
                resolve({ status: Ack.Success, conn: conn });
            }
        }
        conn.onerror = (error: Error) => {
            clearTimeout(tr)
            // console.debug(error)
            resolve({ status: Ack.Loginfailed, conn: conn });
        }
    })
}
```

由于websocket都是以回调的方式在使用，在编码时非常不便，**特别是容易导致逻辑和状态的混乱**，因此在这里封装了一个登录方法doLogin，这样我们就可以使用await doLogin(wsurl)同步调用了。另外在真实的业务情况下，在这个方法中可以实现登录及鉴权握手相关的逻辑。

**二、编写SDK的客户端**

还是sdk.ts这个文件中定义一个IMClient对象，它实现如下功能：

- **登录**
- **心跳**
- **超时检测**
- **自动重连**

```ts
export class IMClient {
    wsurl: string
    state = State.INIT
    private conn: w3cwebsocket | null
    private lastRead: number
    constructor(url: string, user: string) {
        this.wsurl = `${url}?user=${user}`
        this.conn = null
        this.lastRead = Date.now()
    }
    // 1、登录
    async login(): Promise<{ status: string }> {
        if (this.state == State.CONNECTED) {
            return { status: Ack.Logined }
        }
        this.state = State.CONNECTING

        let { status, conn } = await doLogin(this.wsurl)
        console.info("login - ", status)

        if (status !== Ack.Success) {
            return { status }
        }
        // overwrite onmessage
        conn.onmessage = (evt: IMessageEvent) => {
            try {
                this.lastRead = Date.now()

                let buf = Buffer.from(<ArrayBuffer>evt.data)
                let command = buf.readInt16BE(0)
                let len = buf.readInt32BE(2)
                console.info(`<<<< received a message ; command:${command} len: ${len}`)
                if (command == 101) {
                    console.info("<<<< received a pong...")
                }
            } catch (error) {
                console.error(evt.data, error)
            }
        }
        conn.onerror = (error) => {
            console.info("websocket error: ", error)
            this.errorHandler(error)
        }
        conn.onclose = (e: ICloseEvent) => {
            console.debug("event[onclose] fired")
            if (this.state == State.CLOSEING) {
                this.onclose("logout")
                return
            }
            this.errorHandler(new Error(e.reason))
        }
        this.conn = conn
        this.state = State.CONNECTED

        this.heartbeatLoop()
        this.readDeadlineLoop()

        return { status }
    }
    logout() {
        if (this.state === State.CLOSEING) {
            return
        }
        this.state = State.CLOSEING
        if (!this.conn) {
            return
        }
        console.info("Connection closing...")
        this.conn.close()
    }
    // 2、心跳
    private heartbeatLoop() {
        console.debug("heartbeatLoop start")

        let loop = () => {
            if (this.state != State.CONNECTED) {
                console.debug("heartbeatLoop exited")
                return
            }

            console.log(`>>> send ping ; state is ${this.state},`)
            this.send(Ping)

            setTimeout(loop, heartbeatInterval * 1000)
        }
        setTimeout(loop, heartbeatInterval * 1000)
    }
    // 3、读超时
    private readDeadlineLoop() {
        console.debug("deadlineLoop start")
        let loop = () => {
            if (this.state != State.CONNECTED) {
                console.debug("deadlineLoop exited")
                return
            }
            if ((Date.now() - this.lastRead) > 3 * heartbeatInterval * 1000) {
                // 如果超时就调用errorHandler处理
                this.errorHandler(new Error("read timeout"))
            }
            setTimeout(loop, 1000)
        }
        setTimeout(loop, 1000)
    }
    // 表示连接中止
    private onclose(reason: string) {
        console.info("connection closed due to " + reason)
        this.state = State.CLOSED
        // 通知上层应用，这里忽略
        // this.closeCallback()
    }
    // 4. 自动重连
    private async errorHandler(error: Error) {
        // 如果是主动断开连接，就没有必要自动重连
        // 比如收到被踢，或者主动调用logout()方法
        if (this.state == State.CLOSED || this.state == State.CLOSEING) {
            return
        }
        this.state = State.RECONNECTING
        console.debug(error)
        // 重连10次
        for (let index = 0; index < 10; index++) {
            try {
                console.info("try to relogin")
                let { status } = await this.login()
                if (status == "Success") {
                    return
                }
            } catch (error) {
                console.warn(error)
            }
            // 重连间隔时间，演示使用固定值
            await sleep(5)
        }
        this.onclose("reconnect timeout")
    }
    private send(data: Buffer | Uint8Array): boolean {
        try {
            if (this.conn == null) {
                return false
            }
            this.conn.send(data)
        } catch (error) {
            // handle write error
            this.errorHandler(new Error("read timeout"))
            return false
        }
        return true
    }
}
```

上面的方法逻辑应该还比较清晰，不过新手读者可以还是有点晕，没关系哈，我们通过下面这个状态图来整理下思路，看完之后再看一遍上面的代码，相信就可以看懂了，当然读者最好是在课后自己运行看看，加深理解。

> 在上面的代码中，我们经常看到State这个枚举，使用js开发也是有好处的哈，修改this.state状态的逻辑也就`不会有多线程的并发问题`，简单很多。

```ts
export enum State {
    INIT,
    CONNECTING,
    CONNECTED,
    RECONNECTING,
    CLOSEING,
    CLOSED,
}
```

![sdk_status.png](https://p9-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/66b032b5009c4f3a813fe416441430a0~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

这是一个客户端的状态图，有两个外部事件login()和logout()，分别表示登录与登出，整个客户端的状态的变更应该画的还很清晰明了。其中`readDeadlineLoop()`读超时和`conn.onerror`两个地方会触发errorHandler()，在这个方法中，我们添加了**重连**的逻辑，**读者不要小看了这个同步的调用封装**：
```ts
let { status } = await this.login()
```

你把它换成websocket原生的回调就会发现，重试的逻辑就会被分散在多个不同的代码块，再加上正常的登录，或者互踢逻辑混在一起，是非常容易出bug的。

**三、写一个测试入口**

新增文件index.ts，并输入如下内容：
```ts
import { IMClient, sleep } from "./jdk";

const main = async () => {
    let cli = new IMClient("ws://localhost:8000", "ccc");
    let { status } = await cli.login()
    console.log("client login return -- ", status)
}

main()
```

#### 演示一 登录及心跳

1. **启用server端**。

```sh
$ go run main.go chat
INFO[0000] started                                       id=demo listen=":8000" module=Server
```

2. **启用客户端**。

此时客户端输出如下内容：
```sh
$ ts-node index.ts
websocket open - readyState: 1
login -  Success
heartbeatLoop start
deadlineLoop start
client login return --  Success
>>> send ping ; state is 2,
<<<< received a message ; command:101 len: 0
<<<< received a pong...
```

服务端输出如下内容：
```sh
INFO[0000] started                                       id=demo listen=":8000" module=Server
INFO[0092] user ccc in from 127.0.0.1:62949              id=demo listen=":8000" module=Server
INFO[0102] recv message [0 100 0 0 0 0] from ccc   <-- ping消息     
INFO[0102] command: 100 payloadLen: 0           
```

#### 演示二 自动重连

通过关掉服务端演示连接断开，一段时间之后再开启，SDK端就会输出如下内容：

> 如果有条件，读者可以在两台机器上演示，`拨网线`测试效果。

```vbnet
event[onclose] fired
Error: Connection dropped by remote peer.
    at W3CWebSocket.conn.onclose 
    ...
try to relogin
login -  LoginFailed
deadlineLoop exited   <- 读超时退出
heartbeatLoop exited  <- 心跳退出
try to relogin
login -  LoginFailed
try to relogin
websocket open - readyState: 1
login -  Success  <-- 重连成功
heartbeatLoop start
deadlineLoop start
>>> send ping ; state is 2,
<<<< received a message ; command:101 len: 0
<<<< received a pong...
```

#### 演示三 主动退出

客户端在登录10秒之后，主动退出：
```ts
import { IMClient, sleep } from "./jdk";

const main = async () => {
    let cli = new IMClient("ws://localhost:8000", "ccc");
    let { status } = await cli.login()
    console.log("client login return -- ", status)

    await sleep(10)
    cli.logout()   <-- 主动退出
}
main()
```

控制台输出日志如下：
```sh
$ ts-node index.ts
websocket open - readyState: 1
login -  Success
heartbeatLoop start
deadlineLoop start
client login return --  Success
>>> send ping ; state is 2,
<<<< received a message ; command:101 len: 0
<<<< received a pong...

Connection closing...  <-- 触发了logout()
event[onclose] fired
connection closed due to logout
deadlineLoop exited
heartbeatLoop exited
```

可以看到主动退出时，`是不会触发自动重连的`，SDK逻辑一定理顺，否则很容易出现bug。

### 最后总结

1. 心跳的目的有两点：**保活**和**检测**；理解了这两点就不难理解本文中的一些逻辑了。
2. web端不支持协议层的ping/pong，所以我们在上层逻辑协议中添加心跳指令，达到同样的目的。
3. **回调形式的异步编码对复杂的逻辑非常不友好**。在golang中的runtime已经帮我们把所有异步的操作封装到了底层，上层语法是同步的。而在web中需要开发者自己通过async/await语法糖把逻辑同步化。

[本章示例Github源码](https://github.com/klintcheng/chatdemo.git) `欢迎Star`!

**本章完！**

1. [参考【W3C The WebSocket API】](https://www.w3.org/TR/2021/NOTE-websockets-20210128/)