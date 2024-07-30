从点对点视频通话到点到多的小型直播间，再到直播间虚拟背景的切换，如果认真消化完这些内容，那么我相信大多数人已经从小白正式入门`WebRTC`了。接下来这节课我们就先不讲`WebRTC`会议模式，我们先玩个好玩的，如题。

一般意义上要完成弹幕，首选必须是即时通讯，比如大家熟知的 Websocket，通过即时消息实现实时弹幕展示。但是我们在前面《[04 | 实现点对点音视频及类 IM 的即时消息发送](https://juejin.cn/book/7168418382318927880/section/7172117235333824520)》那节课中提到了，利用`WebRTC`自己的实时数据传输通道即可实现类似 IM 的即时通讯功能，因此我们就用WebRTC自带的功能去完成“直播+滚动弹幕”。

正式开始之前，大家可以先翻到前面课程再熟悉下，我们接下来就直接进入主题。

### 基础流程

1. 建立`WebRTC`会话，并在初始化监听阶段创建数据通道（`DataChannel`）。
```js
/**
 * 创建数据通道
 * @param {Object} pc
 * @param {Object} localUid
 * @param {Object} remoteUid
 */
async createDataChannel(pc,localUid,remoteUid){
        let datachannel = await pc.createDataChannel(localUid+'-'+remoteUid);
        console.log("datachannel "+localUid+'-'+remoteUid,datachannel)
        dataChannelMap.set(localUid+'-'+remoteUid,datachannel)
}

//1.初始化 RTCPeerConnection => initPc
//2.初始化基础监听 initPc.ontrack() initPc.ondatachannel() initPc.onicecandidate()
//3.执行上步创建数据通道
await this.createDataChannel(initPc,localUid,remoteUid)
```

2. 通道建立成功，如果是 A 和 B 通话，那么 A 创建通道成功后，B 端则可以看到如下信息：
```js
pc.ondatachannel = function(ev) {
          console.log('用户：'+remoteUid+' 数据通道创建成功');
          ev.channel.onopen = function() {
                console.log('用户：'+remoteUid+' 数据通道打开');
          };
          ev.channel.onmessage = function(data) {
                console.log('用户：'+remoteUid+' 数据通道消息',data.data);
                // 弹幕上屏幕
                that.danmuForRoller(data.data)
          };
          ev.channel.onclose = function() {
                console.log('用户：'+remoteUid+' 数据通道关闭');
          };
        };
```

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/16702f9698d24f7bbc1b906c33ff1dae~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

3. 发送消息。
```js
//datasechannel 为创建通道端初始化后的通道实例
datasechannel.send(this.message)
```

至此，数据通道的创建和消息发送都没有问题了，接下来就要我们本节课的大招了：**利用数据通道打造实时弹幕。**

### 注意事项

前面的课程讲到基础流程，第二步就是创建通道者和创建成功的响应，也就是说 A 和 B 形成`WebRTC`关联，`A 如果创建数据通道，那么这个数据通道的操作权限就在 A` ，再明确点就是这个通道创建者才可以发消息，而和 A 形成关联关系的 B 仅仅是数据接受者。

**有了上面的解释，我们就要思考下，直播间数据通道如何创建。**

直播间主播和观众是一对多的关系，因此在观众这一端只会存在**一条发消息**的数据通道和一条收消息的数据通道；在主播这一端则存在着 **N 条数据发送通道，N 条接收消息的数据通道**（收消息的数据通道在这里虽然写了出来，但是并无需人工创建，拿前面例子： A 和 B 形成`WebRTC`关联之后，只要 A 创建了数据发送通道，那么 B 一定会存在与之对应的接受消息的数据通道）。

因此在实际编码过程中，我们的思路应该是考虑发消息的数据通道的创建，有了发送通道，在另一端必然存在接收通道。

**观众端**： 看下面代码，仅仅在加入直播间，以及主播建立关联关系后，创建一条数据发送通道即可，这样每个观众就可以将弹幕通过该通道发送给主播。
```js
    //和发布者建立RTC连接 不发送自己视频流
    let pcKey = localUid+'-'+publisher
    //初始化核心对象 PeerConnection 
    let pc = RtcPcMaps.get(pcKey)
    if(!pc){
            pc = new PeerConnection(that.rtcPcParams)
            RtcPcMaps.set(pcKey,pc)
    }
    // 设置仅接收流 不发送流
    pc.addTransceiver("audio", {direction: "recvonly"});
    pc.addTransceiver("video", {direction: "recvonly"});
    //初始化一系列监听 比如主播媒体流 主播ICE协商信息等等
    that.onPcEvent(pc,localUid,publisher)
    //创建数据通道
    await this.createDataChannel(pc,localUid,publisher)
    //创建offer
    let offer = await pc.createOffer();
    //设置offer未本地描述
    await pc.setLocalDescription(offer)
    //发送offer给被呼叫端
    ......
```

**主播端**： 请注意，观众每次加进来都会和主播建立一次`WebRTC`关联，每次都会创建主播和该观众的数据通道并保存在本地**数据通道 Map** 中，如此主播在发送弹幕的时候，遍历拿到所有观众的数据通道，再通过该通道将消息广播，观众端即可看到主播的消息。
```js
async onRemoteOffer(fromUid,offer){
        const localUid = this.formInline.userId
        let pcKey = localUid+'-'+fromUid
        //初始化核心对象PeerConnection 保存自己和直播间观众的关联关系
        let pc = new PeerConnection(this.rtcPcParams)
        RtcPcMaps.set(pcKey,pc)
        //监听 ICE候选信息和观众端创建的数据通道
        this.onPcEvent(pc,localUid,fromUid)
        //NOTE: 主播端创建数据通道，来一个观众建立一个通道
        await this.createDataChannel(pc,localUid,fromUid)
        //发送主播的直播流
        for (const track of this.localStream.getTracks()) {
            pc.addTrack(track);
        }
        pc.setRemoteDescription(offer)
        //其他操作
        let answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        let params = {"targetUid":fromUid,"userId":localUid,"answer":answer}
        this.linkSocket.emit("answer",params)
},
```

### 弹幕公共化

看完上面的流程和代码，有细心的同学可能会发现，观众端只和主播建立了`WebRTC`关联，并没有和其他的观众建立关联，那么，怎么能看到其他观众发送的弹幕呢？

这就要提到主播端维护的**数据通道 Map**了，利用这个 Map 中的通道，主播端可以将任何消息私信发给任何观众，因此当有观众发送弹幕到主播端的时候，主播利用该 Map 中的所有数据通道，将消息遍历发送给每个通道，即可实现弹幕的广播。

### 弹幕组件

要实现弹幕，必不可少的就是弹幕组件了。本小册用到的组件如下：
```js
"danmaku": "^2.0.4", // npm install danmaku 即可安装
```

具体用法如下，注意看代码中的注释，弹幕组件和媒体播放容器绑定，因此在主播端和观众端需要区分，参数有颜色设置、速度设置，以及字体设置等等，具体大家可以看[官方文档](https://github.com/weizhenye/Danmaku)。
```js
/**
 * 初始化弹幕容器
 */
initDanmuContainer(){
        if(this.formInline.pub==='pub'){//主播
                //增加弹幕组件
                this.danmaku = new Danmaku({
                    container: document.getElementById('localdemo01Parent'),
                        speed: 30
                });
        }else{ //客户端
                this.danmaku = new Danmaku({
                    container: document.getElementById('publisherVideoParent'),
                        speed: 30
                });
        }
        //首条弹幕
        this.danmaku.emit({text: '直播间已开启，请踊跃发言', style: {fontSize: '20px',color: '#ff5500'}})
},
```

### 完整代码地址

[本节课相关代码位置](https://github.com/wangsrGit119/suke-webrtc-course/blob/main/webrtc-link-demo/src/views/demo03-one2many.vue)

### 项目操作指南

1. 打开项目，找到模块：小型直播。
2. 直接点进去默认还是没有携带参数的，因此和前面的直播相关章节一样，都需要携带固定的参数。
3. 如果你不想自己去换其他参数，那么启动前端和信令服务器后，直接在同一个浏览器三个不同的标签页访问下面地址。
```bash
# 主播进入 房间号：10012 用户ID：1001 用户昵称：suke001
http://localhost:8080/demo03-one2many?userId=1001&roomId=10012&nickname=suke001&pub=pub
# 非主播进入 房间号：10012 用户ID：11111 用户昵称：US01
http://localhost:8080/demo03-one2many?userId=11111&roomId=10012&nickname=US01
# 非主播进入 房间号：10012 用户ID：22222 用户昵称：US02
http://localhost:8080/demo03-one2many?userId=22222&roomId=10012&nickname=US02
```

4. 操作：主播端在页面下方输入框输入消息，然后点击发送，注意观察 `US01` 和 `US02` 两端的`控制台`以及`弹幕`显示。
5. 效果。

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/292c19f92a0643a7b666fd1e5b01625e~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

### 温馨提示

弹幕我是利用组件展示在 `Video 元素`之上，大家实际用的时候可能会自定义其他的展示窗体，因此你需要明白的是数据通道数据过来的代码位置，在这里你可以`自定义数据操作逻辑`。

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/f871804753ef4328ae9f76bc0a01a001~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

### 课后题

这节课算是把`WebRTC`的数据通道掌握了，实际上数据通道不仅仅可以实现弹幕，利用这个，还可以实现很多花样，课后大家可以再熟悉熟悉数据通道用法，**传输文件、图片** 等数据。