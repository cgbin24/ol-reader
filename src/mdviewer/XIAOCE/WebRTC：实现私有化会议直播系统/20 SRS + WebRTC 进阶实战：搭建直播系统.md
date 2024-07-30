上节课让大家去看看 B 站直播用的是哪种媒体流，大家去看了没有？没有也没关系，实际上现阶段基本上都是 `FLV`或者`HLS`的，毕竟大型直播以及搭配 CDN 等都有成熟的案例，而现阶段，`WebRTC`在直播场景中还是有局限性的。虽然大型直播没有，但是小型的直播还是蛮多的，而我们这节课就利用上节 `WebRTC`推流到 SRS 流媒体服务器后，再用 `WebRTC`去拉流完成直播。

当然，上节课推流后得到的两种流地址都是可以直接作为直播源的，但是在拉流速度上和`WebRTC`还有差别，接下来我们就来看看，用 `WebRTC`和 SRS 如何提高拉流的效率，大家再和 `FLV`、`HLS`拉流对比下，看下具体的差异。

### WebRTC 拉流

1. 获取已知要拉取的流 ID，即推流地址中的 `streamId`。你可以把这个流 ID 当作是直播间的房间号，具有唯一性。

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/1392ff9f8ef04cea852268539241dc77~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

2. 初始化 `WebRTC`核心关联对象 `PeerConnection`实例，同时监听远程媒体流。
```js
const that = this
if(that.pc){
        that.pc.close();
}
that.pc = await new PeerConnection(null);
//注意这里和推流参数的区别
that.pc.addTransceiver("audio", {direction: "recvonly"});
that.pc.addTransceiver("video", {direction: "recvonly"});
//这里监听远程媒体流过来
that.pc.ontrack  = function (e) {
        that.setDomVideoTrick(e.track)
}
//创建会话信令
let offer = await that.pc.createOffer();
//本地添加一份
await that.pc.setLocalDescription(offer)
```

3. 通过 SRS 开放 API 交换基础信令 SDP，与本地同步。
```js
//组装参数 按照API格式
let data = {
  "api": this.$srsServerAPIURL+"rtc/v1/play/",
  "streamurl": this.$srsServerRTCURL+streamId,
  "sdp": offer.sdp
}
//交换
axios.post(this.$srsServerAPIURL+'rtc/v1/play/',data)
.then( async res => {
        res = res.data
        console.log(res)
        if(res.code === 0){
        //得到流媒体服务器应答的信令，添加到本地核心关联实例化对象的种
                await that.pc.setRemoteDescription(new RTCSessionDescription({type: 'answer', sdp: res.sdp}))
        }
}).catch(err => {
        console.error("SRS 拉流异常",err)
})
```

4. 监听到媒体流后挂载到本地 `DOM` 元素。
```js
setDomVideoTrick(trick){
    // this.scanvideodomId 为本地页面已存在的video标签ID
      let video = document.getElementById(this.scanvideodomId)
      let stream = video.srcObject
      if(stream){
              stream.addTrack(trick)
      }else {
              stream = new MediaStream()
              stream.addTrack(trick)
              video.srcObject = stream
              video.controls = true;
              video.autoplay = true;
              video.muted = true
      }
}
```

通过以上步骤，我们就可以直接通过 `WebRTC`订阅到发布的媒体流了。而不是用之前的 `HLS`流或者 `FLV` 格式流去点播视频画面，给大家对比看下：

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/f2588ab46d0e4ec59180581118692743~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

可以看到，我在直接推流后，右侧直播预览位置几乎立马显示画面，而后面我复制的 FLV 流去播放器播放则需要加载至少一秒钟，这就是`WebRTC`在流媒体直播领域的优势。

说完拉流，我们再说说直播过程中其他的功能，比如音视频的控制、切换，以及更高大上的连麦。

### 直播过程中音视频控制

#### 音视频控制

看下面代码，是不是和《1[0 | 会议实战：实时通话过程中音频、视频画面实时控制切换](https://juejin.cn/book/7168418382318927880/section/7172837736468971551)》中媒体控制的代码很类似？是的，只要是 WebRTC 相关，不论是用 SRS 流媒体服务，还是网关 Janus 服务，其控制的核心都是核心关联对象`PeerConnection`。
```js
//音频控制 pc为 peerconnection 实例化后的对象
audioControl(b){
       if(this.pc){
               this.audioStatus = !this.audioStatus 
              const senders = this.pc.getSenders();
              const send = senders.find((s) => s.track.kind === 'audio')
              send.track.enabled = b 
       }else{
               this.$message.error("请先点击推流")
       }
}
//视频控制
audioControl(b){
       if(this.pc){
               this.videoStatus= !this.videoStatus
              const senders = this.pc.getSenders();
              const send = senders.find((s) => s.track.kind === 'video')
              send.track.enabled = b 
       }else{
               this.$message.error("请先点击推流")
       }
}
```

#### 音视频切换

这里我们使用屏幕分享来实现这个功能。

1. 获取屏幕分享流。
```js
async getShareMedia(){
    const constraints = {
            video:{width:1920,height:1080},
            audio:false
    };
    return await navigator.mediaDevices.getDisplayMedia(constraints).catch(handleError);
}
```

2. 通过核心实例化对象切换媒体流。
```js
async changeVideo(){
       if(!this.pc){
               this.$message.error("请先点击推流")
               return
       }
       //这里获取上一步的屏幕分享流
       this.shareStream = await this.getShareMedia()
       //提取第一个视频Track
       const [videoTrack] = this.shareStream.getVideoTracks();
       //获取发送器
       const senders = this.pc.getSenders();
       const send = senders.find((s) => s.track.kind === 'video')
       //替换视频Track
       send.replaceTrack(videoTrack)
       //更改按钮状态
       this.shareStatus = true
}
```

#### 直播连麦

从 WebRTC 推流到 SRS 流媒体服务器，再到从流媒体服务器拉流，这个过程中我们注意到，实例化`PeerConnection`后的核心对象中， `addTransceiver`方法中`direction`参数为`sendonly`和`recvonly`，这个参数是什么意思呢？看下面表格：

|参数|	RTCRtpSender|	RTCRtpReceiver|
| - | - | - |
|sendrecv|	提供和发送 RTP 数据包（媒体信息）	|接收 RTP 包（媒体信息），也接收对等方 RTP 数据包
|sendonly|	提供和发送 RTP 数据包（媒体信息）	|不接受 RTP 数据包
|recvonly|	不提供和发送 RTP 数据包，也就是说本地有流媒体，但是你无法给对面发送 |	接收 RTP 数据包
|inactive|	不提供和发送 RTP 数据包	|不接收 RTP 数据包

表头中`RTCRtpSender`和`RTCRtpReceiver`这两个东西，你可以理解为手机充电线的那个充电头，一端接收，另一端输出，永久配对且缺一不可。而对于 `WebRTC`而言，它们的作用就是描述和控制媒体输出和输入，`sendonly`代表只发送媒体数据但是不接受，`recvonly`则相反，仅接收不发送媒体数据。

通过上面参数我们发现，当前`拉流端`和`推流端`与 SRS 流服务器建立的 RTC 连接对于媒体接收和发送而言是单向的，不能通过已经建立的链接去反向发送媒体流，比如`拉流端`（观众）给`推流端`（主播）发送视频或音频。既然这样，那我们如何去实现 “直播连麦” 功能呢？

很简单，既然大家都在同一个直播间，我们可以让观众端在申请连麦同意后主动推流给 SRS 流媒体服务器，成功后再告诉`主播`该`观众`推流的 `流ID`，然后让主播拉流不就可以了？

### 连麦实战

1. 申请连麦。在申请的时候携带唯一的流 ID，确保预留且不重复的。
```js
//服务端增加socket事件 
//申请连麦
s.on('applyMic',(data) => {
        let targetUid = data['targetUid']
        oneToOne(targetUid,getMsg('applyMic',"apply mic",200,data))
})
//同意
s.on('acceptApplyMic',(data) => {
        let targetUid = data['targetUid']
        oneToOne(targetUid,getMsg('acceptApplyMic',"acceptApplyMic mic",200,data))
})
//拒绝
s.on('refuseApplyMic',(data) => {
        let targetUid = data['targetUid']
        oneToOne(targetUid,getMsg('refuseApplyMic',"refuseApplyMic mic",200,data))
})


//客户端（包括主播和观众端 连接同一个socket服务器）并监听对应事件
applyMic(){
      let tid =  getParams('tid')//主播ID
      let params ={        "userId": getParams('userId'),"targetUid":tid,streamId:getParams('userId')+'-'+tid}
      this.linkSocket.emit('applyMic',params)
}
```

2. 主播同意。同意后直接先根据观众发的流拉流即可。

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/45407c0a23594a67abb25e6f81a0647c~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

```js
if(e['type'] === 'applyMic'){
    //自动同意 根据自己的业务调整 这里我设置的是有连麦直接同意
    let params ={ "userId": getParams('userId'),"targetUid":e.data.userId}
    that.linkSocket.emit('acceptApplyMic',params)
    let remoteStreamId = e.data.streamId
    //直接拉流即可 等有流推进来则自动会加载出来
    that.$refs['srsRtcPullApplyMic'].getPullSdp(remoteStreamId)
}
```

3. 观众端收到同意后开始推流。这一步就是普通的 WebRTC 直接推流即可。
4. 主播端稍等即可加载出画面，开始双向通话。

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/03d9212a33654303a6031b72d1e5c702~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

至此我们的主播连麦完成了。

### 项目演示

1. 打开项目，主播访问下面模块：

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/82cdb3b92487434d985da81ff7a8f8fd~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

但是请注意启动后台，`socket-server`文件夹中的后台。

然后携带请求参数访问：
```js
//指定房间号和用户ID  如果在自己的改造项目中可以写表单然后进行下一步 这里我为了演示 直接在URL携带参数
http://localhost:8082/srs-rtc-push?userId=999&roomId=111
```

2. 点击推流，右上角则会直接用 RTC 去拉流预览，成功则自动会在直播预览那里显示画面，否则会弹出失败提示框。

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/1bdb51a103fd441fbe53c8d016c4faea~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

3. 点击麦克风或者摄像头切换，以及屏幕分享可以查看右上角预览画面变更（注意默认右上角画面是静音的，请手动开启）。
4. 访问直播间模块页面，携带参数为推流页面的流 ID。

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/265552927b37403982785bbb9ae60c6f~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

```js
//携带个人信息+直播间流ID+tid(主播ID)
http://localhost:8082/srs-live-room?liveroomid=localStream-1673368291508&tid=999&userId=1010&roomId=111
```

5. 点击页面右侧“申请连麦”，观察推流模块画面以及当前页面控制台。

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/ccfdd5221eb44fe3bf82bf09c2b4026c~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)


### 本节相关源码

[相关源码地址](https://github.com/wangsrGit119/suke-webrtc-course/blob/main/webrtc-link-demo/src/views/srs-rtc-push.vue)

### 课后题

在申请连麦那里我做了简化，直接自动同意连麦人员画面，在实际过程中肯定是不行的，请大家优化这个步骤，比如实现主播同意、拒绝的弹窗提醒等。