
![chapter23.png](https://p1-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/0eec73b376724e2fa85e1151c541715a~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

### SDK简介

> SDK 代表软件开发工具包。也称为 devkit，是一组针对特定平台的软件构建工具，包括构建块、调试器，通常还有一个框架或一组代码库。

SDK的主要目的就是`封装复杂逻辑，提供简单接口`。而对一个即时通讯云服务商来说，它能**快速赋予用户的产品拥有即时通讯能力**。客户不需要搭建自己的服务器，也不需要了解通信相关的专业知识，通过在系统中集成SDK提供的接口就可以实现通信。

#### 核心作用

假设我们站在云服务商`King IM Cloud`的角度来看，一个三方的应用要接入KIM服务。那么，它的调用流程就是下面的样子：

![kim_sdk_process.png](https://p1-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/f22c18672a2240dea789ac8186bc9969~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

- 三方APP登陆到自己的后端服务。
- 后端服务调用`King IM Cloud`的授权接口，获取一个用户的Token，并返回给APP端。当然账号可以提前注册，或者动态注册到KIM系统中。而且通常情况下为了安全考虑，建议三方应用使用脱敏信息注册。比如如果使用应用中的`用户账号`注册到KIM中时，最好是`MD5(account)`之后再注册到KIM系统中，这样既不增加复杂度，也不会暴露用户个人信息给外部系统。
- APP调用SDK的初始化方法，并通过SDK与KIM云服务建立长连连。

> 为什么三方APP不直接调用KIM的授权接口呢？

原因则是出于于**安全性方面的考虑**。通常云服务商会提供APP的`安全认证信息`，比如AppSecret，而这个信息是不能暴露在外部的。我们都知道，在WEB端一切信息都是透明的，即使代码混淆压缩也是很容易找到想要的信息。如果其它人拿到你的密钥，那么也就没有安全可言了。

#### 功能用例

接下来，我们看看要实现一个SDK，需要做那些工作。如下图：

![kim_sdk_usecase.png](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/4d160a2e8e064851bec592d907cec784~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

以上就是`KIM Web SDK`待开发的全部功能。主要有5个主要类目：

1. **协议层**
2. **绑定监听器**
3. **连接管理**
4. **消息处理**
5. **群管理**

其中，SDK要实现的协议如下：
```ts
export enum Command {
    // login
    SignIn = "login.signin",
    SignOut = "login.signout",

    // chat
    ChatUserTalk = "chat.user.talk",
    ChatGroupTalk = "chat.group.talk",
    ChatTalkAck = "chat.talk.ack",

    // 离线
    OfflineIndex = "chat.offline.index",
    OfflineContent = "chat.offline.content",

    // 群管理
    GroupCreate = "chat.group.create",
    GroupJoin = "chat.group.join",
    GroupQuit = "chat.group.quit",
    GroupDetail = "chat.group.detail",
}
```

> 接下来，我们就要一步步实现这些指令。

### 协议层实现

#### 环境准备

在协议章节，我们介绍过，在WEB端存在两种完全不同的协议：

- LogicPkt逻辑协议。
- Ping/Pong心跳基础协议。

基础协议比较简单，读者可以直接看源码，比如Ping包就直接定义成常量了。
```ts
export const Ping = new Uint8Array([0xc3, 0x15, 0xa7, 0x65, 0, 1, 0, 0])
```

而在LogicPkt协议中，消息体采用的是Protobuf格式。而Protobuf相对于Json这类文本格式，需要提前编写`.proto`文件，然后编译成各个端中的代码块。因此，我们首先需要解决编译问题，官方的工具就是protoc。

> 直接从github下载 [protoc](https://github.com/protocolbuffers/protobuf/releases)

![image.png](https://p9-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/ecae4c213ce6463ca06d5aa16c9430a4~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

读者可以根据自己的**操作系统**下载对应的版本，需要注意的是要下载3.x.x版本。其中**Mac版本**的protoc我已经添加到项目了`./bin`目录中。

`开源地址`： [github.com/klintcheng/…](https://github.com/klintcheng/kim_web_sdk) 欢迎Star。

![image.png](https://p6-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/d8565c1d1975494989f5ca2bdba20c26~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

由于官方的Protoc只支持编译javascript，不支持typescript，因此我们还需要安装一个`ts-proto`库。

> `yarn add --dev ts-proto`

比如我们定义一个`person.proto`文件。
```ts
message Person {
  string name = 1;
}
```

使用`ts-proto`会生成一个 `person.ts`文件，如下所示:
```ts
interface Person {
  name: string
}

const Person = {
  encode(person): Writer { ... }
  decode(reader): Person { ... }
  toJSON(person): unknown { ... }
  fromJSON(data): Person { ... }
}
```

其中最重要的方法就是：`encode`和`decode`，也就是我们前面介绍过的序列化与反序列化。接下来就是编译`./proto`目录中的两个.proto文件。比如：

> `./bin/protoc` --plugin=./node_modules/.bin/protoc-gen-ts_proto --`ts_proto_opt=forceLong=long` --ts_proto_opt=esModuleInterop=true --ts_proto_out=src/ ./proto/common.proto

做前端的读者应该知道，在js中Number类型不是`64位`，它的最大值就是`Number.MAX_SAFE_INTEGER`。

> **`Number.MAX_SAFE_INTEGER`** 常量表示在 JavaScript 中最大的安全整数，而这一数据类型能够安全存储 `-(253 - 1)` 到 `253 - 1 之间的数值（包含边界值）`。

但是在我们的协议中，会存在消息发送时间，ID等int64的值。因此，在编译时要强制指定int64转化成一个特殊的Long类型。如下：

> new( `low:` number, `high`?: number, `unsigned`?: boolean ): `Long`;

它是通过用`low低位`和`high高位`两个number来存放后端一个Long/int64类型的值，然后用unsigned表示正负。

#### proto编译及测试

通过上面的编译过程之后，就生成了两个.ts文件，比如我们协议中的`Header`所在的common.ts：

- src/proto/common.ts

```ts
export interface Header {
  command: string;
  /** sender channel id */
  channelId: string;
  sequence: number;
  flag: Flag;
  status: Status;
  /** destination is defined as a account,group or room */
  dest: string;
  meta: Meta[];
}

const baseHeader: object = {
  command: "",
  channelId: "",
  sequence: 0,
  flag: 0,
  status: 0,
  dest: "",
};

export const Header = {
  encode(person): Writer { ... }
  decode(reader): Header { ... }
  toJSON(person): unknown { ... }
  fromJSON(data): Header { ... }
}
```

由于proto的版本不同，会导致编译的格式不兼容，而且这个ts-proto也不是官方库，因此我们首先验证下它的正确性，通过在**服务端**序列化一个`MessagePush`对象，然后使用Web端的测试用例验证下反序列化之后的对象是否正确。
```ts
import { MessagePush } from "./proto/protocol"

test("msg_decode", () => {
    //messageId:1628644843872655000 type:1 body:"hello world" extra:"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY2MiOiJ0ZXN0MSIsImFwcCI6ImtpbSIsImV4cCI6MTYyOTA5MzU0OX0.P_yk1KMB5v9riUy0yW4eOTgC0k0qeB6XRjih4dL1xGk"
    let arr = new Uint8Array([8, 152, 173, 180, 194, 180, 251, 134, 205, 22, 16, 1, 26, 11, 104, 101, 108, 108, 111, 32, 119, 111, 114, 108, 100, 34, 140, 1, 101, 121, 74, 104, 98, 71, 99, 105, 79, 105, 74, 73, 85, 122, 73, 49, 78, 105, 73, 115, 73, 110, 82, 53, 99, 67, 73, 54, 73, 107, 112, 88, 86, 67, 74, 57, 46, 101, 121, 74, 104, 89, 50, 77, 105, 79, 105, 74, 48, 90, 88, 78, 48, 77, 83, 73, 115, 73, 109, 70, 119, 99, 67, 73, 54, 73, 109, 116, 112, 98, 83, 73, 115, 73, 109, 86, 52, 99, 67, 73, 54, 77, 84, 89, 121, 79, 84, 65, 53, 77, 122, 85, 48, 79, 88, 48, 46, 80, 95, 121, 107, 49, 75, 77, 66, 53, 118, 57, 114, 105, 85, 121, 48, 121, 87, 52, 101, 79, 84, 103, 67, 48, 107, 48, 113, 101, 66, 54, 88, 82, 106, 105, 104, 52, 100, 76, 49, 120, 71, 107])
    let req = MessagePush.decode(arr)
    expect(req.messageId.toString()).toEqual("1628644843872655000")
    expect(req.body).toEqual("hello world")
    expect(req.extra).toEqual("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY2MiOiJ0ZXN0MSIsImFwcCI6ImtpbSIsImV4cCI6MTYyOTA5MzU0OX0.P_yk1KMB5v9riUy0yW4eOTgC0k0qeB6XRjih4dL1xGk")
    expect(req.type).toEqual(1)
})
```

其中，`arr`这个数组就是从服务端序列化生成。运行测试：

> `yarn test src/proto.test.ts -t msg_decode`

```yaml
 PASS  src/proto.test.ts
  ✓ msg_decode (13 ms)

Test Suites: 1 passed, 1 total
Tests:       1 passed, 1 total
Snapshots:   0 total
Time:        3.722 s
```

其它的测试我就不再详细介绍了。读者需要注意的是：**构建复杂系统时，底层一定要稳定，千万不可构建完主体之后，再来测试整体流程逻辑是否正常**。否则就会导致测试及定位bug浪费大量的时间。

#### LogicPkt实现

在前面章节中，我们没有具体介绍LogicPkt的实现逻辑，正好通过Web版本了解下LogicPkt的编码与解码的实现逻辑。首先，基本的原理前后端都是相通的，比如大小端。如果已经忘记相关的知识点的读者可以回看**通信协议详解**章节。

- `LogicPkt`定义如下：

```ts
export class LogicPkt {
    command?: string;
    channelId?: string;
    sequence: number = 0;
    flag?: number;
    status: number = Status.Success;
    dest?: string;
    payload: Uint8Array
    constructor() {
        this.payload = new Uint8Array();
    }
    static build(command: string, dest: string, payload: Uint8Array = new Uint8Array()): LogicPkt {}
    static from(buf: Buffer): LogicPkt {}
    bytes(): Buffer{}
}
```

其中，LogicPkt的属性都是从Header中拷贝过来的，而`Build`方法相当于增加了一个带参数的**构造器**。我们主要看下`序列化`相关的两个方法：

- `from(buf: Buffer)`: 从Buffer中反序列化得到LogicPkt。

```ts
static from(buf: Buffer): LogicPkt {
    let offset = 0
    let magic = buf.readInt32BE(offset)
    let hlen = 0
    // 判断前面四个字节是否为Magic
    if (magic == MagicLogicPktInt) {
        offset += 4
    }
    hlen = buf.readInt32BE(offset)
    offset += 4
    // 反序列化Header
    let header = Header.decode(buf.subarray(offset, offset + hlen))
    offset += hlen
    let message = new LogicPkt()
    // 把header中的属性copy到message
    Object.assign(message, header)
    // 读取payload
    let plen = buf.readInt32BE(offset)
    offset += 4
    message.payload = buf.subarray(offset, offset + plen)
    return message
}
```

- `bytes()`：把当前对象序列化到一个Buffer中并返回。

```ts
bytes(): Buffer {
    let headerArray = Header.encode(Header.fromJSON(this)).finish()
    let hlen = headerArray.length
    let plen = this.payload.length
    // 4bytes magic | 4bytes Header Length| header | 4bytes Payload Length| payload |
    let buf = Buffer.alloc(4 + 4 + hlen + 4 + plen)
    let offset = 0
    Buffer.from(MagicLogicPkt).copy(buf, offset, 0)
    offset += 4
    // 4bytes Header Length
    offset = buf.writeInt32BE(hlen, offset)
    // header
    Buffer.from(headerArray).copy(buf, offset, 0)
    offset += hlen
    // 4bytes Payload Length
    offset = buf.writeInt32BE(plen, offset)
    // payload
    Buffer.from(this.payload).copy(buf, offset, 0)
    return buf
}
```

在bytes方法中，我们通过调用`Buffer.alloc`申请了一个缓冲空间，它的大小就是：

|magic|	Header Length|	header|	Payload Length|	payload|
| - | - | - | - | - |
|4|	4|	header.length|	4|	payload.length|

同样，完成之后也要写个测试用例验证逻辑正确性：
```ts
import { LoginReq } from "./proto/protocol"
import { Command, LogicPkt, MagicLogicPktInt, print } from "./packet"
import log from 'loglevel-es';

log.setLevel("debug")

test('logicpkt', async () => {
    const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY2MiOiJ0ZXN0MSIsImFwcCI6ImtpbSIsImV4cCI6MTYyOTA5MzU0OX0.P_yk1KMB5v9riUy0yW4eOTgC0k0qeB6XRjih4dL1xGk"
    let body = LoginReq.encode(LoginReq.fromJSON({
        token: token,
    })).finish()
    let loginReq = LogicPkt.build(Command.SignIn, "", body)
    let buf = loginReq.bytes()
    // 验证前面的4字节等于MagicLogicPktInt
    expect(buf.readInt32BE()).toEqual(MagicLogicPktInt)
    // 反序列化并验证之后的值是否与前面定义相同
    let pkt = LogicPkt.from(buf.subarray(4))
    expect(pkt.command).toEqual(Command.SignIn)
    expect(pkt.dest).toEqual("")
    expect(pkt.sequence).toBeGreaterThan(0)
    expect(pkt.payload.length).toEqual(body.length)
    // 验证payload消息体
    let req = LoginReq.decode(pkt.payload)
    expect(req.token).toEqual(token)
})
```

> 运行： `yarn test src/packet.test.ts -t logicpkt`

```yaml
 PASS  src/packet.test.ts (6.54 s)
  ✓ logicpkt (10 ms)

Test Suites: 1 passed, 1 total
Tests:       1 passed, 1 total
Snapshots:   0 total
Time:        7.301 s
```

### 连接管理

连接管理包括：`登录`、`登出`、`互踢`、`心跳`、`自动重连`等功能。其中心跳和自动重连我们在demo章节已经介绍过了，在这里做了一点优化，读者可以直接看源码。我们主要介绍下`登录`、`登出`、`互踢`三个功能。

#### 登录认证

通常情况下，使用websocket协议，在握手阶段就可以完成登录认证。比如在url中就可以带上token。

> wss://ip:port/?`token=xxxxx`

不过，因为我们在通信层中把`认证逻辑`抽象出来了，因此只能在握手完成之后，通过正常的数据包对用户做认证。因此我们先定义登录请求包：
```ts
export class LoginBody {
    token: string;
    tags?: string[];
    constructor(token: string, tags?: string[]) {
        this.token = token;
        this.tags = tags;
    }
}
```

然后，我们修改前面demo章节中的[示例](https://juejin.cn/book/6963277002044342311/section/6967230989776977934)，修改doLogin方法，完成登录逻辑：

- `src/login.ts`

```ts
import { w3cwebsocket } from 'websocket';
import { Buffer } from 'buffer';
import log from 'loglevel-es';
import { Command, LogicPkt } from './packet';
import { Status } from './proto/common';
import { LoginReq, LoginResp } from './proto/protocol';

const loginTimeout = 10 * 1000 // 10 seconds
export let doLogin = async (url: string, req: LoginBody): Promise<{ success: boolean, err?: Error, channelId?: string, account?: string, conn: w3cwebsocket }> => {
    return new Promise((resolve, _) => {
        let conn = new w3cwebsocket(url)
        conn.binaryType = "arraybuffer"

        // 设置一个登陆超时器
        let tr = setTimeout(() => {
            clearTimeout(tr)
            resolve({ success: false, err: new Error("timeout"), conn: conn });
        }, loginTimeout);

        conn.onopen = () => {
            if (conn.readyState == w3cwebsocket.OPEN) {
                log.info(`connection established, send ${req}`)
                // send handshake request
                let pbreq = LoginReq.encode(LoginReq.fromJSON(req)).finish()
                let loginpkt = LogicPkt.build(Command.SignIn, "", pbreq)
                let buf = loginpkt.bytes()
                log.debug(`dologin send [${buf.join(",")}]`)
                conn.send(buf)
            }
        }
        conn.onerror = (error: Error) => {
            clearTimeout(tr)
            log.warn(error)
            resolve({ success: false, err: error, conn: conn });
        }

        conn.onmessage = (evt) => {
            if (typeof evt.data === 'string') {
                log.warn("Received: '" + evt.data + "'");
                return
            }
            clearTimeout(tr)
            // wating for login response
            let buf = Buffer.from(evt.data)
            let loginResp = LogicPkt.from(buf)
            if (loginResp.status != Status.Success) {
                log.error("Login failed: " + loginResp.status)
                resolve({ success: false, err: new Error(`response status is ${loginResp.status}`), conn: conn });
                return
            }
            let resp = LoginResp.decode(loginResp.payload)
            resolve({ success: true, channelId: resp.channelId, account: resp.account, conn: conn });
        }
    })
}
```

在登录这个方法中，主要新增了两个逻辑：

![sdk_login_handshake.png](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/69147e4f533a420f9590897d25ce319d~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

- 在onopen连接建立之后会发送一个LoginReq请求认证，如果超过一定时间不发送登录包连接就会被服务端关闭。
- 在onmessage中监听服务端返回的认证结果，如果成功，就会返回channelId和account。

我们来看下测试用例：
```ts
const gatewayURL = "ws://119.3.4.216:8000"

test('doLogin', async () => {
    const tags = ["web"]
    let { success, channelId, account, conn } = await doLogin(gatewayURL, { token: tokens[0], tags })
    expect(success).toBeTruthy()
    log.info(account, channelId)
    expect(channelId).toContain("test1")
    expect(account).toEqual("test1")
    conn.onclose = () => {
        log.info("closed")
    }
    conn.close()
})
```

其中，`ws://119.3.4.216:8000` 是一个在线的测试服务，没有环境的读者可以直接通过它测试，但是token只有3个，在测试代码中。

> 运行：`yarn test src/sdk.test.ts -t doLogin`

```yaml
console.info
    test1 gate_1088031_test1_2

      at src/sdk.test.ts:24:9

Test Suites: 1 passed, 1 total
Tests:       2 skipped, 1 passed, 3 total
Snapshots:   0 total
Time:        2.318 s, estimated 14 s
```

可以看到输出`gate_1088031_test1_2`就是后端生成的一个channelId，规则就是：

- `{网关ID}_{账号}_{序号}`

> 当然，doLogin只是一个底层方法，真正的登录在`KIMClient`对象中！

- `src/sdk.ts`

相比与Demo版本的login()，在这里我们还会返回一个`err?: Error`给上层业务，这对一个SDK来说是必要的，**不能把错误隐藏在内部**；当然更好的方案就是返回统一的错误码，这样上层就知道如何作出反应，在这里我们就简单返回Error了。
```ts
export class KIMClient {
    wsurl: string
    private req: LoginBody
    state = State.INIT
    channelId: string
    account: string
    private conn?: w3cwebsocket
    private listeners = new Map<string, (e: KIMEvent) => void>()
    ...省
    constructor(url: string, req: LoginBody) {
        this.wsurl = url
        this.req = req
        ...省
    }
    async login(): Promise<{ success: boolean, err?: Error }> {
        if (this.state == State.CONNECTED) {
            return { success: false, err: new Error("client has already been connected") }
        }
        this.state = State.CONNECTING
        let { success, err, channelId, account, conn } = await doLogin(this.wsurl, this.req)
        if (!success) {
            this.state = State.INIT
            return { success, err }
        }
        log.info("login - ", success)
        // overwrite onmessage
        conn.onmessage = (evt: IMessageEvent) => {
           // 省略...
        }
        conn.onerror = (error) => {
            log.info("websocket error: ", error)
            this.errorHandler(error)
        }
        conn.onclose = (e: ICloseEvent) => {
            log.debug("event[onclose] fired")
            // 省略...
        }
        this.conn = conn

        if (channelId && account) {
            this.channelId = channelId
            this.account = account
        }

        this.state = State.CONNECTED
        return { success, err }
    }
}
```

#### 账号互踢

当一个用户登录时，如果服务端发现已经存在一个相同账号的用户在线，就会通过网关推送一条消息，告知此对方，此账号已经在其它地方登录了，你需要断开连接。在SDK中，所有的消息监听也是在`onmessage`中。
```ts
    async login(): Promise<{ success: boolean, err?: Error }> {
        ...省
        conn.onmessage = (evt: IMessageEvent) => {
            try {
                // 重置lastRead
                this.lastRead = Date.now()

                let buf = Buffer.from(<ArrayBuffer>evt.data)
                let magic = buf.readInt32BE()
                if (magic == MagicBasicPktInt) {//目前只有心跳包pong
                    log.debug(`recv a basic packet - ${buf.join(",")}`)
                    return
                }
                let pkt = LogicPkt.from(buf)
                this.packetHandler(pkt)
            } catch (error) {
                log.error(evt.data, error)
            }
        }
}
```

可以看到，在这里我们首先判断是否为服务端回复的`Pong`心跳包；其次才解析LogicPkt包。而packetHandler方法用于处理所有服务端发送过来的消息，它包括两种类型的消息：

- Flag.`Response`：当前用户向服务端发送请求之后的`响应消息`。
- Flag.`Push`：服务端投递过来的`推送消息`。

其中，`被踢通知`就是一条Push消息。
```ts
private packetHandler(pkt: LogicPkt) {
    log.debug("received packet: ", pkt)
    ...省略
    switch (pkt.command) {
        ...省略
        case Command.SignIn:
            let ko = KickoutNotify.decode(pkt.payload)
            if (ko.channelId == this.channelId) {
                this.logout()
                this.fireEvent(KIMEvent.Kickout)
            }
            break;
    }
}
```

这是需要**重要**说明的关键点就是必须判断`被踢channelId`是否为`登录返回的channelId`，如果不相等，很有可能是重复登录退出导致的错乱，**一种情况就是第二次的登录包在第一次的登出包之前到达Login服务完成了登录，会话被记录**，这就会导致第一条登出包到达Login之后，就会踢第二次登录的连接，如果不判断这个唯一ID，导致的结果就是`自己把自己踢下线`，而且这种情况下是不会自动重连。这种情况在Web端中比较容易复现，比如刷新界面时旧的连接断开与新的连接的建立几乎可以同时发生；或者逻辑编写的不严谨，比如开发者本来想添加一个自连重连的逻辑，但是由于`对网络通信底层认知不够`，编写的逻辑极有可能生产这个结果，而且在开发环境中还不容易复现，但在上了生产之后，或多或少就会出现几例这种现象，虽然不多，但是影响极大，对开发者来说杀伤性极强。

![SDK_kickout_myself.png](https://p1-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/6413d0ae144d4988880f425a3717b20d~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

最后，**this.fireEvent** 表示给上层业务发送一条**Kickout**的事件通知，当然这个通知是业务层提前注册进来的。

#### 主动退出

在用户主动调用logout断开长连接时，在SDK端就不能再走`重连`逻辑，我们来看下它的调用流程：

- `cli.logout()`

```ts
logout(): Promise<void> {
    return new Promise((resolve, _) => {
        if (this.state === State.CLOSEING) {
            return
        }
        this.state = State.CLOSEING
        if (!this.conn) {
            return
        }
        let tr = setTimeout(() => {
            log.debug("oh no,logout is timeout~")
            this.onclose("logout")
            resolve()
        },2000)
        this.closeCallback = async () => {
            clearTimeout(tr)
            await sleep(1)
            resolve()
        }
        log.info("Connection closing...")
        this.conn.close()
    })
}
```

因为JS引擎实际上是一个`单线程`在执行，所谓的异步逻辑其实就是`协程模式`，因此这里通过`this.state`状态的判断就可以防止重复调用问题，不用像后端一样总是要考虑**线程安全**问题。回到上面的方法中，代码块的最后调用了conn.close()关闭连接，JS引擎就会发送一条OpClose的Frame到服务端，之后就是正常的TCP四次挥手了。

> 不过在调用close()之前，我们注册了一个`closeCallback`回调函数。而且resolve()这个Promise的成功回调方法也是在closeCallback内部。`那么它在什么情况下被触发呢`，我们接着往下看。

当连接关闭完成之后，就会触发在`login()`方法中的`onclose`回调：
```ts
// 在KIMClient.login方法中
conn.onclose = (e: ICloseEvent) => {
    log.debug("event[onclose] fired")
    if (this.state == State.CLOSEING) {
        this.onclose("logout")
        return
    }
    this.errorHandler(new Error(e.reason))
}
```

如果是`CLOSEING`状态，就会直接调用`KIMClient.onclose`这个方法，执行真正的退出，而closeCallback方法，则是在这里被调用。
```ts
private onclose(reason: string) {
    if (this.state == State.CLOSED) {
        return
    }
    this.state = State.CLOSED
    log.info("connection closed due to " + reason)
    this.conn = undefined
    this.channelId = ""
    this.account = ""
    // 通知上层应用
    this.fireEvent(KIMEvent.Closed)
    if (this.closeCallback) {
        this.closeCallback()
    }
}
```

一个调用时序图如下所示：

![SDK_logout_seq.png](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/57f4c92fc34d4aba877f89b2d4a5ae88~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

当然，虽然我们希望能通过await cli.logout()正常断开，然后再去执行login方法。但是刷新浏览器时可不会管这个异步的逻辑。

- 测试用例：

```ts
test('clilogin', async () => {
    // test1
    const tags = ["web"]
    let cli = new KIMClient(gatewayURL, { token: tokens[0], tags });
    let { success, err } = await cli.login()
    expect(success).toBeTruthy()
    let callback = jest.fn((evt: KIMEvent) => {
        log.info("--------", evt)
    });
    cli.register([KIMEvent.Closed], callback)
    expect(cli.account).toEqual("test1")
    await cli.logout()
    await sleep(2)
    // Closed回调方法必须被调用一次
    expect(callback).toBeCalledTimes(1)
})
```

> 运行：`yarn test src/sdk.test.ts -t clilogin`

```yaml
Test Suites: 1 passed, 1 total
Tests:       6 skipped, 1 passed, 7 total
Snapshots:   0 total
Time:        6.208 s, estimated 7 s
```

**本章完！**