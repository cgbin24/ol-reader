上一节我们在测试 SRS 是否搭建成功的时候，使用 Ffmpeg 推 mp4 视频流到 SRS，并使用 `FLV` 的形式在页面播放视频流，而我们小册的主题是 `WebRTC`，因此必不可少的就是用 `WebRTC` 去和 SRS “打交道”，接下来我们就看看 `WebRTC` 是怎样和 SRS 流媒体服务器搭配并控制媒体的。

首先我们来看看 “推流”，推流指的是将媒体流推送到流媒体服务器，这个媒体流包括摄像头、普通视频、第三方链接流（Http、RTMP 等格式）、图片、音频等各种多媒体格式。而我们的重点则是`摄像头的流`去推到流媒体服务器。虽然摄像头的流是本节课重点，但是为了让大家对推流有更深刻的认识，我会将各种格式的流都演示下。

### 推流播放器

我们推流到流媒体服务器之后，如果用原始的形式，比如 RTMP 推流，再用 RTMP 拉流，由于浏览器已经不再支持了，也就无法直接播放了。因此我们现阶段都是通过 flv 格式的拉流并播放，而播放需要用到的播放器就是 flv 播放器：[FLV播放器官方地址](http://bilibili.github.io/flv.js/)。

SRS 服务自带的控制台也是利用这个开发的，我们小册代码中也有，如下：

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/215c69d8bd5446e4a189705c400de0a5~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/bd107d9dd1254797974d1e1190e51aa9~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

### 普通推流实战

首先，请注意我在推流的时候会携带一些参数（大部分参数在上一节解释过，但是没有实战，这里我会借助推流去实际应用下）。

其次，推送到流媒体服务器的流是通过 live 后的参数区分的，比如我在小册中举例的推流地址为：`rtmp://192.168.101.99:1935/live/suke001`，前一部分为 SRS 部署服务器，中间的端口则为 RTMP 默认端口，最后面部分`/live/{streamId}`，为具体的流区分地址，其中`streamId`就是核心区分参数，不同的流，这个参数不一样就行，自定义即可。

最后就是预览流`http://``192.168.101.99``:8085/live/1001.flv`，这个就是推送后预览流的地址，所有推送的 SRS 流媒体服务器的流都会自动转为 `FLV` 格式，这个流最后的 `1001`就是推流时候的`streamId`，推的时候是什么，那么播放的时候就是什么。

预览流并不是只有`FLV`一种，也有 `HLS` 格式的，SRS 的配置中是默认开启推流自动转换为这两种格式的，预览格式和`FLV` 类似，只不过后缀不一样：`http://192.168.101.99:8085/live/1001.``m3u8`。

**以上两种预览流就是我们现阶段大多数平台直播常用的两种直播流格式**。

#### 本地视频推流

代码中用到参数详解：

- `-c:v copy`：复制原有视频格式，比如我本地的视频格式为 H.264，那么当前在将此视频推到流媒体服务器过程中，视频编码格式是不会变的。拉流的时候，视频编码格式也同样是 H.264。但是大家要注意，现阶段浏览器默认支持播放的视频编解码格式是有限的，比如常见的支持的两种：H.264 和 VP8，而其他的比如：H.265、VP9、AV1 等格式并不是所有浏览器都兼容编解码的。

  因此如果你本地视频是 H.265 格式，那么你当前编码格式设置就不能为 `copy`，否则浏览器就没法播放了。具体看下面代码第三种指定编码为 `libx264`推流。

- `-c:a aac：`指定音频编码格式为 AAC。和视频格式一样，浏览器默认支持播放的音频格式也是有限的，常见支持的格式有：Opus、AAC、PCM 等。而 G.711、Ogg 等在不同浏览器是无法兼容播放的。
```sh
//第一种 H.264视频  aac音频格式 推流  
ffmpeg -i target.mp4 -c:v copy  -c:a aac -f flv rtmp://192.168.101.99:1935/live/1001
//第二种 H.264视频 并去除音频格式 推流
ffmpeg -i target.mp4 -c:v copy  -an -f flv rtmp://192.168.101.99:1935/live/1001
//第三种 H.265/H.264 编码为 264格式 去除音频推流
ffmpeg -i target.mp4 -c:v libx264  -an -f flv rtmp://192.168.101.99:1935/live/1001
```

#### 网络地址流播放

下面第一个例子是我将本地流推送到流媒体服务器，通过 RTMP 拉流再继续推到流媒体服务器（注意区分流的`流ID`）。
```sh
//RTMP流 推送到 rtmp://192.168.101.99:1935/live/1002 并去除音频
ffmpeg -i rtmp://192.168.101.99:1935/live/1001 -c:v copy -an -f flv rtmp://192.168.101.99:1935/live/1002
//RTSP 流 推流到 RTMP服务器 （流ID 1003）
ffmpeg -i rtsp://wowzaec2demo.streamlock.net/vod/mp4:BigBuckBunny_115k.mp4 -c:v copy -c:a copy -f flv rtmp://192.168.101.99:1935/live/1003
//普通mp4流推流 上一节课演示过
ffmpeg -i  http://vfx.mtime.cn/Video/2019/02/04/mp4/190204084208765161.mp4 -c:v copy -c:a copy -f flv rtmp://192.168.101.99:1935/live/suke01
```

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/e74cdf153fdf4f7dbe7fd6fcf9d8fbd7~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/08bfee09ea8f46f69501f784eb4c4eb1~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

#### 图片推流

图片推流要注意的是单张图片并不能构成一个视频，这里我们可以通过无限循环推送图片，同时图片也不具备视频格式，我们可以通过指定编码为 H.264，让媒体服务器认为它是 H.264 的视频格式。

温馨提示：无限循环参数：`-loop 1` 仅适用在图片循环，如果是本地视频推流，若要本地视频无限循环播放，请使用 `-stream_loop -1`。

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/061fa9d8f6854bc885b83f51b5d67d79~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

```sh
// local.png 为本地截图  -loop 1  为图片无限循环
ffmpeg -loop 1  -i local.png -c:v libx264 -an -f flv rtmp://192.168.101.99:1935/live/1001
```

是不是很惊喜，图片竟然也可以当作视频来推流？这就是 Ffmpeg 的强大之处。

#### 屏幕分享推流

借助 Ffmpeg 的强大，我们可以直接捕获桌面的视频流，然后推送到 SRS 流媒体服务器中。
```sh
//gdigrab  桌面捕获器 
ffmpeg -f gdigrab -i desktop -c:v libx264 -an -f flv rtmp://192.168.101.99:1935/live/1001
```

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/a2ce1ebb95644cc8ac48d707af6cd6b2~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

举例这么多，就是为了让大家熟悉流媒体服务器的场景多样性，以及扩宽我们对 SRS 流媒体服务的认识。

但是这几个例子都和我们的 `WebRTC` 没直接联系，接下来我们就要看看如何让 `WebRTC` 给 SRS 推流。

### WebRTC 推流

使用`WebRTC` 给 SRS 流媒体推流也需要遵循 `WebRTC` 的核心会话流程的，和前面的 Janus 类似，你需要和服务器进行 `WebRTC` 关联。

#### 流媒体服务器交互流程

1. 本地获取媒体流。
```js
async getLocalUserMedia(audioId,videoId){
   const constraints = {
       audio: {deviceId: audioId ? {exact: audioId} : undefined},
       video: {
           deviceId: videoId ? {exact: videoId} : undefined,
           width:1920,
           height:1080,
           frameRate: { ideal: 15, max: 24 }
       }
   };
   if (window.stream) {
       window.stream.getTracks().forEach(track => {
           track.stop();
       });
   }
return await navigator.mediaDevices.getUserMedia(constraints).catch(handleError)
},
```

2. 初始化核心关联对象 `PeerConnection`实例，并添加媒体流。
```js
const that = this
that.pc = await new PeerConnection(null);
//sendonly 参数请注意 不要设置操作 同时请注意 audio和video的顺序 如果发送和接收顺序不一样 那么你的RTC关联建立是不能成功
that.pc.addTransceiver("audio", {direction: "sendonly"});
that.pc.addTransceiver("video", {direction: "sendonly"});
//stream 为本地获取到的媒体流
stream.getTracks().forEach(function (track) {
        that.pc.addTrack(track);
});
```

3. 创建`offer sdp` 信息，并组装 SRS 流媒体服务 API 需要的参数。
```js
//创建 offer sdp 
let offer = await that.pc.createOffer();
await that.pc.setLocalDescription(offer)
```

4. 利用上述参数交换流媒体服务端生成的`answer sdp`信息，交换后，设置到本地完成`WebRTC` 的交换流程。
```js
//按照 SRS 开放的API组装参数 
let data = {
  "api": this.$srsServerAPIURL+"rtc/v1/publish/",
  "streamurl": this.$srsServerRTCURL+streamId,
  "sdp": offer.sdp
}
//和服务器请求获取回调的SDP信息 并添加到本地 实例化后的 PeerConnection 中
axios.post(this.$srsServerAPIURL+'rtc/v1/publish/',data)
.then( async res => {
        res = res.data
        console.log(res)
        if(res.code === 0){
                await that.pc.setRemoteDescription(new RTCSessionDescription({type: 'answer', sdp: res.sdp}))
                that.scanUrl = that.$srsServerFlvURL+streamId+'.flv'
        }
}).catch(err => {
        console.error("SRS 推流异常",err)
})
```

#### 演示

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/eaa30e8561c54e999aac497f8fa32319~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

以上，就是通过 `WebRTC` 将我们摄像头的流直接推送到 SRS 流媒体服务器中，然后通过`FLV` 拉流播放，当然也可以通过 HLS 拉流。

### 本节课源代码

[本节课相关源码地址](https://github.com/wangsrGit119/suke-webrtc-course/blob/main/webrtc-link-demo/src/views/flv-player.vue)

[本节课相关源码地址](https://github.com/wangsrGit119/suke-webrtc-course/blob/main/webrtc-link-demo/src/views/srs-rtc-push.vue)

### 课后题

请大家观察 B 站直播地址，看看 B 站直播流的格式。另外，我在项目中只写了 `FLV` 格式播放的页面，请大家扩展下播放`HLS`格式的播放器。