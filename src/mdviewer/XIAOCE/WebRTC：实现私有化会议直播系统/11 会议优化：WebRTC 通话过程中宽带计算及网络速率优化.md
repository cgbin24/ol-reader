前面的课程中我们接触并搭建了 `Mesh 架构`下`WebRTC`会议系统，这节课我们通过宽带这个概念去看看这个架构存在哪些问题，以及怎么优化当前架构下的会议系统。

在具体介绍和计算的时候，我会提到一些基础概念，结合这些概念，我们来计算下在固定人数的视频会议过程中宽带的消耗。

### 消耗宽带计算

我们先来看几个概念。

1. **宽带**：1M 带宽即 1Mbps（是`兆比特`每秒 `Mbps` 不是 `兆字节` 每秒 `MBps`）。
2. **字节和比特（Byte 和bit）** ：1 字节 = 8 比特。
3. **宽带计算**：1 M宽带 = (1 * 1024 ÷ 8 ) KB/s = （1 * 1024 ÷ 8 ÷ 1024）MB/s。
4. **下行速率/下载速度**：100 兆宽带 = 100 * 1024 ÷ 8 Kb/s = 12800 KB/s = 12.5 MB/s。
5. **上行速率**：这个很迷，理论值和实际值不对等的，自己直接在线测下即可（下面是我的实际测试值，上下行 1:4 左右）。

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/efc994aea01b48f5809e4cd4b8ad254e~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

6. **分辨率**：1920x1080 的分辨率，代表 1080P；1280x720 分辨率，代表 720P；（我相信你们已经能按照分辨率推测出其他的画质清晰度了，720x480：480P）。
7. **视频的帧速率**：在小册第二节讲`constraints` 约束时我们讲过：每秒钟连续多少帧画面，一般流畅值为 24`FPS`。
8. **帧大小计算**：帧大小取决于**颜色深度**，在 8 位色深中，每个像素可以有 2⁸ = 256（0-255） 种颜色中的一种，占 `8bit` 即一个字节；24 位则占三个字节；由此**帧大小= 水平分辨率 * 垂直分辨率 * 颜色深度**。举例 480P 画质的帧大小= 720 * 480 * 24 = 8294400。
9. **比特率**：**帧大小 * FPS * BPP / 1024**，如果再乘以时间就可以计算出这段时间内的视频大小了。
10. **压缩指标**： **每像素位数 BPP（Bits per Pixel）** ， 一般来说这个值在 0.1 左右视频质量都是很好的。

假设你需要和 4 个人视频，每个人的画质降低到 480P，此时你需要将你的画面发送给四个人，因为每个人都和你建立关联所以你需要发送四份（Mesh 架构下），发送这四份消耗的是上行宽带，具体消耗多少呢？一份 480P 视频帧速率按照 24 `FPS`来算（计算的时候我们默认先**不考虑颜色深度**这个概念，以及**忽略音频**的比特率大小）：
```js
// 比特率计算 不考虑颜色深度 则默认为 X1
let frameSize = 720*480*1 = 345600 //帧大小
let biterate = frameSize * 24 * 0.1 / 1024 ~= 810 Kb/s
let total = biterate * 4 = 3.24 Mb/s
```

上面的计算结果和在线的比特率计算器我们可以对比下：[在线比特率计算器](https://www.omnicalculator.com/other/streaming-bitrate)

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/187575abbcda43088e2b96f0a2d77906~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

总的算下来四个视频发出去需要消耗的上行宽带至少是 每秒 **4M** 左右，如果再加上你需要获取别的人员的视频，就需要单独的下行宽带也在 每秒 **4M** 左右，一般而言上行宽带和下行宽带是不等价的，从前面测试中就可以发现。

### 优化会议质量

了解了消耗宽带的计算，我们就需要优化我们的会议系统了，在**小册第二讲**中我们我们讲到了很多约束参数，根据实际情况我们再看下参数，实际情况帧速率 24 就可以了，所以我们设置 FPS 为 24，但是在网络状况差的时候是可以接受延缓的，因此如下：
```js
const constraints = {
    audio: true,
    video: {
        width:1920,
        height:1080,
        frameRate: { min:10 , ideal: 15, max: 24 }
    }
};
```

而在很多情况下，多人会议并不需要去关注画面的清晰度，此时可以将整体的分辨率调低到 `480P` 左右，当然 `360P` 也是可以接受的，如下：
```js
const constraints = {
    audio: true,
    video: {
        width:720,
        height:480,
        frameRate: { min:10 , ideal: 15, max: 24 }
    }
};
```

需要注意的是，遇到屏幕分享这个场景，大家记得一定要调高分辨率，不然对面看到的画面就是马赛克了。

除了上述设置限制`分辨率`和`FPS`之外，我们还可以限制发送的 `Bitrate`即自己的出口宽带。在和另一端建立 `RTC 连接`之后，我们可以根据上一讲中提到的画面控制参数来变更发送的 `Bitrate`。
```js
//pc 为 核心关联 PeerConnection实例 
let senders = pc.getSenders()
let sender = senders.find((s) => s.track.kind === 'video')
const params = sender.getParameters();
//比特率设置
let bitrate = 100*1024
params.encodings[0].maxBitrate = bitrate;
 //同步参数
 await sender.setParameters(params);
```

### 会议实时宽带计算

在《[09 | 会议实战：WebRTC 实现多房间多用户的第一种架构会议系统](https://juejin.cn/book/7168418382318927880/section/7172208545868283917?scrollMenuIndex=1)》这节课的会议 Demo 中，大家点击统计按钮就会在参会人员画面中显示实时消耗的宽带，计算的核心还是我们反反复复提到了多次的`PeerConnection` **实例对象**，下面代码就是计算所有和当前客户端建立 `RTC 连接`后实时视频过程中宽带统计的计算方式。

> 注意代码中的注释：出口宽带和入口宽带，出口宽带计算的是你发送流单位时间所消耗的比特流，而入口宽带就是通过当前`RTC连接`远程客户端发送的媒体流到你的客户端展示所消耗的比特流。
```js
calculateSendBitrate(userId,pc){
        let that = this
        let lastResultForStats = this.lastPeerStatsMap.get(userId)
        pc.getStats().then(res => {
                res.forEach(report => {
                        let bytes;
                  let headerBytes;
                  let packets;
                  //出口宽带 outbound-rtp  入口宽带 inbound-rtp
                  if (report.type === 'outbound-rtp' && report.kind ==='video') {
                                const now = report.timestamp;
                                bytes = report.bytesSent;
                                headerBytes = report.headerBytesSent;
                        packets = report.packetsSent;
                                
                        if (lastResultForStats && lastResultForStats.has(report.id)) {
                                let bf = bytes-lastResultForStats.get(report.id).bytesSent
                                let hbf = headerBytes - lastResultForStats.get(report.id).headerBytesSent
                                let pacf = packets - lastResultForStats.get(report.id).packetsSent
                                let t = now - lastResultForStats.get(report.id).timestamp
                                // calculate bitrate
                                const bitrate = (8 * bf/t).toFixed(2);
                                const headerrate = (8 * hbf/t).toFixed(2);
                                const packetrate = Math.floor(1000 * pacf/t);
                                console.log(`${userId} ==> Bitrate ${bitrate} kbps, overhead ${headerrate} kbps, ${packetrate} packets/second`);
                                }
                        }
                })
                that.lastPeerStatsMap.set(userId,res)
        })
},
```

核心还是通过`RTCPeerConnection`对象的`getStats`方法计算，定时器中定时去获取这个方法返回的信息，看上面代码中`report.type === 'outbound-rtp'`出口宽带这里。

### 项目操作演示

1. 打开项目，找到模块：多对多网络视频。

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/30b5f2b1f58e4be3bb94309ecc02dc08~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

2. 用不同账户入会，两个用户即可。
3. 打开视频后第二个人的页面下面点击 `stats`按钮。稍等片刻，就是实时显示对面用户画面的实时比特率了。

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/883fbbe97fe2478586366b9152f4da3b~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

4. 切换第一个用户标签页面，点击对面用户视频画面，此时触发画面控制参数设置。
```js
async setBiterate(uid){
    //通过用户ID获取关联的Peer实例化对象 当前用户是谁 那么对应用户的画面就会生效 比如A、B、C
    //三个通话，那么A这边点击 B 的画面此时设置的是B画面的出口宽带，因此在 B 端比特率就会变更。
    //要全局生效也很简单，就是遍历 RtcPcMaps 中的所有 Peer实例，给予每一个的关联都设置该参数。
    let pcKey = this.formInline.userId+'-'+uid
    let pc = RtcPcMaps.get(pcKey)
    if(pc){
            let senders = pc.getSenders()
            let sender = senders.find((s) => s.track.kind === 'video')
            //获取控制参数
            const params = sender.getParameters();
            //在不兼容的终端可能这个参数为null 因此请参考上节课我们提到的赋值初始变量
            //比特率设置 100 kbit/s
            let bitrate = 100*1024
            params.encodings[0].maxBitrate = bitrate;
             //同步参数
            await sender.setParameters(params);
    }        
},
```

5. 演示。请注意动图中的比特率变化。

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/ba9646753c264e3e93749a7aed039d3f~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

### 后话

实际上，影响整个会议系统的不仅仅有宽带因素，还有自己当前主机的限制，每一路流都需要浏览器的编码解码，如果参会人数很多，你的笔记本性能很不好的话，那么就很容易造成卡顿，但是大多数情况下，比如二三十人的小型会议还是没有任何问题。

### 课后题

这节课学完，我们的第一阶段算是完成了，后面就是利用开源流媒体服务器打造其他场景的会议系统了。希望在第一阶段结束后，大家都可以实现一个在区域网内可以使用的会议系统，加油！有任何问题留言即可。

> 注意：若区域网内，通过ip地方访问Demo项目，获取不到摄像头信息，查看**基础API章节提到的 “安全源（security source）”**