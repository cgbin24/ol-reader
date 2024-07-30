大家好，学完前面两种架构的会议系统搭建，大家是不是已经迫不及待想要实现自己的私有化会议系统，或者想要直接在自己公司的业务中使用了？先不要急，如果你的业务中涉及和流媒体相关的使用场景，比如监控、`RTSP`、`RTMP` 等，那么这节课的内容应该能合你胃口。

前面的课程讲的都是简单的音视频场景应用，而没有深入讲音视频本身的东西。想要深入了解音视频，那么必不可少的就是流媒体这一块的知识了。在正式开始学习流媒体服务`SRS` 之前，我们先学习一些基本的流媒体相关知识。

### RTMP

Real-Time Messaging Protocol，简称`RTMP`，是一种支持实时在线视频流的数据传输技术，最初是用在流媒体服务和 [Flash播放器](https://en.wikipedia.org/wiki/Adobe_Flash_Player) 之间传输多媒体流的。因此以前在浏览器中，只要有 Flash 播放器插件，就可以直接在线播放媒体流。然而在2021年左右，谷歌、微软等几大厂商集体做出决策（漏洞安全问题、封闭性、性能等多种因素），正式弃用。在谷歌浏览器 88 版本之后也将 Flash player 正式删除。

现在我们网页端是没法直接播放`RTMP`的，如果想要播放就必须转换成浏览器中播放器支持的流类型播放，比如：mp4、flv、hls等。

在实际使用场景中我们会用到`RTMP`的两种传输方式：推送和拉取，即：你可以将自己的视频通过`RTMP`推送到流媒体服务器和从流媒体拉取对应的流。

常用端口：1935。

### RTSP

Real Time Streaming Protocol ，简称 `RTSP`，它本身不会传输媒体流，而是充当客户端和与媒体服务端之间的控制通信，和`RTP`、`RTCP` 协议搭配，用于媒体流的传输。

### RTP

全称：Realtime transport protocol，真正意义上的数据传输协议，数据包构成包含版本号、填充位、标记位、有效荷载类型（这里就是标识不同类型媒体的，比如 H.264 视频、G.711 音频等）、序列号、时间戳等，具体详细解释可以看[这里](https://zh.m.wikipedia.org/zh-hans/%E5%AE%9E%E6%97%B6%E4%BC%A0%E8%BE%93%E5%8D%8F%E8%AE%AE)。

我们只需要知道，RTP 包传输的就是我们音视频会话过程中所需要的流量，当然发送的底层协议还是通过 UDP，因此在前面的数据包构成中，我们可以看到序列号、时间戳参数，目的就是让接收端可以自定义缓冲区，用于乱序纠正或者音画同步。

### RTCP

全称：Real-time Transport Control Protocol 或 RTP Control Protocol ，或简写 RTCP，是 RTP 的姊妹协议，RTCP 本身并不传输数据，但和上面提到的 RTP 一起协作将媒体数据打包和发送。RTCP 收集相关媒体连接的统计信息，例如：传输字节数、网络状态、丢包状况、单向和双向网络延迟等等，这样可以控制服务质量，诊断网络状况。

我们的课程的主题，WebRTC 实现的会议系统通话过程中数据包的检测、反馈，都是通过这个协议。

### SRS 服务器搭建

搭建前，按照惯例我们必须要熟悉下 SRS 具体是个什么东西。

![img](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/21633c70f0504290922323572e30ae83~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

看上面[官网](https://ossrs.net/lts/zh-cn/docs/v4/doc/introduction)描述，一个简单高效的实时视频服务器，支持各种通用的流媒体协议。常用案例举例：

- TMP 服务器；
- RTMP 自动转 HLS、FLV；
- 分布式（K8S）部署；
- WebRTC 推流拉流。小册会议功能核心；
- HTTP API。可以获取服务端各种推流信息；
- DVR 。支持将`RTMP`流录制成 FLV 或 MP4 文件。

还有一些其他的功能，大家课后可以自己看看，这里不再多说。

实际上满足上面条件的开源流媒体服务很多，有大的有小的，比如 [ZLMediaKit](https://github.com/ZLMediaKit/ZLMediaKit)，我们这节课主要是以 SRS 为切入点去实现我们第三套会议系统，等学完后大家可以看看用其他的开源流媒体服务代替 SRS，进而实现多平台兼容的会议系统。

#### 部署

考虑到便捷性，我们使用容器化来部署。
```sh
// 1935 RTMP的常用端口  1985 API接口端口  8080默认控制台访问端口 在这里我映射到宿主机8085端口
docker run -d --name srs -p 1935:1935 -p 1985:1985 -p 8085:8080 ossrs/srs:5.0.30
```

执行完上面的再继续：
```sh
docker cp -a srs:/usr/local/srs/conf /home/srs5/
```

这一步的目的是从容器中拷贝配置文件到宿主机的 `/home/srs5` 目录，因为中间我们可能会配置一些其他的东西，如果在容器内部更改，那么不小心容器被删除，配置历史也就找不到了。
```sh
docker rm -f srs
```

移除旧的容器，因为我们的目标是从里面拷贝配置文件，因此拷贝完后，这个容器也就没有必要存在了，而我们正式用的容器则是需要挂载上面拷贝配置所启动的容器。
```sh
//临时变量，当前服务器的IP，如果是公网服务器的话则为公网IP 用户webrtc UDP 包的传输
CANDIDATE="192.168.101.99"
docker run --restart=always -d -v /home/srs5/conf/:/usr/local/srs/conf/ -p 1935:1935 -p 1985:1985 -p 8085:8080 \
    --env CANDIDATE=$CANDIDATE -p 8000:8000/udp \
    ossrs/srs:5.0.30 ./objs/srs -c conf/docker.conf
```

启动完成后，访问 IP+8085，公网服务器请记得开放安全组和防火墙端口。

![img](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/1a1bb6f0079b4773bd33dd7b75543a33~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

看到这个界面，则表明 SRS 流媒体服务部署完成，当前界面点击进入 SRS 控制台：

![img](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/534315bc657047939e19169576fb3e31~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

更改 API 端口，然后连接到 SRS 控制台实时监控，如下：

![img](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/0e11f4073e044ef3a2b17bea2ab54f22~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

#### FFmpeg 相关命令

后面的测试需要用到一些 Ffmpeg 基础命令，这里给大家简要介绍下：
```yaml
-c copy：直接复制，不经过重新编码
-y 覆盖同名输出
-c:v：指定视频编码器 libx265 / libx264
-c:a：指定音频编码器 aac
-i：指定输入文件
-c：指定编码器 
-an： 去除音频
-vn： 去除视频流 
-threads 5 指定多线程数
-preset：指定输出的视频质量，会影响文件的生成速度，有以下几个可用的值 ultrafast, superfast, veryfast, faster, fast, medium, slow, slower, veryslow。
-b 设定视频流量，默认为200Kbit/s 内网设置2048
-b:v  设定视频流量，默认为200Kbit/s 内网设置 2048k 或 1024k
-r 设定帧速率，默认为25
-loop 1 表示图片无限循环
-shortest 表示音频文件结束
-ar 指定音频采样率 比如48000
-ac 设定声音的Channel数
-acodec 设定声音编解码器，未设定时则使用与输入流相同的编解码器
-acodec: 音频选项， 一般后面加copy表示拷贝
-vcodec:视频选项，一般后面加copy表示拷贝 h264则为h264编码
-crf 在优先保证画面质量（也不太在乎转码时间）的情况下，使用-crf参数来控制转码是比较适宜的。这个参数的取值范围为0~51，其中0为无损模式，数值越大，画质越差，生成的文件却越小。从主观上讲，18~28是一个合理的范围。18被认为是视觉无损的（从技术角度上看当然还是有损的），它的输出视频质量和输入视频相当。
```

#### 测试

我们将某个 mp4 视频推送到流媒体服务器：
```sh
ffmpeg -i  http://vfx.mtime.cn/Video/2019/02/04/mp4/190204084208765161.mp4 -c copy -f flv rtmp://192.168.101.99:1935/live/suke01
```

![img](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/9c530fdd951e488e8d3b8922f903ae49~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

然后用 SRS 自带的播放器查看推送的视频：

1[img](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/5f3a2626042a424a9f991fcf45ec41e4~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

上面播放地址我们写的是 `FLV` 地址，在 `Ffmpeg` 将视频流通过RTMP 推送到流媒体服务器之后，`SRS` 会自动将该流转为 `FLV`，这样就可以直接在网页上播放了。

![img](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/9d6d002353d64c838a3ab538d6819860~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

上面 SRS 监控台可以实时地看到正在推流的客户端以及播放的客户端，如果某个客户端正在观看视频流，可以通过控制台直接踢掉，而 SRS 的 HTTP API 也是支持这些功能的。

### HTTP API

访问端口 1985，我们可以看到 SRS API 的版本信息：

![img](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/68331416486f4c34aa0f5ef6370a255b~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

在[官网](https://ossrs.net/lts/zh-cn/docs/v4/doc/http-api)也有对应的具体某个 API 的含义。

|API	|举例|	接口描述|
| - | - | - |
|versions|	/api/v1/versions|	获取服务器版本信息|
|summaries|	/api/v1/summaries|	获取服务器的摘要信息|
|rusages|	/api/v1/rusages|	获取服务器资源使用信息|
|self_proc_stats|	/api/v1/self_proc_stats|	获取服务器进程信息|
|system_proc_stats|	/api/v1/system_proc_stats|	获取服务器所有进程情况|
|meminfos|	/api/v1/meminfos|	获取服务器内存使用情况|
|features|	/api/v1/features|	获取系统支持的功能列表|
|requests|	/api/v1/requests|	获取请求的信息，即当前发起的请求的详细信息|
|vhosts|	/api/v1/vhosts|	获取服务器上的vhosts信息|
|streams|	/api/v1/streams|	获取服务器的streams信息|
|clients|	/api/v1/clients|	获取服务器的clients信息，默认获取前10个|
|configs|	/api/v1/configs|	CUID配置，RAW API|
|publish|	/rtc/v1/publish/|	WebRTC推流的API|
|play|	/rtc/v1/play/	WebRTC播放流的API|

注意最后面两个 API 接口，这两个是 WebRTC 相关的，也是和我们会议系统搭建相关的。

### HTTP 回调

很多时候你在推流完成之后，如果是在业务中的话，你需要知道推送是否成功，或者其他的反馈，而 HTTP 回调就是干这个事情的。
```ruby
 vhost your_vhost {
    http_hooks {
                # 启用回调配置
        enabled         on;
                //推流回调配置 回调参数会返回正在推送的流的 host 、ip、client、streamId参数  这些参数在业务中我们可以应用 从而控制对应的推流客户端 支持多个地址配置
        on_publish      http://127.0.0.1:8085/api/v1/streams http://192.168.101.2:8085/api/v1/streams;
                //停止推流监听 回调接口
        on_unpublish    http://127.0.0.1:8085/api/v1/streams http://192.168.101.2:8085/api/v1/streams;
                //播放回调
        on_play         http://127.0.0.1:8085/api/v1/sessions http://192.168.101.2:8085/api/v1/sessions;
       //.....
    }
}
```

更多配置大家可以参考 [官网](https://ossrs.net/lts/zh-cn/docs/v4/doc/http-callback) 最新更新。

### 课后题

搭建完成后请大家推流自测，FFmpeg 常用参数以及在线测试视频我在我笔记中也整理了（[详细点击查看](https://blog.wangsrbus.cn/archives/ffmpeg-chang-yong-can-shu-yi-ji-hua-zhong-hua-ji-chu-ming-ling.html)），里面有各种 画中画 画面合成的案例，有问题留言或者在社群里沟通交流。