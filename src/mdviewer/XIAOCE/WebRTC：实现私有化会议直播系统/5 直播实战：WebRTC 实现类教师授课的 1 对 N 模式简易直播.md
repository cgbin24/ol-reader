前面课程，我们完成**一对一的视频通话**后，大体上熟悉了`WebRTC`的基本用法以及它的会话流程。`WebRTC`的本质就是 P2P，即点对点的即时通讯，而这节课我们的目标是学会如何完成 1 对多的会话模式。

### 基础构思

在开始之前，我们先熟悉下这个最简单的讲课场景，首先看下图模拟场景，T 作为老师，需要将自己的画面实时地发送给下面的三个学生，但是学生却不需要将自己的画面同步给老师，而仅仅是在需要反馈的时候给予老师反馈即可。

说到这里，大家很明确这个场景实际就是一个小型直播，而我们这节课的目标也由此可以转变为“`WebRTC`实现简易直播系统”。

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/e73bb4c9ccd34f4084d76a1c70660c2a~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

场景和目标清晰了，接下来就是构思和实战了。

`WebRTC`实现 P2P 视频通话以及 IM 大家都没问题，那么对于解决我们的目标而言都不成问题。T和 S-1 、S-2、S-3 单独完成视频通话和普通消息发送都没问题，那怎么实现一次性同时和三个学生建立通话呢？

很简单，老师 T 和他们三个单独建立视频通话后，将关联关系都保存在本地不就可以？

前面我们反复提到过`WebRTC`的核心就是`PeerConnection`对象，任何建立视频通话的双方都离不开这个对象，因为这里面包含连接双方的核心协商数据。所以只要 T 和三个学生建立关联关系时，都维护一份独立的`PeerConnection`对象即可。

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/fc2f4c602d154d98b2ddab4bcc06e89f~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

如上图，老师端保存三分独立的`PeerConnection`对象，而学生端只需要保存自己和老师的关联信息，即一份核心对象。用代码描述如下：

**老师端**
```js
// T：9999 S-1：10001 S-2：10002 S-3:10003 分别代表上面流程图中的师生
var RtcPcMaps = new Map()
const TS01= 9999 -10001
const TS02= 9999 -10002
const TS03= 9999 -10003
RtcPcMaps.set(TS01, new PeerConnection()) //维护T-S-1关系
RtcPcMaps.set(TS01, new PeerConnection()) //维护T-S-2关系
RtcPcMaps.set(TS01, new PeerConnection()) //维护T-S-3关系 
```

在老师 T 收到学生 S 需要关联的“意向”后，创建三个`PeerConnection`核心对象，去维护三分关系，然后将其保存在本地的集合中。

**学生端S-1**
```js
//S-1：10001 
var RtcPcMaps = new Map()
const S01T= 10001-9999 
RtcPcMaps.set(S01T, new PeerConnection()) //学生维护和老师的关联
```

**学生端S-2**
```js
//S-2：10002
var RtcPcMaps = new Map()
const S02T= 10002-9999 
RtcPcMaps.set(S02T, new PeerConnection()) //学生维护和老师的关联
```

**学生端S-3**
```js
//S-3：10003
var RtcPcMaps = new Map()
const S03T= 10003-9999 
RtcPcMaps.set(S03T, new PeerConnection()) //学生维护和老师的关联
```

可以很清晰地看到，在学生端只需要维护一份和老师的关系即可，在建立关联之后，将老师的直播流拉取，然后在本地展示。

而老师端相对复杂些，需要维护 3 份关系，如果学生有 50 个的话，那么对象关联就需要创建 50 个，因此对于直播老师端而言，人数越多，需要维护的关联关系也就越多，同时需要给每个关系发送音视频媒体流。人数越多，宽带压力也随之而来，相关的配置我们在《[02 | Web端基础API学习](https://juejin.cn/book/7168418382318927880/section/7171376753263247396)》中概述了一些，具体消耗的宽带计算方式，我们在后面讲《[11 | 会议优化：WebRTC 通话过程中宽带计算及网络速率优化](https://juejin.cn/book/7168418382318927880/section/7172208545956364318)》中会详细的介绍。

### 实战

有了上面的大体构思和基础伪代码，接下来我们看看，从老师直播到学生观看直播，这整个过程我们架构上的整体设计。

首先，老师讲课学生听课，实际上就是在一个房间，老师在黑板书写，而学生看黑板。类比于网络，我们可以将这个房间“搬”到云上，老师在云房间直播，观众在云房间看直播。

所以，实际上我们整体的架构设计，就是围绕一个“云房间”展开，在云房间中观众和老师互动。

但是，问题来了，同一个房间中有老师和学生，那么如何区分老师和学生的身份呢？这就是我们架构设计上的第一个重点，那就是加入这个房间后，所有用户的身份标识。有了标识，后面加入的学生才知道和哪个有老师身份的用户进行`WebRTC`关联。

看下面客户端代码：
```js
this.formInline.nickname = getParams("nickname");
this.formInline.roomId = getParams("roomId");
this.formInline.userId = getParams("userId");
this.formInline.pub = getParams("pub")? getParams("pub") : 'no';
if(this.formInline.nickname && this.formInline.roomId && this.formInline.userId){
        this.init()//连接服务器
}
```

客户端携带加入房间的基础信息，有基础用户信息和 pub 这个身份信息，服务端接受这个参数后，将其保存在房间缓存信息中：

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/5bc34dbbc5b143df86a1c511e4acf070~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

**老师 T 端**作为发布者，在加入房间后就需要发布自己的直播流，此时还没有任何学生和他建立连接。
```js
//?userId=9999&roomId=10013&nickname=S&pub=pub
initMeetingRoomPc(){
    if(that.formInline.pub === 'pub'){
            this.localStream = await this.getLocalUserMedia()
            //将本地直播流挂到video标签，在自己的页面显示
            this.setDomVideoStream("localdemo01",this.localStream)
    }
}
```

**学生 S 端**进入房间后，首先获取用户列表，获取到用户列表后找到老师，和老师建立WebRTC连接。
```js
//userId=1001&roomId=10013&nickname=S-01
const localUid = this.formInline.userId
//找到当前房间的视频流发布者 即主播
let publisher = this.roomUserList.filter(e => e.userId !== localUid && e.pub === 'pub').map((e,index) =>{return e.userId})
if(publisher.length >0){
        publisher = publisher[0]
}else{
        return;
}
//和发布者建立RTC连接 不发送自己视频流
let pcKey = localUid+'-'+publisher
console.log("pcKey",pcKey);//1001-9999  S-1：1001和老师9999  
let pc = RtcPcMaps.get(pcKey)
if(!pc){
    pc = new PeerConnection(that.rtcPcParams)
    RtcPcMaps.set(pcKey,pc)
}
pc.addTransceiver("audio", {direction: "recvonly"});
pc.addTransceiver("video", {direction: "recvonly"});
//创建offer
let offer = await pc.createOffer();
//设置offer未本地描述
await pc.setLocalDescription(offer)
//发送offer给被呼叫端
let params = {"targetUid":publisher,"userId":localUid,"offer":offer}
that.linkSocket.emit("offer",params)
//监听相关事件 比如老师的应答信令，视频流等等
that.onPcEvent(pc,localUid,publisher)
```

**老师 T 端**，收到学生的关联意向之后，①创建关联关系并保存；②添加监听；③将视频流添加到媒体轨道；④发送应答。
```js
async onRemoteOffer(fromUid,offer){
        const localUid = this.formInline.userId
        let pcKey = localUid+'-'+fromUid
        let pc = new PeerConnection(this.rtcPcParams)
        RtcPcMaps.set(pcKey,pc)
        console.log("老师监听到远端WebRTC意向",pc);
        this.onPcEvent(pc,localUid,fromUid)
        for (const track of this.localStream.getTracks()) {
            pc.addTrack(track);
        }
        pc.setRemoteDescription(offer)
        let answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        let params = {"targetUid":fromUid,"userId":localUid,"answer":answer}
        this.linkSocket.emit("answer",params)
}
```

以上就是教师授课直播的实战流程，其他的直播场景类比于此，都是一样的，老师即为主播，学生为观众，只不过是在我们代码层面将用户的标签设置为我们需要的而已。

### 项目操作指南

1. 打开项目，找到模块：小型直播。
2. 进入后默认没有任何参数，因此也需要携带 URL 参数，看下面访问参数，注意参数 pub这个参数是作为同一个房间中主播和非主播的区别的，因此你如果想体验主播端，那么请携带此参数，看下面案例：
```bash
# 主播进入 房间号：10012 用户ID：1001 用户昵称：suke001
http://localhost:8080/demo03-one2many?userId=1001&roomId=10012&nickname=suke001&pub=pub
# 非主播进入 房间号：10012 用户ID：11111 用户昵称：US01
http://localhost:8080/demo03-one2many?userId=11111&roomId=10012&nickname=US01
# 非主播进入 房间号：10012 用户ID：22222 用户昵称：US02
http://localhost:8080/demo03-one2many?userId=22222&roomId=10012&nickname=US02
```

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/89b90bfe9e6a4307971deb0e1c99fd5c~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

3. 在演示过程中大家可能会看到弹幕和虚拟背景相关的，大家不必着急，这个是后面的内容，这节课的核心是搞懂直播这个概念以及`WebRTC`如何实现小型直播的。

### 完整代码仓库地址

[本节课相关代码](https://github.com/wangsrGit119/suke-webrtc-course/blob/main/webrtc-link-demo/src/views/demo03-one2many.vue)

### 课后题

请大家先按照上述的过程完成本地的模拟场景，然后着重看下“**学生S端**”那里pc.`addTransceiver()`方法的作用（[参考连接](https://udn.realityripple.com/docs/Web/API/RTCRtpTransceiver/direction)），如果去掉这行代码，你的直播代码又会变成什么样子，还能正常进行直播吗？欢迎大家在留言区讨论。