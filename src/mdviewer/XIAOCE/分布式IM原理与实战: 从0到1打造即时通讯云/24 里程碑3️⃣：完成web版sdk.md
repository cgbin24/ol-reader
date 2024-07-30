在上一章节，我们通过修改Demo示例，完成连接相关的登录退出等逻辑。本章节的核心就是`消息收发`及`离线同步`，其中也包括**消息可靠性**逻辑。

![chapter24.png](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/44c119eb4e8e4161bc6a6607eafd2c42~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

开源地址： [KIM TS SDK](https://github.com/klintcheng/kim_web_sdk) 求 Star~

![image.png](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/0269899492f0481bbdd7edcfc606199d~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

### SDK使用手册

#### Quick Start

在介绍本章节的内容之前，我们从三方开发的角度，来了解下SDK被调用的流程，这有助于我们构建出一个完整的逻辑图谱。首先，我们再次回顾下客户端的生命周期状态图，**在SDK端所有逻辑都离不开这个状态图**，非常重要。

![sdk_status.png](https://p9-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/ec4ee25597564dd2b17c14dd61e60ef2~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

那么，三方应用集成`KIM SDK`之后，一个简单的调用流程如下：
```ts
const tags = ["web"]
// 1. 初始化
let cli = new KIMClient(gatewayURL, { token: tokens[0], tags });

// 2. 注册监听器
let evts = [KIMEvent.Closed, KIMEvent.Reconnecting, KIMEvent.Reconnected, KIMEvent.Kickout]
cli.register(evts, eventcallback)
cli.onmessage(messagecallback)
cli.onofflinemessage(offmessagecallback)

// 3. 登录
let { success, err } = await cli.login()
if (!success) {
    log.error(err)
    return
}

// 4. 发送消息
let { status, resp, err: err2 } = await cli.talkToUser("test2", new Content("hello"))
if (status != Status.Success) {
    log.error(err)
    return
}
log.info(`resp - ${resp?.messageId} ${resp?.sendTime.toString()}`)

await sleep(10)

// 5. 登出
await cli.logout()
```

**我们主要了解下其中三个监听器：**

- **eventcallback**：事件监听器回调方法。在Client的生命周期图中，状态随着主动或被动的事件触发而发现改变。比如断线重连时两种状态`Reconnecting`和`Reconnected`，虽然SDK可能在几秒内就自动重连成功，但是这个变动过程还是要通知给上层，让业务决定是否显现给用户。

```ts
let eventcallback = (evt: KIMEvent) => {
    log.info(`event ${evt}`)
};
```

- **messagecallback**：用于接收`在线消息`的回调方法。

```ts
let messagecallback = (m: Message) => {
    log.info(m)
}
```

- **offmessagecallback**：`离线消息`回调方法。通常是**dologin**成功并且同步离线索引完成之后，才会回调给上层，如下是调用示例：

```ts
let offmessagecallback = (om: OfflineMessages) => {
    // 离线时的发送方用户列表
    let users = om.listUsers()
    if (users.length > 0) {
        log.info(`offline messages from users of ${users}`)
        // lazy load the first page messages from 'users[0]'
        let messages = om.loadUser(users[0], 1)
        log.info(messages)
    }
    // 离线的群列表
    let groups = om.listGroups()
    if(groups.length > 0) {
        log.info(`offline messages from groups of ${groups}`)
    }
}
```

`om.loadUser(users[0], 1)` 表示加载users[0]的第一页离线消息。

#### SDK初始化

接下来，我们进入SDK内部，简单了解下初始化相关的逻辑。如下所示：
```ts
export class KIMClient {
    wsurl: string
    private req: LoginBody
    state = State.INIT
    channelId: string
    account: string
    private conn?: w3cwebsocket
    private lastRead: number
    
    private listeners = new Map<string, (e: KIMEvent) => void>()
    private messageCallback: (m: Message) => void
    private offmessageCallback: (m: OfflineMessages) => void
    private closeCallback?: () => void
   
    constructor(url: string, req: LoginBody) {
        this.wsurl = url
        this.req = req
        this.lastRead = Date.now()
        this.channelId = ""
        this.account = ""
        this.messageCallback = (m: Message) => {
            log.warn(`throw a message from ${m.sender} -- ${m.body}\nPlease check you had register a onmessage callback method before login`)
        }
        this.offmessageCallback = (m: OfflineMessages) => {
            log.warn(`throw OfflineMessages.\nPlease check you had register a onofflinemessage callback method before login`)
        }
    }
    register(events: string[], callback: (e: KIMEvent) => void) {
        // 注册事件到Client中。
        events.forEach((event) => {
            this.listeners.set(event, callback)
        })
    }
    onmessage(cb: (m: Message) => void) {
        this.messageCallback = cb
    }
    onofflinemessage(cb: (m: OfflineMessages) => void) {
        this.offmessageCallback = cb
    }
}
```

这里需要说明的是，如果业务方不注册`messageCallback`或者`offmessageCallback`消息监听器，那么就会调用到构造函数中默认的监听器，并打印`Warn`报警信息到console中。而事件监听器，如果上层业务不需要，可以不注册。

> 接下正式进入消息收发处理逻辑中。

### 消息发送

#### 请求响应模式

在前面我们介绍过，我们设计的协议是一个全双工的通信协议，消息的发送与接收是没有一个固定时序的。而且一个Request消息与一个Response消息**通常在不同的方法中**。如果我们在底层不做处理，那么对上层应用使用就非常不友好。如下图：

![sdk_request.png](https://p9-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/0ed509924f8543b28bd82ddd87fad937~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

它导致的结果就是`请求`与`响应`要在两个方法中处理，编码非常不方便。因此，在SDK层我们需要对消息请求与响应做处理，达到类似于HTTP这种无状态的请求响应方式，变成如下调用方式：

![sdk_request_await.png](https://p6-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/d3ad5d00469742e0877c5a0aaa49e2c1~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

> 要达到这个效果，我们需要把`请求包Request`与`响应包Response`一一正确的关联起来，那么如何关联呢？

**通常有两种方法：**

- 请求包的顺序与响应包的顺序完全相同。
- 请求包与响应包具有相同的**唯一标识**。

相信读者已经看出来了，它就是我们在通信协议一章中所说，类似于`半双工`与`全双工`的两种协议的规则。而具体的实现逻辑在SDK端则又不相同，第一种可以利用一个FIFO(先进先出)的队列，实现请求与响应的关联：

![sdk_half_duplex .png](https://p9-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/133c10b7eb2a4443b8a606e025f2818a~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

那么，第二种情况全双工协议又是如何实现的呢，我们看代码：
```ts
export class KIMClient {
    ...
    // 全双工请求队列
    private sendq = new Map<number, Request>()
    async request(data: LogicPkt): Promise<Response> {
        return new Promise((resolve, _) => {
            let seq = data.sequence

            let tr = setTimeout(() => {
                // remove from sendq
                this.sendq.delete(seq)
                resolve(new Response(KIMStatus.RequestTimeout))
            }, sendTimeout)

            // asynchronous wait resp from server
            let callback = (pkt: LogicPkt) => {
                clearTimeout(tr)
                // remove from sendq
                this.sendq.delete(seq)
                resolve(new Response(pkt.status, pkt.dest, pkt.payload))
            }
            log.debug(`request seq:${seq} command:${data.command}`)

            this.sendq.set(seq, new Request(data, callback))  <-- 存储Request
            if (!this.send(data.bytes())) {
                resolve(new Response(KIMStatus.SendFailed))
            }
        })
    }
}
```

首先，要实现异步逻辑的同步调用，还是要借助`Promise`。其次，我们定义了一个`Map<number, Request>`用于存放请求，**类型于上图中队列的作用**。在调用send发送消息之前，我们会创建一个Request对象存放到sendq这个map中，它的键就是协议头中的`sequence`序号（客户端生成，自增）。当然，在这里`超时`逻辑也不能少，这个技巧在前面已经使用过多次，比如dologin。如下是Request对象：
```ts
export class Request {
    sendTime: number
    data: LogicPkt
    callback: (response: LogicPkt) => void
    constructor(data: LogicPkt, callback: (response: LogicPkt) => void) {
        this.sendTime = Date.now()
        this.data = data
        this.callback = callback
    }
}
```

接下来，就是等待**callback**被调用。它是在`packetHandler`这个消息**处理入口**中处理的。
```ts
private async packetHandler(pkt: LogicPkt) {
    log.debug("received packet: ", pkt)
    ...省略
    if (pkt.flag == Flag.Response) {
        let req = this.sendq.get(pkt.sequence)
        if (req) {
            req.callback(pkt)
        } else {
            log.error(`req of ${pkt.sequence} no found in sendq`)
        }
        return
    }
    ...省略
}
```

在逻辑服务的`指令处理器`中，一条响应消息Header中的sequence属性就是从请求包复制过来。因此在这里，可以通过`pkt.sequence`从**sendq**中取出**Request**对象。然后执行req.callback(pkt)，**忘记callback实现逻辑**的读者可以往上看。它最终会生成一个`Response`返回给调用方，而Response中的属性都是来自`LogicPkt`，只不过做了减法。
```ts
export class Response {
    status: number
    dest?: string
    payload: Uint8Array
    constructor(status: number, dest?: string, payload: Uint8Array = new Uint8Array()) {
        this.status = status;
        this.dest = dest;
        this.payload = payload;
    }
}
```

> 最后，调用方式如下：

```ts
let resp = await this.request(req)
```

#### 聊天消息

完成底层的消息封装之后，我们就可以在它的基础上实现任何`指令的发送`了。接下来，我们实现**单聊**与**群聊**的消息发送，由于它们的消息格式是相同的，因此在这里可以先封装一个`底层方法 talk`：
```ts
private async talk(command: string, dest: string, req: MessageReq, retry: number): Promise<{ status: number, resp?: MessageResp, err?: ErrorResp }> {
    let pbreq = MessageReq.encode(req).finish()
    for (let index = 0; index < retry + 1; index++) {
        let pkt = LogicPkt.build(command, dest, pbreq)
        let resp = await this.request(pkt)    <-- 发送请求，并等待响应结果
        if (resp.status == Status.Success) {
            return { status: Status.Success, resp: MessageResp.decode(resp.payload) }
        }
        if (resp.status >= 300 && resp.status < 400) {
            // 消息重发
            log.warn("retry to send message")
            await sleep(2)
            continue
        }
        let err = ErrorResp.decode(resp.payload)
        return { status: resp.status, err: err }
    }
    return { status: KIMStatus.SendFailed, err: new Error("over max retry times") }
}
```

在这个方法中，有两个关键之处：

- `重试次数`：重试次数是由上层调用时给出。
- `状态码规则`：**它是服务端与SDK约定的一个返回状态码规则**；通过这个规则SDK的逻辑就非常明确，而且以后扩展状态码也无需SDK变更逻辑。其中，返回状态码为`[300, 400)`（前开后闭）表示SDK可以尝试消息重发。

##### 给用户发消息

```ts
/**
* 给用户dest发送一条消息
* @param dest 用户账号
* @param req 请求的消息内容
* @returns status KIMStatus|Status
*/
async talkToUser(dest: string, req: Content, retry: number = 3): Promise<{ status: number, resp?: MessageResp, err?: ErrorResp }> {
    return this.talk(Command.ChatUserTalk, dest, MessageReq.fromJSON(req), retry)
}
```

##### 给群发消息

```ts
/**
 * 给群dest发送一条消息
 * @param dest 群ID
 * @param req 请求的消息内容
 * @returns status KIMStatus|Status
 */
async talkToGroup(dest: string, req: Content, retry: number = 3): Promise<{ status: number, resp?: MessageResp, err?: ErrorResp }> {
    return this.talk(Command.ChatGroupTalk, dest, MessageReq.fromJSON(req), retry)
}
```

### 消息接收

接下来，我们了解下`在线推送`、`消息ACK`及`离线同步`等逻辑。这里涉及到消息的**可靠投递**相关的逻辑，因此如果读者看不太明白，建议复习一下前面的**20、21章节**的内容。

#### 离线消息

离线消息在前面已经提到过很多次了，因此这里直接上代码，如下：
```ts
private async loadOfflineMessage() {
    log.debug("loadOfflineMessage start")
    // 加载消息索引
    let loadIndex = async (messageId: Long = Long.ZERO): Promise<{ status: number, indexes?: MessageIndex[] }> => {
        let req = MessageIndexReq.encode({ messageId })
        let pkt = LogicPkt.build(Command.OfflineIndex, "", req.finish())
        let resp = await this.request(pkt)
        if (resp.status != Status.Success) {
            let err = ErrorResp.decode(pkt.payload)
            log.error(err)
            return { status: resp.status }
        }
        let respbody = MessageIndexResp.decode(resp.payload)
        return { status: resp.status, indexes: respbody.indexes }
    }
    
    let offmessages = new Array<MessageIndex>();
    let messageId = await Store.lastId()                    <-- 本地存储读取最后一条消息。
    while (true) {
        let { status, indexes } = await loadIndex(messageId)
        if (status != Status.Success) {
            break
        }
        if (!indexes || !indexes.length) {
            break
        }
        messageId = indexes[indexes.length - 1].messageId  <-- 重置ACK_ID
        offmessages = offmessages.concat(indexes)
    }
    log.info(`load offline indexes - ${offmessages.map(msg => msg.messageId.toString())}`)
    let om = new OfflineMessages(this, offmessages)
    this.offmessageCallback(om)                          <-- 回调给上层业务。
}
```

这里有三个关键点：

1. `Store.lastId()` 从本地存储读取最后一条`ACK消息的ID`。
2. `this.offmessageCallback(om)` 同步完索引之后，就可以回调给上层业务了，**无须加载消息内容**。
3. `loadIndex(messageId)` 最少执行一次，最多执行`N+1`次，N表示总页数。

> 需要说明的是，由于我们**没有把消息存储在浏览器数据库中**。因此，离线消息保存在了`内存中`，它就是`OfflineMessages`对象。

我们简单看下OfflineMessages的实现，主要分为两步：

1. 对未读消息**分组**。
2. 提供分页加载未读消息的方法。

```ts
export class OfflineMessages {
    private cli: KIMClient
    private groupmessages = new Map<string, Message[]>()
    private usermessages = new Map<string, Message[]>()
    constructor(cli: KIMClient, indexes: MessageIndex[]) {
        this.cli = cli
        // 通常离线消息的读取是从下向上，因此这里提前倒序下
        for (let index = indexes.length - 1; index >= 0; index--) {
            const idx = indexes[index];
            let message = new Message(idx.messageId, idx.sendTime)
            if (idx.direction == 1) {
                message.sender = cli.account
                message.receiver = idx.accountB
            } else {
                message.sender = idx.accountB
                message.receiver = cli.account
            }

            if (!!idx.group) {
                if (!this.groupmessages.has(idx.group)) {
                    this.groupmessages.set(idx.group, new Array<Message>())
                }
                this.groupmessages.get(idx.group)?.push(message)
            } else {
                if (!this.usermessages.has(idx.accountB)) {
                    this.usermessages.set(idx.accountB, new Array<Message>())
                }
                this.usermessages.get(idx.accountB)?.push(message)
            }
        }
    }
    async loadUser(account: string, page: number): Promise<Message[]> {
        let messages = this.usermessages.get(account)
        if (!messages) {
            return new Array<Message>();
        }
        let msgs = await this.lazyLoad(messages, page);
        return msgs
    }
    async lazyLoad(messages: Array<Message>, page: number): Promise<Array<Message>> {
        let i = (page - 1) * pageCount
        let msgs = messages.slice(i, i + pageCount)
        log.debug(msgs)
        if (!msgs || msgs.length == 0) {
            return new Array<Message>();
        }
        if (!!msgs[0].body) {
            return msgs
        }
        //load from server
        let { status, contents } = await this.loadcontent(msgs.map(idx => idx.messageId))
        if (status != Status.Success) {
            return msgs
        }
        log.debug(`load content ${contents.map(c => c.body)}`)
        if (contents.length == msgs.length) {
            for (let index = 0; index < msgs.length; index++) {
                let msg = msgs[index];
                let original = messages[i + index]
                let content = contents[index]
                Object.assign(msg, content)
                Object.assign(original, content)
            }
        }
        return msgs
    }
    ...省略。
}
```

它提供了6个方法：

- `listGroups(): Array<string>` ：获取离线消息群列表。
- `listUsers(): Array<string>`：获取离线消息用户列表。
- `getGroupMessagesCount(group: string): number`：获取指定群的离线消息数量。
- `getUserMessagesCount(account: string): number`：获取指定用户的离线消息数量。
- `loadGroup(group: string, page: number): Promise<Message[]>`：分页加载群离线消息，包括消息内容。
- `loadUser(account: string, page: number): Promise<Message[]>`： 分页加载用户离线消息，包括消息内容。

> 详细的逻辑就不介绍了，读者可以直接看代码。

如下是使用SDK加载`5000`条离线消息耗时的测试：包括登录时间一共是`339ms`。

- 服务器配置： `1核`、`2G内存`、`华为云服务`。
  - 运行了KIM所有服务（包括Mysql、Redis、Consul等）。

```ts
console.info
    load offline messages cost: 339  ms

      at src/sdk.test.ts:183:13
```

#### 消息接收

我们再次回到packetHandler方法中，在消息接收的Handler中实现了三个`核心功能`：

1. 有计划的`重新登录`，基于前面介绍的状态码规则。
    - 即当服务端返回一个大于400的状态时，SDK就会主动退出并重新登录。
2. Response响应类消息处理。
    - 在上面已经介绍过。
3. Push消息的处理。

我们主要关注Push消息就是`ChatUserTalk`和`ChatGroupTalk`。
```ts
private async packetHandler(pkt: LogicPkt) {
    log.debug("received packet: ", pkt)
    if (pkt.status >= 400) {
        log.info(`need relogin due to status ${pkt.status}`)
        this.conn?.close()
        return
    }
    if (pkt.flag == Flag.Response) {
        let req = this.sendq.get(pkt.sequence)
        if (req) {
            req.callback(pkt)
        } else {
            log.error(`req of ${pkt.sequence} no found in sendq`)
        }
        return
    }
    switch (pkt.command) {
        case Command.ChatUserTalk:
        case Command.ChatGroupTalk:
            let push = MessagePush.decode(pkt.payload)
            let message = new Message(push.messageId, push.sendTime)
            Object.assign(message, push)
            message.receiver = this.account
            if (pkt.command == Command.ChatGroupTalk) {
                message.group = pkt.dest
            }
            if (!await Store.exist(message.messageId)) {    <-- 幂等判断
                // 确保状态处于CONNECTED，才能执行消息ACK
                if (this.state == State.CONNECTED) {
                    this.lastMessage = message              <-- 标记最后一条消息
                    this.unack++
                    try {
                        this.messageCallback(message)       <-- 消息回调给上层
                    } catch (error) {
                        log.error(error)
                    }
                }
                // 消息保存到数据库中。
                await Store.insert(message)
            }
            break;
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

在这里，我们对消息做了简单存储，并做了**幂等**处理。重点说明的是这里会有一个`状态判断`，只有当前客户端处理State.CONNECTED时，才会给lastMessage（用于消息ACK）赋值并把消息回调给调用方，要理解这个逻辑，我们要从这张图说起：

![sdk_offline_state_gant.png](https://p9-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/91902d36e9bc42df94903cea2e794d6b~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

在这张图中，标识了`客户端状态`与`逻辑`的**时序关系**。可以看到packetHandler是在登录成功之后开始的，此时已经可以接收到服务端Push过来的`在线消息`（假如刚好有好友给你发了一条消息）；但是在这个时间段（之后统称`同步状态`），不能回复消息ACK，也不能回调给上层业务。

- `不能ACK`是因为此时正在执行 **loadOfflineMessage(**) 同步离线消息，在前面**消息存储章节**我们介绍过服务端的读索引是不区分在线还是离线的，因此在加载离线的过程中，如果服务端`读索引`被**当前在线消息**的ACK请求所重置，那么这条消息之前的离线消息就可能会丢失。
- `不能回调给调用方`是因为离线消息还未同步完成，此时回调给业务层，被显示到界面中只会让用户产生误解。

因此，在`离线同步的状态`下**在线消息**最终也会被当作**离线消息**返回，这里有两层可靠性来保存消息会落到离线队列中：

1. 其一，因为消息在服务端Push之前**已经保存在离线队列中**，因此同步离线消息索引时，会把它也同步下来，无论这条消息是先被同步索引下载到SDK，还是先被Push到SDK，最终都是被存储在`本地数据库中`，虽然在Web端还没有实现完整的`消息存储`功能。
2. **在极端情况下**，离线同步在最后一次ACK请求（`Command.OfflineIndex`）到达`Royal`服务，并完成`读索引`的重置之后，发送给此用户的一条`新消息`完成DB存储并且在这条ACK消息的Response返回到SDK之前，提前到达SDK，在这种情况下SDK客户端的状态还不是**CONNECTED**，因此这条消息会被存储到本地数据库中，它也会被当作离线消息返回给上层。

![sdk_sync_exception.png](https://p9-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/90f795ef0ed747e3a044e75edf575717~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

> 虽然逻辑上说这个`同步状态`看似很复杂，但是在上面我们也测试过了，在使用一台非常低配置的测试环境下，5千条离线消息，`同步状态`也只有339ms，在真实环境中只会更短，90%的情况可能`50ms`不到。

最后，我们来看看`Store`的实现：
```ts
class MsgStorage {
    private keymsg(id: Long): string {
        return `kim_msg_${id.toString()}`
    }
    private keylast(): string {
        return `kim_last`
    }
    // 记录一条消息
    async insert(msg: Message): Promise<boolean> {
        await localforage.setItem(this.keymsg(msg.messageId), msg)
        return true
    }
    // 检查消息是否已经保存
    async exist(id: Long): Promise<boolean> {
        try {
            let val = await localforage.getItem(this.keymsg(id))
            return !!val
        } catch (err) {
            log.warn(err);
        }
        return false;
    }
    async get(id: Long): Promise<Message | null> {
        try {
            let message = await localforage.getItem(this.keymsg(id))
            return <Message>message
        } catch (err) {
            log.warn(err);
        }
        return null
    }
    async setAck(id: Long): Promise<boolean> {
        await localforage.setItem(this.keylast(), id)
        return true
    }
    async lastId(): Promise<Long> {
        let id = await localforage.getItem(this.keylast())
        return <Long>id || Long.ZERO
    }
}

export let Store = new MsgStorage();
```

逻辑很简单，主要是为了方便读者理解它实现了什么功能。可以看到，它是采用`localforage`库来存储数据，如下是它的简介：

![image.png](https://p1-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/86e8923e42e045f28ff63d4e56694c57~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

#### 消息ACK

消息ACK是`保证消息不丢失`的核心逻辑。那么我们看下在`messageAckLoop`中有那些逻辑：
```ts
private messageAckLoop() {
    let start = Date.now()
    const delay = 500 //ms
    let loop = async () => {
        if (this.state != State.CONNECTED) {
            log.debug("messageAckLoop exited")
            return
        }
        let msg = this.lastMessage // lock this message
        if (!!msg && (Date.now() - start > 3000)) {
            let overflow = this.unack > 10
            this.unack = 0 // reset unack before ack
            this.lastMessage = undefined //reset last message

            let diff = Date.now() - msg.arrivalTime
            if (!overflow && diff < delay) {
                await sleep(delay - diff, TimeUnit.Millisecond)
            }
            let req = MessageAckReq.encode({ messageId: msg.messageId })
            let pkt = LogicPkt.build(Command.ChatTalkAck, "", req.finish())
            start = Date.now()
            this.send(pkt.bytes())
            // 修改本地存储中最后一条ACK消息记录
            await Store.setAck(msg.messageId)
        }
        setTimeout(loop, 500)
    }
    setTimeout(loop, 500)
}
```

其中，`lastMessage`与unack的值是在packetHandler方法中被修改的。
```ts
this.lastMessage = message              <-- 标记最后一条消息
this.unack++
```

这个方法的核心作用就是间隔3000ms左右给服务端发送一条`Ack`消息，当然前提是`this.lastMessage`不为空。但是在这个基础之上，我们做了一个可靠性逻辑，也就是提前**锁定lastMessage**，并且判断这条消息到达SDK的时间距离当前时间是否超过了`500ms`，如果小于500ms就`休眠`（delay - diff）。

> 那么为什么要Delay 0.5秒之后再ACK呢？

![sdk_ack_space_time.png](https://p6-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/a166bd109bb44f3a88d9774c19d6921a~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

要回答这个问题，我们要看一种较极端的情况：还是以上图为例，假设Message2比Message3`慢`到达SDK端，然后SDK发送了一条Message3的ACK给服务端，不巧的是连接也马上断开，此时Message2还未达到，但是服务端的**离线读索引**已经被设置为3，因此即使下次同步离线消息，Message2也不会被同步过来，也就丢失了。如下图所示：

![sdk_ack_msg_lost.png](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/f9ed59a842cd49138d166735a76f914f~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

看上图，**假设我们的服务部署在一个机房**，那么SDK到Gateway与Gateway到Chat的`传输时长`大致就是上面的样子。在全局时钟正常的情况下，要出现消息丢失的情况，需要的条件就是:

- `T1` > `T2+T3+T4`

如果对TCP的四次挥手有一定了解就应该知道，在正常情况下客户端主动关闭连接时，如果服务端TCP缓冲中还有消息未发送完毕，服务端也会在传输完成才后才发送**FIN包**给客户端关闭连接。也就是说正常退出情况下，`Message2`到达`网关`之前，SDK已经完成了ACK，并且客户端与服务端已经断开连接，那么这条消息就会在网关被`丢弃`，导致`Message2`消息丢失。

即使连接是异常断开，比如浏览器被关闭，要达到丢失Message2的条件至少也是：

- `T1` > `T2+T3`

> 注意：`T1`的时间还只是Chat到Gateway的传输时间，加上在Gateway中的处理时间。当然这些逻辑的前提是服务端没有Bug，比如在网关中把`Message2`搞丢了。

如果说这个条件还不算严苛，那么我们加上delay的500ms（未ACK消息不超过10条时），消息丢失的条件就是：

- `T1` > `T2+T3+T4?+500ms`

这种情况下，几乎是不可能因为消息的**后发先至**，并且刚好遇到SDK退出，导致消息丢失。

> 这同时是为什么我们在服务端，使用`发送时间`而不是`消息ID`作为离线消息过滤条件的原因了。

![sdk_msg_global_clock.png](https://p9-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/6e38a26f93ea4cb39d1d08bb7f218541~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

如上图，虽然三条消息的发送时间（在KIM服务端精度是`纳秒`）是保证了时序的，但由于我们使用的雪花算法，它采样时间的精度是`毫秒`，在群集环境中，高并发消息测试时有`极大可能`会出现上面的情况。而且采用发送时间也不会增加复杂度。

### 最后总结

要达到百分百的消息可靠是不可能的，但是我们至少在实现理论上没有太多的漏洞，同时编码时没有致命的bug，一般消息都可以达到非常高的可靠性。最后我们通过下图梳理下整个SDK的时序流程。

![sdk_state_gant.png](https://p1-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/06d8276d5cdf4101bd48a98a7841d646~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

好像忘了介绍`群管理`，算了，读者自行看源码吧~

**本章完！**