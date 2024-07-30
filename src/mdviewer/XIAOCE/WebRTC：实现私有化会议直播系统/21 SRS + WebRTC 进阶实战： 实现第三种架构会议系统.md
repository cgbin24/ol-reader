这节课我们要学习第三种架构的会议系统，它大体上和第二种类似，第三种架构会议系统适用场景如下：多种不同源的流接入会议、云端录制、画面转播、会议直播等媒体较复杂的场景。

虽说和第二种架构类似，但是我们也可以从适用场景看到，第三种架构体现出来的关键词是“媒体场景复杂”，我们从下面这张图看看这种架构的优势。

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/917ec751d1f14c988dc7c8d018615500~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

首先接入会议的不仅仅有我们常用的电脑和手机，还有监控、硬件终端设施等，观看会议的不仅有会议中的成员，还有所谓直播场景下的“观众”。

同时，入会媒体流也变得复杂多样，比如高清监控视频大多数是 `H.265` 的、音频格式也是非常用格式，这些媒体流在浏览器上无法直接播放，此种情况下就涉及到媒体流的统一转换，让所有媒体流统一兼容。

因此第三种架构的会议系统服务端也被称作是 MCU 服务器，所有要参会的流媒体首先进入 `MCU` 服务器，在服务器内部常见的“动作”如下：

- **媒体转码**。`H.265` 转 `H.264` 、`RTMP` 或 `RTSP` 转 `RTC`，或 `RTP` 转 `FLV` 等格式，当然这里面转换格式的丰富度取决于当前 `MCU` 服务器所支持的转换类型。
- **云端录制**。一般经过媒体服务器的流都是会被媒体服务器过滤的。所以此时可以通过相关的配置让服务器录制视频。
- **服务端 AI 检测**。因为涉及到直播场景，如果是大型直播的话，内容安全一定是要考虑的，而`MCU`服务器正好有这个处理能力，在服务端媒体转换处接入 AI 内容鉴别，让直播内容经过 AI 鉴定中心，确保内容可以实时检测，如果发现非法内容， AI 可以直接终止直播。
- **其他场景**。还有其他的能力，比如媒体流混合、音频提取、视频抽帧存档等等。

可以说，`MCU`服务器是一个流媒体的大脑，比起第二种 `SFU`架构的 `Janus` 网关服务器仅仅转发媒体流的功能，`MCU` 服务器就是一个“超人”。

好了，了解完`MCU`服务器的基本功能之后，再回到我们课程讲的`SRS` 流媒体服务上，`SRS` 就是具备这种能力的服务，从上节课搭建的直播推流中我们就能看出，SRS 具有丰富的推流方式、多样化的直播流格式、高性能的媒体处理能力。

### 架构思考

接下来我们来思考下，如何借助 SRS 实现第三种架构的会议系统，看下图：

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/f66a1d25b3154696b98aa0a124e7082d~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

上图，第一个流程是`SFU`架构会议，第二个和第三个是用 `MCU` 实现的第三种架构会议系统。

仔细看后面两个架构流程，最后一个从`MCU` 服务器出来到用户的线条少了一个，即从 `MCU` 出来的流只有一个，而进入的流有三个，这是为何呢？这就涉及到`MCU`的重要功能了，媒体流的合并。合并后所有用户的媒体流都是经过媒体一个通道出来，即一个流中有三个画面（例如：中间一个大画面，两边两个小的画面）。

上图中，第三种媒体架构流程对于服务器的资源消耗巨大，因此大多数厂商所所提供的会议系统都是单独流，类似 `SFU` 架构的会议系统，但是结合了 `MCU` 服务器，让媒体处理能力增强的同时，架构更加灵活。

而我们也采用 `SFU`架构 + `MCU` 服务组合的方式去现实第三种架构会议系统。当然如果你对媒体合并感兴趣的话，可以看看下面合并 `2X2媒体流`的代码，`MCU`服务端处理方式都是一样的。

> 下面代码在 Windows 的 CMD 中执行，如果是 MAC 或 Linux，则将上箭头换成系统换行符。最后的 RTMP 地址为SRS 服务端的地址，和上节课推流系统的一样。
```sh
ffmpeg.exe -y  ^
-re -i http://vfx.mtime.cn/Video/2019/02/04/mp4/190204084208765161.mp4 ^
-re -i http://vfx.mtime.cn/Video/2019/03/18/mp4/190318231014076505.mp4  ^
-re -i http://vfx.mtime.cn/Video/2019/03/19/mp4/190319222227698228.mp4 ^
-re -i http://vfx.mtime.cn/Video/2019/03/19/mp4/190319212559089721.mp4 ^
-filter_complex  ^
"nullsrc=size=1920x1080 [base]; ^
[0:v] setpts=PTS-STARTPTS,scale=1440x1080 [middle]; ^
[1:v] setpts=PTS-STARTPTS,scale=480x360 [rightup]; ^
[2:v] setpts=PTS-STARTPTS,scale=480x360 [rightmiddle]; ^
[3:v] setpts=PTS-STARTPTS,scale=480x360 [rightdown]; ^
[base][middle] overlay=1 [tmp1]; ^
[tmp1][rightup] overlay=1:x=1440 [tmp2]; ^
[tmp2][rightmiddle] overlay=1:x=1440:y=360 [tmp3]; ^
[tmp3][rightdown] overlay=1:x=1440:y=720" -threads 5 -map 0:a -c:a copy -preset:v ultrafast -c:v libx264 -f flv rtmp://127.0.0.1:1935/live/suc 
```

那么如何将 SFU 架构和 MCU 服务组合呢，毕竟 MCU 服务器是没有和 Janus 网关类似业务处理能力的，所有的用户管理、房间管理、会议管理等涉及业务的数据都是要我们自己去处理的。所以我们需要思考下，如何借助现有的 Socket 信令服务器去实现上述业务数据处理的管理。

大家还记不记得上节课《[20 | SRS + WebRTC 进阶实战：搭建直播系统](https://juejin.cn/book/7168418382318927880/section/7173918834172362765)》中直播连麦的过程，如果忘记的同学再去看下哦。在直播连麦的过程中，我们连麦原理，**就是将各自的流推到流媒体中心后 ， 告诉对方自己的推流 `****ID`，然后对方拉流即可看到我们的画面**。 实际上会议也是一样的，我们可以通过下面思路实现。

1. 携带`唯一ID`、昵称、房间号注册到 `Socket` 服务端。
2. 注册成功后，将自己的画面流通过 `WebRTC`推流到 `SRS`，`推流ID` 为用户自己的`唯一ID`。
3. 如果同一个房间内有人，则广播自己的信息到房间内所有人，收到新加入成员后，使用新成员`唯一ID`去 `SRS` 拉流（这个 ID 就是媒体流 ID）。
4. 房间内所有人的流都需要主动从 `SRS`拉流，从而形成会议。

以上就是实现会议的基础流程，总体而言，整个流程上比较简单，接下来我们进入实战阶段。

### 会议实战

#### 用户注册以及注意事项

请注意，注册的用户 ID 一定要唯一，如果在自己的业务系统中，则可以依靠数据库记录，我展示的例子以浏览器指纹作为唯一 ID。后面推流就依赖这个 ID 去推流，SRS 内部也是依靠这个 ID 区分不同流的，而我们会议中拉流也是靠这个区分用户，一定要注意哦。
```js
//浏览器指纹获取
const fpPromise = FingerprintJS.load()
fpPromise
 .then(fp => fp.get())
 .then(result => {
         //和UUID类似，一串字符串
         if(!this.formInline.userId){
                 this.formInline.userId = result.visitorId
         }
  })
```

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/da279416b9a343b7ac860d5fd968e4ed~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

上面除了基础的用户信息，还携带了一些其他的参数，记录当前用户使用的是哪个摄像头或者麦克风，这些不是必需的，因此可以去掉。

#### 新用户入会

**对于入会者**

新用户加入到会议室后，还要发布自己的媒体流到 `MCU` 服务器，也就是 `SRS` 中，这样其他用户就可以通过新用户的 ID 从 `SRS` 中拉取媒体流。

入会后必须判断房间内是否已经有参会人员，如果有，则拉取已参会人员的媒体流。
```js
//监听房间用户列表 （新用户加入房间后首先会发送房间列表回调事件，等拿到用户列表后再开始初始化会议室）
this.linkSocket.on("roomUserList",(e)=>{
    console.log("roomUserList",e)
    that.roomUserList = e;
    //回调成功则代表加入到会议室100%成功，接下来就是初始化当前客户端会议室媒体渲染
    this.initMeetingRoom()
})
---------------------
async initMeetingRoom(){
    const that = this
    //发布自己客户端流之前先判断本地媒体流是否已经获取
    if(!this.localStream){
            this.localStream = await this.getLocalUserMedia();
    }
    //获取到本地流后，本地DOM预览自己的画面
    this.setDomVideoStream("localMediaDom",this.localStream);
    //推流到SRS
    await this.getPushSdp(this.formInline.userId,this.localStream);
    //判断房间内是否有其他人（这一步主要是为了判断房间内是否已经有人了，如果有人则直接拉取房间内用户的媒体流）
    this.others = this.roomUserList.filter(e => e.userId != this.formInline.userId)
    for(let i=0; i< this.others.length ;i++){
            let user = this.others[i];
            //拉其他用户媒体流
            await this.getPullSdp(user.userId)
    }
},
```

**对于已在会议室用户**

新人入会，已经在会议中的人员是会收到事件通知的。如下，用户 ID 为 999 的新人加入会议室后，其他成员看到的信息。

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/d2910f813a8e481dab84c1591fe448ba~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

此时，已在会议室的成员监听到加入事件后，必须主动拉取新人画面，如下：
```js
if(e['type'] === 'join'){
that.$message.success(nickname+" 加入房间")
//数组push新用户元素 同时页面会生成对应 DOM
that.others.push({
        userId:userId,
        nickname:nickname
})
//拉流
await that.getPullSdp(userId)
}
```

#### 用户离开会议室

```js
//通知房间内成员
that.$message.success(nickname+" 离开房间")
//移除DOM
that.removeChildVideoDom(userId)
 ---------------------
 //直接移除指定的DOM元素即可 （DOM ID课程中都是按照用户ID为唯一区分的）
 removeChildVideoDom(domId){
    let video = document.getElementById(domId)
    if(video){
            video.parentNode.removeChild(video)
    }
},
```

#### 演示

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/44339f90dcd44efeb8480fa3dfc00673~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

### 总结

第三种混合架构会议系统，实际上是三种架构里面最简洁且最强大的，按照上述搭建过程，实际上我们最应该注意的就是媒体流的`唯一ID`，也就是推流到 `SRS` 的 `StreamId`。按照这个推论，只要我们知道推流 ID，就可以拉取这个流到我们的会议室中，无论是本地视频推流还是监控、摄像头推流。

但是强大归强大，MCU 消耗的资源不容忽视，如果你要架设一套基于 MCU 的会议系统，那么你的 MCU 服务器必须很强大，同时涉及到媒体流的归一处理，因此宽带也是需要很大的消耗。

到这里我们算是学完三种架构的会议系统架设过程了，下面我们对这三种架构的场景做些适当的分析，让我们可以针对适当的场合选择适当的架构，更好地利用资源。

- 内网。三种架构都可以。

  - Web 会议，无其他终端等设施，单次同一会议室人数在 20 以内，推荐第一种 `Mesh`架构。
  - Web 会议，无硬件终端，同一个会议室人数 20 人以上，推荐第二种 `WebRTC`网关服务器参与的 `SFU`架构。
  - 多媒体+Web 会议，有监控等硬件终端，媒体复杂。直接用 `MCU`服务器参与的 `SFU+MCU` 混合架构。

- 公网。

  - 宽带有限且单次会议（携带视频媒体）人数不超过 20，第一种 `Mesh` 架构，可降低媒体质量等，提高参与人数。
  - 宽带有限，单次会议超过 20 人数，可限制同时打开摄像头人数和媒体质量，推荐第一种 `Mesh` 架构和 `WebRTC`网关参与的SFU架构。
  - 宽带无限制，可选择`WebRTC` 网关参与的 `SFU` 架构和第三种 `SFU+MCU` 混合架构。

当然，严格意义上来说，还有一种架构，我们在文章开头提到的 `MCU`合流，然后客户端仅仅拉取一个流的纯`MCU`架构，这算是第四种架构，这个纯 `MCU`架构对于服务器的 CPU、内存要求非常高，而且在客户端，对于媒体流的控制不是很灵活，因此这里不做推荐。

### 相关源码

[本节相关源码](https://github.com/wangsrGit119/suke-webrtc-course/blob/main/webrtc-link-demo/src/views/srs-meeting-room.vue)

### 课后题

本节课的会议源码中，我没有将媒体控制加入，大家完成上述会议基础功能后，可以参考前面的媒体控制《[10|会议实战：实时通话过程中音频、视频画面实时控制切换](https://juejin.cn/book/7168418382318927880/section/7172837736468971551)》章节，完善会议媒体控制功能。媒体控制我们在前面推流直播章节中也有，给大家写了具体案例，大家都可以参考下。