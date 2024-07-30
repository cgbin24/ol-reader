在初步尝试完第一个点对点音视频呼叫插件之后，这节课我们就要深入到会议系统实战了。既然是会议，那就肯定离不开 “多人” 和 “多房间” 这两个概念了。这两个概念和我们的 Janus 网关搭在一起的话，那必然是离不开 `VideoRoom` 插件的，因此我们这节课的目的就是使用`VideoRoom` 插件完成第二种架构的会议系统。

在正式开始之前，我们还要注意标题中提到的“第二种架构”这个关键词，我们在学第一种会议系统的时候，用的架构是 `Mesh`架构，而在本节课很明显就不再是 `Mesh`架构了，而是一种全新架构：`SFU`架构。

我们先回顾下在小册《[09 |会议实战：WebRTC 实现多房间多用户的第一种架构会议系统](https://juejin.cn/book/7168418382318927880/section/7172208545868283917)》这一讲中已经学过的 Mesh 架构的大体架构图：

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/b8cc8883eef24254956020f9cbd21d3c~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

简述就是：你要和 N 个客户端通话，前提是你必须与这 N 个客户端都一一建立 WebRTC 关联。

而这节课的 SFU 架构图如下：

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/0fd2ffb1645c4386b17a4d6233336b5b~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

我们对着架构图，利用实际场景来解读下当前架构的工作流程。

**前置条件：**

有三个客户端浏览器 A、B、C ，一个 Janus 网关服务器，三个客户端要借助网关的能力达到视频会议的目的。

**通话流程：**

A、B、C 三个客户端开始通话之前，并不是简简单单地在 Janus 网关中注册自己的信息就行了，对于 P2P 通话而言，进行注册后直接呼叫即可（上一节内容），但是在本节会议插件中是不行的。

要实现会议的功能，客户端在完成注册信息到网关之后，还要和 Janus 网关进行 RTC 关联，对的你没看错，是和网关，而不是直接和别的客户端进行 RTC 关联。这里网关担任的角色类似一个“房产中介”，所有要参会的客户端都可看作是“房东”，而客户端的媒体流可看作是“房东”的“房子”，这样类比下来，我们的网关是不是很形象了？

等所有的客户端都和网关关联之后，这些客户端就可以自己去订阅和自己在同一个会议室的客户端媒体流了。这整个过程，实际上就是房东将房子挂在中介，然后想要房子的人去中介那里去购买一样。

再看架构图 A、B、C 在和 SFU 网关进行 RTC 关联之后，A 订阅 B、C 的媒体流并不需要再去和 B、C 去“打交道”，而是直接和网关交互，这就是 SFU 架构下媒体交互的基础流程。

**SFU 架构优缺点：**

- **节约宽带**。在当前架构中，可以很明显地看到，任意一个客户端只需要向网关发送一份媒体流即可。
- **扩展性更强**。服务端可容纳的客户端更多。
- **控制媒体**。因为涉及到了中间服务器，那么必然是可以对媒体流进行处理的，比如录制、参数调节、画面变更等。
- **安全**。同上条，在接收到媒体包之后，服务端可以动态进行加密等。
- **服务端压力大**。因为所有的媒体流的转发交互基本都在服务端，如果涉及到录制等，对服务器压力更大，同时服务端所需的宽带也有一定的要求。

讲完了 SFU 架构的相关概念后，我们通过 Janus 的会议插件去具体实战下，实现我们小册的第二个目标：第二种架构的会议系统。

### 会议插件初始化

初始化的核心和上一节 `videoCall`插件一样，我们从开始就讲过了，Janus 的特性就是 “即插即拔”，`videoCall`插件的初始化也是一样的。

除了初始化之外，里面涉及的的回调方法也是通用的，但是回调的具体参数是做了区分的，这个我们后面仔细看下。
```js
initVideoRoomPlugin(){
        const that = this
        janus.attach({
                plugin: "janus.plugin.videoroom",
                opaqueId: opaqueId,//客户端唯一标识
                success: function(pluginHandle) {
                    //插件初始化成功后 pluginHandle 就是全局句柄，通过 pluginHandle可以操作当前
                    //会话的所有功能
                    videoRoomPluginHandle = pluginHandle
                    console.log("会议插件初始化成功")
                },
                error: function(cause) {
                    //插件初始化失败
                },
               webrtcState: function(on) {
                     console.log("WebRTC PeerConnection 状态 is " + (on ? "up" : "down") + " now");
               },
               slowLink: function(uplink, lost, mid) {
                       console.warn("Janus 问题报告： " + (uplink ? "sending" : "receiving") +
                               " packets on mid " + mid + " (" + lost + " lost packets)");
               },
                onmessage: function(msg, jsep) {
                        console.log("msg",msg)
                        //msg 交互信息包括挂断 接听等事件监听
                        // jsep  协商信令
                        that.onMessageForVideoRoom(msg,jsep)
                },
                onlocaltrack: function(track, added) {
                    console.log("本地媒体",track,added)
                    if(added===true){
                            that.setDomVideoTrick("localDomId",track)
                    }
                                
                },
                onremotetrack: function(track, mid, added) {
                   
                },
                oncleanup: function() {
                    // PeerConnection 关闭监听
                    // 同时可以创建信的句柄(旧的可用)重新初始化
                },
                detached: function() {
                     // PeerConnection 关闭监听
                    // 同时可以创建信的句柄（旧的不可用）重新初始化
                }
            });
},
```

### 会议插件基本功能

初始化完成之后就是使用了，而使用的具体细节就需要看看 `videoRoom`插件的具体功能了，下面我们来看看插件的基本功能和基础用法。

**动态创建会议室**。要实现会议，前提条件就是可以动态提供不同的房间让不同的客户端去加入，`videoRoom`插件提供了对应创建房间的 API ，具体参数看下面代码注释：

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/abc1d39c2875473da308bfe5e69acbc2~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

```js
createJanusRoom(roomId,roomUserCount,bitrate,pin,desc){
      const that = this;
      let create = {
        request : 'create',
        room: parseInt(roomId),//房间号 必须为数字类型
        bitrate: bitrate ? parseInt(bitrate)*1000: 300*1000,//比特率 限制房间内速率
        publishers: roomUserCount? parseInt(roomUserCount) : 12,//参与人数 设置房间的最大容纳人数
        description:desc,//房间描述 备注 自定义房间名称
        record : false,//（是否要录制这个房间，默认=false）
        rec_dir : "/home/janus-gateway/record/", //<文件夹应存储录音，启用时>
        permanent:false,//是否持久化 如果为true则服务重启后此房间还是存在，并不会因为服务重启而房间丢失
        audiolevel_event:false, //向其他用户发送事件
        audio_active_packets:50 //音频级别的数据包数量，默认=100，2秒 这个在语音激励有很大作用
      }
      if(pin){
        create.pin = pin; //加入房间所需的密码
        create.secret = pin;//编辑/销毁房间所需的密码
      }
      videoRoomPluginHandle.send({
        "message" : create,
        success: function(result) {
          Janus.log("创建房间结果",result)
        }
      })
    },
```

**房间用户获取和控制**。有了会议室，正常操作就是实时获取房间用户列表，并控制对应房间用户，比如踢出、静音等操作。

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/c67995a31e4a43c881b377f2609f476d~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

```js
//房间用户列表加载
videoRoomPluginHandle.send({
    "message" : {
      request : 'listparticipants',
      room: this.roomNumber,
    },
    success: function(result) {
      Janus.log(result)
    }
  })
 //踢出房间
videoRoomPluginHandle.send({
  "message" : {
    request : 'kick',
    room: this.roomNumber,
    id: userId
  },
  success: function(result) {
    console.log(result)
  }
})
```

**加入房间并实现视频通话功能**。这个功能也是目前这节课的核心功能了，`videoRoom`插件在实现多人视频通话的设计上很巧妙，它将用户分为发布者和订阅者两种大类，发布者即为媒体流的发布用户，而订阅者即为订阅发布者媒体流的用户。

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/8302dc4b7bde4b14ae780fe675d62192~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

看上图，仔细想想发布者和订阅者，如果取交集，那不就是我们会议中的参会人员吗？在发布自己的画面的同时也要获取其他用户的画面。而 videoRoom巧妙的设计，不仅仅可以让我们用该插件实现会议，同时也可以实现直播室（一个 pub，N 个 sub）。当然这个功能也让房间变得更加灵活，在众多人参会的情况下，我们可以选择自己想要订阅的媒体流，比如 30 个人都开了摄像头，但是你可以只订阅其中的指定用户。

### 实战会议

通过前面基本功能概述，我们对`videoRoom`插件有了基本认识，而发布者订阅者角色的分离，也让我们业务代码处理更加灵活，接下来就看看具体实现会议的流程和细节吧！

**用户加入房间。**

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/3f68ae97abd648baa61a8f0437a6ec95~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

```js
joinRooom(){
      const join = {
      request: "join",
      room: parseInt(this.roomNumber),//房间号 数字类型
      // pin: "123",//房间密码
      id: this.userId,//用户ID  数字类型
      ptype: "publisher", //用户类型 发布者
      display: this.username //展示昵称 
    };
    //全局句柄
    videoRoomPluginHandle.send({
      'message':join,
      success: function (res) {
        console.log("正在加入会议室："+that.roomNumber+" 用户: "+that.username)
      },
      error: function (err){
        console.log("加入过程中出错",err)
      }
    })    

}
```

**发布自己媒体流**。加入成功后，可以自己选择是否发布媒体流，按照实际情况来即可，这里我按照常规的来。
```js
publisherStream(){
  const that = this
  //send offer 这里所有的协商都是和Janus服务器进行的 P2P协商，也就是你进行的会话网关服务器暂时替你完成
  videoRoomPluginHandle.createOffer({
          tracks: [
                  { type: 'audio', capture: true, recv: false },
                  { type: 'video', capture: true, recv: false },
                  { type: 'data' },
          ],
          success: function(jsep) {
            console.log("发布者 SDP!", jsep);
            const publish = { request: "configure", audio: true, video: true,restart:true}
            videoRoomPluginHandle.send({ message: publish, jsep: jsep });
          },
          error: function(error) {
            console.error("WebRTC error:", error);
          }
  })
},
```

**监听服务器响应的事件**。在和网关服务器完成 P2P 连接后，其他用户加入的房间如果`发布或暂停`媒体信息网关服务器则会通知先前加入的用户，以让其他用户同步做出变更。

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/05d9e1a0b7c14b938b6e1e694346b589~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

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
                    that.private_id = msg['private_id']
                    that.publisherStream()
                //媒体发布者
                if(msg["publishers"]) {//新加入房间获取媒体发布者(注意这里)
                  const list = msg["publishers"];
                  for(let u in list) {
                            let publisher = list[u]
                            that.localPubDomPush(publisher["id"],publisher["display"])
                            that.streamMap.set(publisher["id"],publisher)
                            that.subscriberMedia(publisher)
                  }
                }
                break
              case 'event':
                if(msg['unpublished']){
                  console.log('用户'+msg['unpublished']+'停止发布流')
                }else if(msg['leaving']){
                  if(msg['reason'] && msg['reason'] === 'kicked'){
                    console.log('您已被踢出房间')
                    this.streamMap = new Map()
                  }else if(!msg['reason']) {
                    that.streamMap.delete(msg['leaving'])
                    console.log('用户'+msg['leaving']+'主动离开房间'+msg['room'])
                  }
                }else if(msg['moderation'] && msg['moderation'] === 'muted' ){
                  console.log('用户'+msg['id']+' 已被禁言')
                }else if(msg['publishers']){//已在房间用户监听到媒体变更（注意这里）
                  const list = msg["publishers"];
                  for(let u in list) {
                    let publisher = list[u]
                            that.localPubDomPush(publisher["id"],publisher["display"])
                    that.streamMap.set(publisher["id"],publisher)
                    that.subscriberMedia(publisher)
                  }
                }else if(msg['error_code']){
                    if(msg['error_code'] === 426){
                      
                    }
                }
                break
              default:
                break
            }
    },
```

请注意我在上面代码中标注的两个位置，这两个位置的代码都是一样的，都是订阅用户媒体流。第一个是用户刚加入房间时，订阅房间已存在发布媒体信息；而第二个则是当用户已经在开会过程中，监听到其他新的媒体发布者进来后再订阅媒体流。

**订阅媒体流。**

订阅的步骤看起来代码很多，但是思路清晰了也没啥难度：第一发送订阅请求，第二和网关服务器完成WebRTC 的基本会话流程，之后服务端就会转发媒体流到客户端。
```js
/**
 * 订阅当前房间媒体流
 * @param user (publisher 媒体发布者)(id,display,audio,video)
 */
subscriberMedia(user){
  const that = this;
  var publisherPlugin = null
  janus.attach({
    plugin: "janus.plugin.videoroom",
    success: function(pluginHandle) {
      publisherPlugin = pluginHandle
      var subscribe = {
        request: "join",
        room: that.roomNumber,//指定订阅房间
        // pin: this.roomSecret,//房间密码
        ptype: "subscriber",//类型 订阅者
        feed: user['id'],//被订阅用户ID 新版本API 更改为指定订阅数组 具体看课程后面仓库最新源代码 subscription.push({feed: user['id'],mid: stream.mid	 //这里是可选项 果不填则默认获取所有的流});
       private_id: that.private_id,//Janus分配的用户ID
      };
      publisherPlugin.send({ message: subscribe });
    },
    error: function(error) {
      console.error("  插件加载异常", error);
    },
    consentDialog: function(on) {

    },
    onmessage: function(msg, jsep) {
      console.log("订阅媒体发布者消息监听：",msg,jsep)
      const event = msg["videoroom"];
      if(jsep) {
        // Answer and attach
        publisherPlugin.createAnswer(
          {
            jsep: jsep,
            tracks: [
                    { type: 'data' }
            ],
            success: function(jsep) {
              Janus.debug("Got SDP!",jsep);
              //订阅成功后start 这个目的是完成 WebRTC的基础流程
              var body = { request: "start", room: that.roomNumber };
              publisherPlugin.send({ message: body, jsep: jsep });
            },
            error: function(error) {
              Janus.error("WebRTC error:", error);
            }
          });
      }
      switch (event){
        case 'attached':
          console.log('订阅用户：'+user['display']+' 媒体信息成功')
          break
        default:
          break
      }
    },
    onlocaltrack: function(track, added) {
      console.log('publisherOperator#onlocaltrack=> ',track, added)
    },
    onremotetrack: function(track, mid, added) {
      // The publisher stream is sendonly, we don't expect anything here
      let obj = {
        track:track,
        mid: mid,
        added: added,
        userId: user['id'],//被订阅用户ID 
        display: user['display'],//被订阅用户昵称
        trackKind: track['kind']//类型  video/audio
      }
      console.log("订阅媒体流变更信息 ：",obj)
      //挂在到指定的DOM即可
          if(added){
                  that.setDomVideoTrick(user['id']+'-video',track)
          }
    },
    oncleanup: function() {
      console.log(" ::: Got a cleanup notification: we are unpublished now :::");
    }
  });
},
```

好了，以上就是利用 videoRoom 插件的巧妙设计（媒体发布和订阅交集）实现 SFU 架构会议系统的基本步骤，整个流程很简单，需要大家要注意的点也就是其中的媒体发布和媒体订阅代码逻辑。

### 项目操作指南

1. 打开项目，打开下面模块：Janus 会议室。

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/f7dacb5f336b4bd2b633e3b7681f4507~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

2. 先创建房间，然后点击加入房间。创建房间只需第一次访问的时候创建即可，之后会在网关服务器内存中保存，如果想要持久化，则可以看前面创建房间的配置。

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/8819e010c8fc40a7a3e8abc8ec084790~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

3. 用户 ID 不用更改，默认使用时间戳；修改用户名让不同用户加入到同一个房间。

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/5c67c75563fe4c319147bbf4c6757a88~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/acd918c2374c4aa28e56cbb6780513cf~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

### 代码仓库

[本接口代码仓库地址](https://github.com/wangsrGit119/suke-webrtc-course/blob/main/webrtc-link-demo/src/views/demo04-janus-02.vue)

### 课后题

这节课我并没有将除了会议的其他功能写在 DEMO 中，课后大家在实现会议功能之后，尝试将踢人、麦克风控制、视频控制等操作加在上面，看看有没有难度。