前面我们熟悉了`WebRTC`的核心对象`PeerConnection`，也了解了核心对象的一些基本方法；后面我们也分析了`WebRTC`的会话过程，以及中间需要调用哪些方法；最后我们通过 `nodejs`搭建了最基本的信令服务器。接下来我们就开始用代码还原前面的`WebRTC`的基本会话流程。

后续`pc`代表P`eerConnection`, `caller`为`A`，`callee`为`B`举例。

### P2P音视频实战

**首先，呼叫方`A`。**

> `localRtcPc`为本地实例化后的`PeerConnection`实例，与前面整体流程有差异的地方是，我们现在在初始化 `pc` 后，直接同步获取本地摄像头和音频输入并添加到 `pc` 中。初始获取媒体流需要一定时间响应，如果在乎创建连接时间的，这一步可异步完成。
```js
async initCallerInfo(callerId,calleeId){
    //初始化pc
    this.localRtcPc = new PeerConnection()
    //获取本地媒体并添加到pc中
    let localStream = await this.getLocalUserMedia({ audio: true, video: true })
    for (const track of localStream.getTracks()) {
        this.localRtcPc.addTrack(track);
      }
      //本地dom渲染
    await this.setDomVideoStream("localdemo01",localStream)
    //回调监听
    this.onPcEvent(this.localRtcPc,callerId,calleeId)
    //创建offer
    let offer = await this.localRtcPc.createOffer();
    //设置offer未本地描述
    await this.localRtcPc.setLocalDescription(offer)
    //发送offer给被呼叫端
    let params = {"targetUid":calleeId,"userId":callerId,"offer":offer}
    this.linkSocket.emit("offer",params)
}
```

- A 呼叫 B 后双方同意建立通信，A 首先初始化 `pc`，代码中的`localRtcPc` 。
- 然后 A 初始化本地`mediaStream`，并添加到 `pc` 对象中，同时渲染在本地预览 `DOM` 元素。
- 初始化回调信息，比如 `ontrack`（监听B端媒体），`onicecandidate`（双方 `ICE` 候选信息）事件等。
```js
onPcEvent(pc,localUid,remoteUid){
        const that = this
        this.channel = pc.createDataChannel("chat");
        pc.ontrack = function(event) {
                that.setRemoteDomVideoStream("remoteVideo01",event.track)
        };
        pc.onnegotiationneeded = function(e){
                console.log("重新协商",e)
        }
        pc.ondatachannel = function(ev) {
          console.log('Data channel is created!');
        };
        pc.onicecandidate = (event) => {
          if (event.candidate) {
                that.linkSocket.emit('candidate',{'targetUid':remoteUid,"userId":localUid,"candidate":event.candidate})
          } else {
            /* 在此次协商中，没有更多的候选了 */
                console.log("在此次协商中，没有更多的候选了")
          }
        }
}
```

- 创建`offer`信令设置为本地描述后发送给 B 。
- 等 B 创建应答信令之后，信令服务器会将其转发到 A 这边。
```js
async onRemoteAnswer(fromUid,answer){
    await this.localRtcPc.setRemoteDescription(answer);
}
```

- A 接受 B 的 `answer`信令后，将其设置为 `remoteDesc` 。

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/2c1793ce9fda484da197691254f395af~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

> **注意看日志中的`candidate`，这个过程是贯穿整个会话的，直到`ice`候选完成。**

**被呼叫端`B`。**

> 被呼叫端的过程和呼叫端类似，大体代码如下：

```js
async initCalleeInfo(localUid,fromUid){
    //初始化pc
    this.localRtcPc = new PeerConnection()
    //初始化本地媒体信息
    let localStream = await this.getLocalUserMedia({ audio: true, video: true })
    for (const track of localStream.getTracks()) {
        this.localRtcPc.addTrack(track);
      }
      //dom渲染
    await this.setDomVideoStream("localdemo01",localStream)
    //监听
    this.onPcEvent(this.localRtcPc,localUid,fromUid)

}
```

- B 接听后同时初始化 pc。
- B 创建本地`mediaStream`，并添加到 pc 对象中，同时渲染在本地预览 Dom 元素。
- 同 A 初始化回调监听。
- 当然此时 A 发送的`offer`信令通过信令服务器转发到 B 这边，B 将其设置为`remoteDesc`后，同时创建`answer`信令。

```js
async onRemoteOffer(fromUid,offer){
  //B接受到A的offer 设置为remote desc
  this.localRtcPc.setRemoteDescription(offer)
  //创建应答
  let answer = await this.localRtcPc.createAnswer();
  //设置为local desc
  await this.localRtcPc.setLocalDescription(answer);
  //并通过信令服务器发送给A
  let params = {"targetUid":fromUid,"userId":getParams("userId"),"answer":answer}
  this.linkSocket.emit("answer",params)
}
```

至此，所有的会话建立完成，在双方监听的 pc 核心方法`ontrack`中，就能拿到双方的音频和视频信息了，完整的代码我会放在文末，大家自取即可。不过纸上得来终觉浅，还需要你自己在实践中理解，这才是掌握最快速的。

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/28a65059a3594ef8965f925e91f240cb~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

大家可以看下下图中具体的 `SDP`信息，实际上都是`WebRTC`封装好的，不需要我们去组装，如果你认真从前面看的，应该很容易理解，完成一个 P2P 的视频通话是不是很简单？

**不过我先打个预防针：在真正的复杂网络环境中 ， 我们需要考虑的还有很多，如果之前大家了解过 `WebRTC` 相关的知识，一定对 stun 和 turn 这几个词不陌生，我们暂时不考虑这个， 从最简单的网络环境中开始 ，完成我们的目标。**

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/8874a44cd99a44108924554ca623b1e8~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

**通话过程中媒体流的变更**

完成以上视频通话，可能有人会问，怎么实现类似微信视频中，视频和音频之间随意切换，或摄像头前置后置切换呢？

这里我们就需要再学习一个知识点：`RTCRtpSender`对象。这个对象的接口支持变更你发送到对方的媒体，通过这个对象接口，你可以编辑更改流属性，从而达到控制远端媒体流的目的。

通过实例化后的`PeerConnection`对象调用`getSenders`方法，可获取每个媒体轨道对应`RTCRtpSender`对象。这里再解释下这个媒体轨道，我们在获取到媒体信息的时候，一般包含两部分，一部分音频信息(`audiotrack`)，一部分视频信息(`videotrack`)，因此这里的媒体轨道指的就是媒体信息。

- 音频视频模式切换。
```js
//获取发送到远端的具体媒体信息的发送方信息
const senders = this.localRtcPc.getSenders(); 
console.log(senders)
const send = senders.find((s) => s.track.kind === 'video') //找到视频发送方信息
send.track.enabled = !send.track.enabled //控制视频显示与否 即仅音频模式
```

- 摄像头切换。
```js
//我这里web端因此只获取屏幕分享流 APP端则获取前置后置摄像头流即可
let stream = await this.getShareMedia()
const [videoTrack] = stream.getVideoTracks(); 
const send = senders.find((s) => s.track.kind === 'video')//找到视频类型发送方信息
send.replaceTrack(videoTrack) //替换视频媒体信息
```

### `类IM`实现

前面初始化回调流程中有个监听方法 `onPcEvent()`，内部你会发现有个函数`createDataChannel`，看名字就是创建了一个通道。是的，这就是的`WebRTC`中的`datachannel`可以实现无服务端 P2P 文本等富文本信息双向传输，只要完成`WebRTC`会话，即使视频通话过程中你的云服务器宕机了也没关系，P2P 的即时通讯还是可以正常进行的。我先演示下：

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/6fc42cf2dade45eb802738f70cc0933b~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

**官方描述**

`RTCPeerConnection` 的 `createDataChannel()` 方法可以创建一个可以发送任意数据的数据通道， 常用于后台传输内容，例如：图像、文件传输、聊天文字等其他数据，当然除了后台，最常用的就是 P2P 中客户端的双向通信了。

**基础语法和使用**

下面的创建 datachannel 的前提是双方已经完成WebRTC的基础信令交换，pc变量为初始化后的RTCPeerConnection。

> `let dataChannel = RTCPeerConnection.createDataChannel(label[, options]);`

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/4a284fa9d44c4db69d49043598d672cb~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)


**创建一个`datachannel`，发送并监听消息。**
```js
this.channel =  pc.createDataChannel("my channel", {
       protocol: "json",
       ordered: true,
});

-----------------监听消息------------------------------
pc.ondatachannel = function(ev) {
    console.log('Data channel is created!');
    ev.channel.onopen = function() {
      console.log('Data channel ------------open----------------');
    };
    ev.channel.onmessage = function(data) {
      console.log('Data channel ------------msg----------------',data);
    };
    ev.channel.onclose = function() {
      console.log('Data channel ------------close----------------');
    };
  };
  
-------------发送消息--------------------------------------   
this.channel.send(this.rtcmessage)
```

通过这种方式发送消息，你在浏览器的 NetWork 是看不到的哦，因此按照常规抓包逻辑直接抓`HTTP`或者`WS`协议包的话，也是抓不到的。之前在某些网站看到过这种方式传输数据，我相信以后会有更多的地方用到`WebRTC`的`datachannel`。如果同学们想要深入了解原理，可以去看看SCTP协议 ，点击前往相关协议说明[官方文档地址](http://www.watersprings.org/pub/id/draft-jesup-rtcweb-data-protocol-04.html)。

### 项目操作指南

1. 打开项目源码，找到模块：一对一网络视频。
2. 进去后请在 URL 中携带参数 userId 和 roomId 。
```bash
#用户1001 房间号：10012
http://localhost:8080/demo03-one2one?userId=1001&roomId=10012
#用户1002 房间号：10012
http://localhost:8080/demo03-one2one?userId=1002&roomId=10012
```

3. 此时访问成功后，页面会展示如下内容，点击指定用户旁边通话按钮，则可以和同一个房间内的指定人员通话。之前可能大家有疑惑为何要带房间号呢？因为第一是为了我们后面的会议做铺垫，第二是为了用户隔离。

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/4571844bf55848ee8fdc0b4ed7e46765~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

4. 操作完成视频通话之后，大家尝试在输入框输入文本消息，然后点击发送。此时会在另一端的窗口展示你在第一个窗口发送消息，这个就是 P2P 即时通讯。但是请注意，完成此功能的前提就是你已经建立了对等的`WebRTC`连接，否则会提示错误。

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/0d355daa242949d58062ae3928c4b77b~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

5. 点击用户列表自己账户旁边的切换，则可以关闭或者打开自己的画面，同时另一方也会实时变化，这个切换的功能，后面到媒体控制我们再做详细的解释。


### 本节所有源代码地址

[本节课相关代码](https://github.com/wangsrGit119/suke-webrtc-course/blob/main/webrtc-link-demo/src/views/demo03-one2one.vue)

### 课后题

这节课算是`WebRTC`的正式入门实践了，在学习完理论知识后，请大家模仿我的 Demo 自己实现类似页面，如果你是前端的话那么可以实现一个美化版本且可部署的点对点音视频通话的在线 Demo，让大家一起试试你的成果。