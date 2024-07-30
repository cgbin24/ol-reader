上节课我们学习了Janus 插件相关的一些基础知识，接下来我们将进行 `VideoCall`插件的实战，以及用它实现三个比较重要且常用的功能：点对点的视频通话、媒体控制、网速监控。

### 点对点视频通话

视频通话的步骤和我们生活中遇到的一样，都是先呼叫，然后等对方应答，对方同意之后我们再继续推送自己的视频流等信息。这些步骤在前面的第一种架构中，我们都是通过自己的 Socket 信令服务器完成对应事件的。但是，现在我们有了 Janus 网关服务之后，这些所有的事件通知，网关都会替我们完成转发，而我们只需要关注页面上对应步骤中的展示逻辑即可。

我们继续看看 Janus 是如何替我们完成这些操作的。

#### 网关中注册用户信息

通话的前提是你要知道对方在当前系统的用户名，同时别人也要能在系统中找到你，因此在呼叫开始之前，我们要做的就是注册我们自己的标识信息到当前 `Janus 网关中`。
```js
registerUser(){
        var register = { request: "register", username: this.username };
        videoCallPluginHandle.send({ message: register });
}
```

注册成功会打印如下：

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/df40d63c21ae47aab6448be571c9dc47~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

如果重复注册则提示：

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/97f879e740734c2e81c1965b4357e278~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

当然，被呼叫方同样也需要注册到当前的 **Janus 网关中**，否则就会遇到下面的提示：

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/e10f412dca7d47a192bd6d8c36c328ce~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

如果注册完成，就可以开始正式通话流程了。

#### 网关中通话流程响应

**呼叫**。 呼叫的代码也很简单（有些参数在下面还是给大家解释下）：

- `recv`： true/false。是否还应接收音频或视频，如果 false，则代表仅发送不接收，可以用于直播 。
- `type` ：指定某一类媒体 。音频（audio） /视频（video）/数据通道 （data），这个数据通道就是我们前面课程中学到的 `Datachannel` 。
- `simulcast`: true/false。 对于视频，该轨道是否应该使用联播，这个我们当前课程中用的少，可以不用考虑，当然这也是 Janus 的一大核心优势，深入研究的的同学，可以在留言区或者社群一起讨论下。
- `capture` ： 指定媒体设备。 true 则代表使用默认设备，这个设备实际上就是你本地所能加载到的摄像头或者麦克风的 DeviceId 参数，而我们描述时，为了具象化，则直接使用设备代称。具体指定参数： `{ deviceId: { exact: videoDeviceId } }`。
```js
call(){
    const that = this
    videoCallPluginHandle.createOffer({
    //双向语音视频+datachannel
            tracks: [
                    { type: 'audio', capture: true, recv: true },
                    { type: 'video', capture: true, recv: true, simulcast: false},
                    { type: 'data' },
            ],
            success: function(jsep) {
                    console.log("SDP协商信息", jsep);
                    //这里指定对方的用户名即可
                    var body = { request: "call", username: that.targetUserName };
                    videoCallPluginHandle.send({ message: body, jsep: jsep });
            },
            error: function(error) {
                    console.log("呼叫异常",error)
            }
    });
},
```

**呼叫方响应。在此环节大家可以按照自己的业务逻辑展示对应信息** 。

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/3349599c113a4034a64b5927094e06b1~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

**被呼叫方响应。**

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/7a2040d204464f86883809aa097b6467~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

**被叫方应答。**

我们可以在上面截图中看到，在呼叫后，被叫方直接收到信息了，我们中间没有任何其他操作对吧，这就是网关的神奇之处。同时，所有的这些事件都会有回调，我们可以通过这些事件回调处理业务逻辑。比如呼叫后，我们可以在回调中监听到是否呼叫成功，如果成功我们应该弹出什么窗口，被呼叫弹出什么窗体等等。

继续被叫方这一端，在收到 `incomingcall`事件后，被叫方要操作接听还是拒绝，如果拒绝，则对方就会收到挂断事件，进而结束呼叫。但是如果被叫方接听呢？请看下面代码：

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/8012adf668d0441fa8718cd36d4f9c07~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

这部分代码截图比较清晰，具体代码大家可以到仓库看到。看截图代码，首先被叫方创建了信令的应答，然后通过全局句柄（`pluginHandle`）发送给对方，而参数 body 中就是信令。在这里我们能直观地感受到，**除了基础事件被网关替我们默默操作之外，其他的 `WebRTC` 流程 ， 实际上也是要我们手动实现的，但是也并不复杂**，从第一节课到现在，这个流程我们已经熟悉得不能再熟悉了。

被叫方接听后，呼叫端也会收到已接听的事件，此时代表我们双方就可以通话了，比如监听到对方的媒体流后显示在界面上的操作。这里我们再提一下监听事件，虽然上节课我们对 VideoCall 回调函数详解中有讲到，就是下面的部分代码：
```js
onlocaltrack: function(track, added) {
    // 本地媒体流发布后可以监听
   console.log("本地媒体",track,added)
},
onremotetrack: function(track, mid, added) {
    // 远端媒体流
  console.log("远程媒体",track,mid,added)
},
```

**接收远程媒体流** ， 收到流之后，将媒体流绑定到对应的 DOM 元素即可。

需要注意的是，我们在接收到媒体流之后，拿到的流的分辨率也是五花八门，因此在设置样式上，可以将 Video 标签设置为填充（object-fit:fill），这样子即使不同分辨率流过来，最终展示效果都取决于外层容器，以防影响到全局展示样式。
```js
setDomVideoTrick(domId,trick){
        let video = document.getElementById(domId)
        let stream = video.srcObject
        if(stream){
                stream.addTrack(trick)
        }else {
                stream = new MediaStream()
                stream.addTrack(trick)
                video.srcObject = stream
                video.controls = false;
                video.autoplay = true;
                // video.muted = false
                // video.style.width = '100%'
                // video.style.height = '100%'
        }
}
```

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/f1f6a33571ed4d449eb2766762ea22d5~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

### 媒体控制

这是本节课的第二个话题，所谓媒体控制就是对我们发送出去的媒体做出变更、暂停、恢复等操作。

上一节我们在通过客户端 SDK 初始化插件时提到过一个叫做句柄的东西（pluginHandle），实际上在使用 Janus 的网关的过程中，所有的主动或者被动性操作都是可以通过它来实现，媒体控制也是一样的。

在具体操作之前，我们先看官方 API：
```js
{
        "request" : "set",
        "audio" : true|false,
        "video" : true|false,
        "bitrate" : <numeric bitrate value>,
        //其余省略......这节课暂时用不到
}
```

- audio：音频控制。
- video：视频控制。
- bitrate：比特率设置。

上面三个参数就是我们本节课要实战的，其他的参数暂时不深入探究。有了官方 API，那么我们的代码层面控制按照 API 就可以了，接下来就是实战：

**音频或视频控制设置**
```js
//视频控制
this.videoStatus = !this.videoStatus
videoCallPluginHandle.send({ message:
        { request: "set", video:  this.videoStatus},
});
//音频控制
this.audioStatus = !this.audioStatus
videoCallPluginHandle.send({ message:
        { request: "set", audio:  this.audioStatus},
});
```

**比特率设置**

大家在实际的使用场景中，肯定是要针对当前客户端的网络状况来设置，如果网络状况较差或者用户的流量不是很多，则可以设置得相对较小一点。
```js
videoCallPluginHandle.send({ message:
        { request: "set", bitrate: 400*1000 },
});
```

**演示**

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/72a1cac9660d490b9ad79fb8d21cf1f2~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

### 流量速率监控

在视频通话过程中，媒体流量的监控不仅仅可以将会话过程中的**媒体传输信息**以最直观的方式给用户展示出来，同时也可以利用监控到的传输速率优化通话质量，用户端可以直接动态调整媒体发送的速率。

流量实时监控也离不开我们一直提到的句柄（pluginHandle），具体监控代码如下：
```js
getBitrate(){
        //句柄判断 实时输出当前传输速率
        if(videoCallPluginHandle){
                console.log(videoCallPluginHandle.getBitrate())
        }        
},
```

当然你要使用上面代码的前提同样是已经和对方建立连接，已经通过 Janus 网关打通会话过程。

### 本节课相关源码

[相关源代码](https://github.com/wangsrGit119/suke-webrtc-course/blob/main/webrtc-link-demo/src/views/demo04-janus-01.vue)

### 课后题

1. 前面的媒体控制部分，我在页面上并没有将比特率设置的动态变更代码写出来，仅留了静态设置的代码，大家可以改造下，让其支持动态输入设置。
2. 前面动态获取到网速之后，如果你是前端的话，可以将其和网页上的水晶球结合在一起，类似你桌面上动态展示的实时网速。