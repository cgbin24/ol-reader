实战完 `Janus`会议室插件之后，这节课我们扩展下`Janus`的其他高级用法，比如会议录制、流媒体整合等等。

对于会议而言，实际最常见的，也是最需要的就是云端视频录制功能了，`Janus`作为 `WebRTC`网关是有这个条件和优势的，因为所有的视频流都是需要经过网关的。

Janus 在实现云端录制时有很多值得注意的细节实现，比如为了更高的录制效率和不影响网关服务的性能，使用了自定义格式 mjr，其内部保存了原始的 RTP 包，虽然这个文件格式我们没法直接访问，但是 Janus 也提供了转换工具将其转换为目标格式。

接下来我们就先看看这个云端录制功能吧。

### 云端录制

对于云端录制，Janus 是将不同插件的录制方式区分开的 ，videoCall 插件录制是可以在通话过程中对双方进行录制，而 videoRoom 插件则是针对会议室中的每个用户录制。最大的不同在于，会议室是按照房间设置，只要你设置了房间录制，那么整个会议室中的所有参会人员进入都会自动录制的。

#### videoCall 插件录制
```js
videoCallPluginHandle.send({ message:
        { request: "set", record: true,filename:'/home/janus-gateway/record/'+this.username+'-'+this.targetUserName, },
});
```

上面的一段代码就是手动开启云端录制的，可以自定义文件路径、文件名称。

![img](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/d07735e01bc24156a0801457c1d0d481~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

上面截图中的就是录制的文件，文件命名方式就是按照我代码中指定的通话双方的用户名来的。但是，请仔细看为何会出现三个文件呢？然后再看下三个文件名称后面半部分：`-data.mjr`、`-audio.mjr`、`-video.mjr`，单纯地看单词的意思，想必大家也能猜到了这几个文件代表的意思了，我就不含糊了，直接给出解释：

- Data 代表的是数据通道的数据；
- Audio 代表音频文件数据；
- Video 代表视频文件数据。

然后特殊的文件后缀 `.mjr`就是 Janus 自定义的数据保存文件格式了，内部包含了原始数据包。

#### videoRoom 插件录制
```js
createJanusRoom(roomId,roomUserCount,bitrate,pin,desc){
  const that = this;
  let create = {
    request : 'create',
    room: parseInt(roomId),
    bitrate: bitrate ? parseInt(bitrate)*1000: 300*1000,
    publishers: roomUserCount? parseInt(roomUserCount) : 12,//参与人数
    description:desc,
    record : true,//（是否要录制这个房间，默认=false）
    rec_dir : "/home/janus-gateway/record/", //<文件夹应存储录音，启用时>
    permanent:false,//是否持久化
    audiolevel_event:false, //向其他用户发送事件
    audio_active_packets:50 //音频级别的数据包数量，默认=100，2秒
  }
  if(pin){
    create.pin = pin; //加入房间所需的密码
    create.secret = pin;//编辑/销毁房间所需的密码
  }
  videoRoomPluginHandle.send({
    "message" : create,
    success: function(result) {
      console.log("创建房间",result)
    }
  })
},
```

实际上，上述代码就是创建房间的代码，但是里面有个配置：`record`和 `rec_dir`，这两个是设置要不要录制房间以及录制文件位置的。我们再看看录制文件：

![img](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/f1c6bfbb1486481c92a7b712bb68d4b2~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

可以很直观地看到 videoRoom 开头，第二段 199 表示的是房间号，后面的表示用户的 ID（我用 111、222、333 三个用户 ID 加入的会议室），录制文件后半部分和前面 videoCall 插件录制格式一致，都是 data、audio、video 三种格式分离的。

以上就是两种插件在云端录制的会议文件，但是现在有个问题，上面已经录制好的文件并不是我们熟悉的 mp4 等常见视频格式，这意味着拿到上述文件后我们也是没法直接播放的，那怎么办？

当然有解决方案了，Janus 这个也替我们考虑好了，其内部也提供了转换工具，让我们直接可以将对应的 mjr文件转换成对应可直接播放的音频和视频文件格式。

#### 文件转换
```sh
janus-pp-rec ./$media_prefix-video.mjr $tmp_video.webm
janus-pp-rec ./$media_prefix-audio.mjr $tmp_video.opus
```

上述代码就是核心转换语句，视频文件转换为 webm 格式，音频转换为 opus 格式。看下面转换实例：

![img](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/efa07c704a3841e493d3ac9783807f4a~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

![img](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/1010565f3d81498f8adafb03bc08b842~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

上面转换完成后的视频和音频格式文件是直接可以播放的，按照业务，可以将对应的视频或者纯音频存档等，如果需要视频和音频合成文件，办法也多得很，比如针对上面两种文件格式，利用 ffmpeg 合并音频视频即可。
```sh
ffmpeg -i $tmp_audio -i $tmp_video  -c:v copy -c:a opus -strict experimental $output_file
```

具体的业务场景还需要和自己的架构匹配，比如和在线 OSS 结合，将对应文件储存在 OSS 中等等。

### 多流传输

Janus 的高级特性之一：`multistream`，简单来讲就是在单个连接中传输多个视频流。

在 `videoRoom`场景中使用代码如下：
```js
async startShareScreen(){
        this.shareStreamTag = true
        videoRoomPluginHandle.createOffer({
                tracks: [{ type: 'screen', add: true, capture: true }],
                success: function(jsep) {
                    videoRoomPluginHandle.send({ message: { request: "configure",video: true }, jsep: jsep })
                },
                error: function(error) {
                    console.log('WebRTC error... ' + error.message);
                }
        });
}
```

![img](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/3c857818697d45acabee12fda4e13c57~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

看上图日志，mid:0 为音频流，mid:1 为视频流，mid:3 也是视频流（我分享屏幕的流），也就是说，我在摄像头语音的同时，屏幕分享也是同步分发的。

请注意监听到的流不一定都是添加哦，`added`为 true 的是有新的流过来，false 则表示某个流断开或者该用户离开了。

![img](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/35f45adb607a4b6a8fb21cbb376ce4b0~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

### 音频级别会话提醒

这个功能算是会议中最友好的功能了，尤其是在 N 多个人开会的时候，会自动显示是哪位参会人在讲话，具体设置还是和 videoRoom 插件相关的。
```js
let create = {
    request : 'create',
    room: parseInt(roomId),
    bitrate: bitrate ? parseInt(bitrate)*1000: 300*1000,
    publishers: roomUserCount? parseInt(roomUserCount) : 12,//参与人数
    description:desc,
    record : false,//（是否要录制这个房间，默认=false）
    rec_dir : "/home/janus-gateway/record/", //<文件夹应存储录音，启用时>
    permanent:false,//是否持久化
    audiolevel_event:false, //向其他用户发送事件
    audio_active_packets:20 ,//音频级别的数据包数量，默认=100，2秒
    audiolevel_event:true,
    audiolevel_ext:true,
  }
```

着重看上面创建会议室的后面三个参数，第一个就是监听数据包，越低则表示响应得越灵敏，接收一点点声音就触发提醒事件；第二个参数表示开启事件提醒；第三个参数则表示是否向其他人发送对应的事件，当然必须开启的。

事件监听的位置和其他的通用事件监听位置一样，看代码：
```js
onMessageForVideoRoom(msg,jsep){
        const that = this
        const event = msg["videoroom"]
        if(jsep) {
          //设置远程应答描述
          videoRoomPluginHandle.handleRemoteJsep({ jsep: jsep })
        }
        switch (event){
          case 'joined':        
                //加入房间事件
            break
          case 'talking':
                  //正在发言的事件
                that.$message.success(msg['id']+"正在讲话")
                break;
          case 'event':
            //会议内其他仅会议事件比如 离开 、加入、被踢、等等 
            break
          default:
            break
        }
},
```

![img](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/971b51f452d34d129c265529e78fe5e8~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

看上图截图日志，正在发言和停止都有对应的提醒事件，同时还会携带发言人的用户 ID，通过该 ID 可以直接检索到房间内的用户，进而在会议室中提醒大家谁正在发言。

最后关于音频级别事件而言，`audio_active_packets`数据包这个配置不能太低，如果太低就会看到我上面控制台打印的一堆日志，稍微咳嗽或者呼吸声稍大一点就会触发，频繁的提醒，对于会议质量而言并不是很好，因此大家在实际场景中可以稍微配置大一些。

### 一键闭麦全局控制

在众多人数参会的会议中存在很多不可避免的问题，比如人员嘈杂、发言混乱、发言内容不可控等，因此管理员拥有全局闭麦权限是很有意义的。

在 Janus 网关中，videoRoom 插件也提供了这样的能力，可以一键控制会议室中每个成员的麦克风，具体控制代码如下：
```js
closeMic(row,b){
        const that = this
        that.globalAudioStatus = !that.globalAudioStatus
        videoRoomPluginHandle.send({
          'message': {
            request: "moderate",
            // secret: "",
            room : that.roomNumber,//房间号
            id : row.id,//用户唯一ID
            mid: '0',//音频包的标识
            mute : b//true/false  禁言和解禁
          },
          success: function (res){
            console.log(res)
                
          },
          error: function (err){
            console.log(err)
          }
        })
},
```

核心参数也就那么几个，在代码中我都注释了，很好理解。

具体演示：

![image.png](https://p9-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/57c5e06b15db402c9ac932cd0617ce9a~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

### 本节课相关代码

[本接口代码仓库地址](https://github.com/wangsrGit119/suke-webrtc-course/blob/main/webrtc-link-demo/src/views/demo04-janus-02.vue)

### 小结

通过 videoCall 和 videoRoom 插件，我们实现了会议所需要的基本功能，无论是控制还是展示，Janus 网关可以很轻易地实现一个无需后台的私有化会议室，这对于我们业务而言是最佳的。

所以如果你的业务场景中需要会议系统，但不想自己实现信令服务器，则完全可以用现在的第二种架构来实现。

### 课后题

既然都学习了两种插件的用法了，那么大家课后可以玩玩另一个插件：`janus.plugin.streaming`，这个插件可以实现各种媒体流的播放，比如：RTP、RTSP、RTMP 等。对流媒体有使用场景的同学，我相信很需要这个插件，如果遇到问题了，可以在评论区或社群留言。