上节课给大家留了课后思考题，大家做的怎么样？如果能解决上节课的课后题，那么这节课的内容学习起来就很简单，无非是流的替换而已。接下来我们就一起实践下，如何借助 `虚拟背景` 美化我们前面做的简易直播系统。

开始之前，大家先回顾下我们在上节课的成果：将摄像头画面和虚拟背景通过机器学习模型融合后，展示在 `Canvas` 节点上，那么这节课我们就要对融合后的画面和 `WebRTC` 结合，并在我们之前写的简易直播中应用。

### Canvas 画布流

`Canvas` 本身只是一个画布，但是有对应的 API，可以将画布上的每一帧捕捉并形成媒体流，我们可以改造下上节课的方法，如下：
```js
async virtualBg(){
    const that = this
    let video = document.getElementById('localdemo01')
    if(this.rfId){
            cancelAnimationFrame(this.rfId)
    }
    let lastTime = new Date();
    async function getFrames() {
            console.log("timer",lastTime)
            const now = video.currentTime;
            if(now > lastTime){
                    await selfieSegmentation.send({image: video});
            }
            lastTime = now;
            //无限定时循环 退出记得取消 cancelAnimationFrame() 
            that.rfId = requestAnimationFrame(getFrames);
    };
    getFrames()
    return canvasElement.captureStream(25)
}
```

核心实际上就是`canvasElement.captureStream`方法，通过此方法即可捕捉画布并转换成流。内部唯一的参数就是帧速率`FPS`，一般设置为 `20 到 25` 这个区间即可满足正常视觉上的视频流畅度。

拿到画布媒体流后就要思考如何将该流发送给`WebRTC`对端，也就是我们所说的**观众端**。这样直播间的直播画面就是带有虚拟背景的画面。

这个流程就很简单了，和之前发送普通流一样，这次只不过是发送的画布流而已，名字不管是画布流还是普通流，在我们的代码中仅仅是 `MediaStream` 对象，因此按照正常流程来即可，如下：

1. **获取虚拟背景流**：
```js
//虚拟背景流暂存变量
this.virtualMediaStream = await this.virtualBg()
```

2. **建立关联关系后替换媒体流**： `virtualMediaStream` :
```js
async onRemoteOffer(fromUid,offer){
        const localUid = this.formInline.userId
        let pcKey = localUid+'-'+fromUid
        let pc = new PeerConnection(this.rtcPcParams)
        RtcPcMaps.set(pcKey,pc)
        console.log("主播监听到远端offer",pc);
        this.onPcEvent(pc,localUid,fromUid)
        //注意这里我们直接用的是虚拟背景流 替换原先的 localstream
        for (const track of this.virtualMediaStream.getTracks()) {
            pc.addTrack(track);
        }
        pc.setRemoteDescription(offer)
        let answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        let params = {"targetUid":fromUid,"userId":localUid,"answer":answer}
        this.linkSocket.emit("answer",params)
  }
```

**演示**：

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/48afab45ac1344158908ad3777b674ea~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

上面的动态图中，第一个为主播俩画面，一个为原始画面，另一个为带有虚拟背景的画面。后面的两个则是观众观看到的为带有虚拟背景的画面。

到这里我们直播间带虚拟背景的问题算是解决了，并且虚拟背景可以传送到观众端。**但是接下来就要思考我们这节课的另一个重要问题了，直播开始如果并不使用虚拟背景而是在直播过程中自主切换虚拟背景，如何做到呢？**

### 问题思考和实战

实际上，我们可以把直播中切换背景看作是切换视频流。如果我们能够在直播过程中无缝替换视频流，那么这个问题最重要的一步也就迎刃而解了，剩下的无非就是按照前面的流程，生成新的虚拟背景画布并获取视频流。

那么，在本身直播过程中，如何做到视频的无缝替换呢？

如果按照前面的老路子，你可能会选择重新建立新的`WebRTC`连接并发布新的媒体流，但是你有没有想过，当你重新协商的时候，又需要重新走繁琐的信令协商过程，观众端需要经历重新协商这段时间，才能看到新的画面，这样不仅仅需要消耗信令服务器的资源，还浪费了观众端的时间，岂不是得不偿失？

大家不必担心，我们能考虑到这个问题，实际上`WebRTC`的开发者也早就考虑到了，因此开发了相应的 API ，我们可以通过现有的 API 完成视频流的无缝切换，请看下面代码：
```js
const senders = this.localRtcPc.getSenders();
let stream = await this.getShareMedia()
const [videoTrack] = stream.getVideoTracks();
const send = senders.find((s) => s.track.kind === 'video')
send.replaceTrack(videoTrack)
```

- 第一行代码为获取和某个客户端建立连接的`WebRTC`关联的**核心对象** 。
- 第二行为获取新的媒体流。
- 第三行为获取新的媒体流中的视频流。
- 第四行为获取**核心对象**中正在发布的视频轨道。
- 第五行为用新的视频流替换旧的流。

注意第一行代码中的 `localRtcPc.getSenders()`，这个方法的官方描述就是“返回一个对象数组 `RTCRtpSender`，每个对象代表负责传输一个轨道数据的 RTP 发送方。发送器对象提供用于**检查和控制轨道数据的编码和传输的方法和属性**。”

大白话就是，这个方法返回的数组中，维护着发送方的媒体信息（**RTP 就是最原始的媒体流**），我们可以通过这个对象去**检查和控制发送方媒体的编码和传输**。 这样是不是就很容易理解了？如果不明白没关系，这节课我们只要知道可以通过这个方法去替换视频流就行了，后面《[10 | 会议实战：实时通话过程中音频、视频画面实时控制切换](https://juejin.cn/book/7168418382318927880/section/7172837736468971551)》节我会给大家详细解释。
```js
const senders = this.localRtcPc.getSenders();
const send = senders.find((s) => s.track.kind === 'video')
send.replaceTrack(xxx) # xxx 为新的视频流
```

再来回味下前面这段代码，首先获取当前已有`WebRTC`关联关系的核心对象`localRtcPc`，然后通过`getSenders`获取发送器对象数组，并过滤其中带有视频标签的轨道信息。最后替换发送器对象中的视频轨道信息。

而我们的场景是直播，也就是一对多的关联关系，因此在主播端，维护有 N 对`RTCPeerConnection`，因此需要遍历直播间所有的关联关系，并替换新的流，即可完成远程流的切换，如下：
```js
//切换发送的远程流
async changeRemoteStream(stream){
    //先获取要替换的流 过滤音频 仅仅保留视频
    const [videoTrack] = stream.getVideoTracks();
    //主播端所有关联关系遍历并替换新的流
    RtcPcMaps.forEach(e => {
            const senders = e.getSenders();
            const send = senders.find((s) => s.track.kind === 'video')
            send.replaceTrack(videoTrack)
    })
}
```

**演示**

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/868b985440f641b5af926317359a70c6~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

### 项目操作指南

1. 打开项目，找到模块：小型直播。
2. 流程第五节的流程一样。第五节中，如果大家已经运行过源码，那么应该已看到主播端中间一栏 写有 `直播开始后点击背景即可切换直播背景的醒目提示`。当时给大家说不用理会，但是现在是时候试试了。
3. 在观众和主播都已经就位后，此时还不是点击背景开始虚拟背景的时机，请问你的模型文件夹内的模型被代理了吗？代码中是否已配置模型加载路径？如果没有请回到上一节重新再复习一边。
4. 模型文件没问题后此刻就可以点击中间的虚拟背景了，任选一个然后稍等几秒钟就可以在两端看到效果。

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/740d49271a3042ef96e4107a5f52ea2b~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

### 完整代码地址

[直播部分代码](https://github.com/wangsrGit119/suke-webrtc-course/blob/main/webrtc-link-demo/src/views/demo03-one2many.vue)

[虚拟背景源码](https://github.com/wangsrGit119/suke-webrtc-course/tree/main/virtualbg-model)

### 课后作业

在直播使用虚拟背景的时候，大家可以注意下不同浏览器的 `FPS`，比如 360、谷歌、edge 等，然后开启浏览器的硬件加速后，再测试下 `FPS` 看下有何不同，同时注意计算机的资源占用情况。