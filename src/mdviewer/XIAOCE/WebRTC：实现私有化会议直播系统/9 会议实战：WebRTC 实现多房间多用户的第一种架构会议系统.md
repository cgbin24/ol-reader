到了这节课，想必大家对 `WebRTC` 已经有基础的了解了。毕竟从点对点视频通话到小型直播都已经熟悉了它的核心用法，`WebRTC`给大家的初步印象已经形成：即通过信令交换在各自的客户端形成 `P2P` 双向关联，然后发送双方的媒体信息。

无论是点对点音视频还是直播，都是通过 P2P 的方式形成关联关系，而接下来的多对多会议也是一样，无非就是**每个客户端都去和会议室中的每个用户建立关联**， 从而拿到对方的媒体信息。

接下来，我会再用一个例子给大家演示下如何用`WebRTC`实现会议系统。

### 流程分析

假设有A、B、C、D四个人需要参会，但是WebRTC仅支持 `P2P` ，那么 A 如果要和剩下的三个人视频通话，就必须和他们三个人都建立关联，也就是形成`A-B`，`A-C`，`A-D`的关联关系。

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/6339a4b047a247688b9f789378c0df5a~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

看上图所示，只有建立关联关系之后，A 才能将自己的视频流发给 B、C、D 三个人，同时也才能收到其余三个人的视频画面。但是注意看，A 和其余三个人形成视频通话，但是其余三人之间并没有相互关联。

也就是说，现在这个方案只是达成了 1 对多 的场景（前面的课程中的直播场景）。那么如何让其余三个人之间也形成互通呢？

同理，看上图的 B，和 A 一样重新建立关联关系，**只不过变成 B 为主体，剩下的A、C、D为被关联对象进而形成`B-A`，`B-C`，`B-D`的关联关系**。但是这时你会发现，A-B 和 B-A 不是重复了吗？

是的，所以在这里，我们相当于在代码层面维护重复判断，假如已经建立关联关系，那么后续就不再重新建立新的关联关系了。

从`WebRTC`的核心载体`PeerConnection`上来讲，上述的关联关系代表的就是这个核心载体，一对关联关系代表一个核心对象，**`A-B` 这一关系从代码层面上来描述 ， 实际就是创建一个`PeerConnection`对象，这个对象中维护的是 A 和 B 之前的`sdp信令` 和媒体信息（反复提及的核心）** 。

有了以上概念上的转换，我相信对于前面图中表达的意思，大家也就理解差不多了，为了更清晰，这里我再用代码层面的`PeerConnection`对象来解释上图中的关系：

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/c0626fa67c8b44898b9de2f1c3db16f6~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

首先 A 客户端需要和其余三个客户端通信，按照上述关系和`WebRTC`的会话流程，我们就需要创建三个`PeerConnection`对象来作为会话信令的载体，然后客户端还需要储存下这三个变量。这里为了操作方便，我们将其放置在`Map`数据结构中，`key`按照用户的 ID 组合成变量名，那么 A 和 B、C、D 关联关系储存方式如下：
```js
// A：10001 B：10002 C：10003 D：10004 分别代表四个客户端的用户ID
var RtcPcMaps = new Map()
const ABKeys = 10001-10002
const ACKeys = 10001-10003
const ADKeys = 10001-10004
RtcPcMaps.set(ABKeys , new PeerConnection()) //维护A-B关系
RtcPcMaps.set(ACKeys , new PeerConnection()) //维护A-C关系
RtcPcMaps.set(ADKeys , new PeerConnection()) //维护A-D关系
```

这样子是不是很清晰了，而对于被关联方 B、C、D 端同上述操作，只不过仅维护和 A 的关系，例如 B：
```js
var RtcPcMaps = new Map()
const BAKeys = 10002-10001
RtcPcMaps.set(BAKeys , new PeerConnection()) //维护B-A关系
```

在 B 端这边，细心的同学可能发现了，这里我们定义的变量为 `BAKeys` ，即`B-A`，在 A 端明明是A-B，在这里为什么关系反了呢？

这里大家其实可以思考下，如果 B 端我作为主体方，即 P2P 的发起方，那么和上图中的 A 一样，我也需要创建三个关联关系 B-A、B-C、B-D，此时 B-A 就和 A-B 关系重叠了，在代码层面实际上它俩就是同一对关联。

所以，为了维护代码层面的简洁性和逻辑直观性，我们可以适当优化下，**P2P 发起方变量命名和 P2P 接受方变量命名 ， 按照自己客户端拼接对方客户端的形式**（A 和 B 建立关联，在 A 端就是 A-B 变量维护，在 B 端就是 B-A 变量维护） 。

再接着前面的代码，B 现在只维护了一份和 A 的关系，但是为了实现会议的效果，B 必须和 C、D 继续形成关联关系，所以此时 B 这边：
```js
//由于前面A已经和B建立关联关系因此在后续B这边不再重新发起和A的关联关系
const BCKeys = 10002-10003
const BDKeys = 10002-10004
RtcPcMaps.set(BCKeys , new PeerConnection()) //维护B-C关系
RtcPcMaps.set(BDKeys , new PeerConnection()) //维护B-D关系
```

虽然看起来很绕，但是如果我们理清楚这个逻辑，实际实现起来和 P2P 的流程一样，很简单。先看看下图，第一个就是我们前面所说的独立关联关系，第二个是美化后以及代码层面优化后的流程（即已建立关联后不再重新建立新的关联）。

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/3d9eacd63b3d412d820b4191abed50fd~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

如果能明白上面的逻辑，那么我们就理解了`WebRTC`架构中最简单的，维护最方便的 `Mesh 架构`。这种架构不需要经过任何流媒体服务器，端对端的就可以直接实现多人视频通话，虽然简单，但是也有它的缺点，那就是**昂贵的宽带，下一节我们会深入讨论。**

### 代码实战

我们按照下面动图流程来：

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/982996d57d60415d806fd82fe73d4b24~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

1. A 进入会议室：初始化信令服务器连接，然后初始化房间，如果房间中没有人，则仅获取本地媒体流并将其展示在已初始化好的 `DOM 节点` 。

> roomUserList 变量为房间用户，获取全部用户后，剔出自己，然后看有无其他用户加入房间。
```js
//初始化服务器连接
this.linkSocket = io(this.$serverSocketUrl, {
    reconnectionDelayMax: 10000,
    transports: ["websocket"],
    query: that.formInline
});

//
async initMeetingRoomPc(){
    const that = this
    if(!this.localStream){
            this.localStream = await this.getLocalUserMedia()
            //开始静音和关闭摄像头
            this.initMediaStatus()
    }
    this.setDomVideoStream("localdemo01",this.localStream)
    const localUid = this.formInline.userId
    let others = this.roomUserList.filter(e => e.userId !== localUid).map((e,index) =>{return e.userId})
    //others  为空不再进行后面的,
```

2. B 用户同上：先初始化，然后获取房间用户列表。与此同时，本地获取自己的媒体流。但是与上面 A不同的是，B 加入后，A 已经在房间中，因此接下来就是 B 和 A 创建 `RTC 关联`。创建流程我们不再阐述，和之前 `P2P` 以及直播都一样，无变化。
```js
async initMeetingRoomPc(){
        const that = this
        if(!this.localStream){
                this.localStream = await this.getLocalUserMedia()
                //开始静音和关闭摄像头
                this.initMediaStatus()
        }
        this.setDomVideoStream("localdemo01",this.localStream)
        const localUid = this.formInline.userId
        let others = this.roomUserList.filter(e => e.userId !== localUid).map((e,index) =>{return e.userId})
        //others 不为空 里面有 A用户 
        others.forEach(async (uid) => {
                let pcKey = localUid+'-'+uid
                let pc = RtcPcMaps.get(pcKey)
                if(!pc){
                        pc = new PeerConnection(that.rtcPcParams)
                        RtcPcMaps.set(pcKey,pc)
                }
                for (const track of that.localStream.getTracks()) {
                    pc.addTrack(track);
                }
                //创建offer
                let offer = await pc.createOffer({iceRestart:true});
                //设置offer未本地描述
                await pc.setLocalDescription(offer)
                //发送offer给被呼叫端
                let params = {"targetUid":uid,"userId":localUid,"offer":offer}
                that.linkSocket.emit("offer",params)
                that.onPcEvent(pc,localUid,uid)
        })
},
```

3. C 用户进入会议室：初始化服务连接，获取房间用户，同时本地媒体流获取和预览。但房间中有 A 和 B，因此和 B 步骤一样。
    - C 和 A 创建 `RTC 关联`。
    - C 和 B 创建 `RTC 关联`。

**根据 上面的步骤 ， 我们就可以还原如下流程了 。 在整个房间人员变动中，无论如何 ， 新进来的用户都会去和房间内的其他人进行 RTC 关联 ， 并实现新用户媒体流广播，从而达到我们这节课的目的：Mesh 架构的会议系统。**

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/446c9f407dfe43f78e70bbf0f68c1891~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

### 项目操作指南

1. 打开项目，找到模块：多对多网络视频。

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/b0c824986c07415fa53f24823e950585~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

2. 点击进去后首先会显示填写基础信息，要体验会议那么要加入的用户必须在同一个房间；此外，请大家注意下面图中的`身份ID`，它默认获取的是当前浏览器的指纹，因此如果在同一个浏览器不同标签页访问页面当前页面时`身份ID`都是一样的。**为了避免这个问题请大家注意我访问的时候携带的参数，这个参数优先于浏览器指纹且手动指定**，这样就可以避免不同用户`身份ID`一样造成加入会议失败的情况。

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/78f1e056d40f4912947869b86310aaf5~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

3. 用不同的身份ID，但是`同一个房间号`进入会议室。

### 完整代码地址

[本节课相关代码仓库地址](https://github.com/wangsrGit119/suke-webrtc-course/blob/main/webrtc-link-demo/src/views/demo03-many2many.vue)

### 课后题

在本地启动成功并模拟会议成功后，请大家尝试部署到`区域网`的某个主机上，然后通过区域网进行多人会议看看效果如何，有问题大家留言一起讨论。