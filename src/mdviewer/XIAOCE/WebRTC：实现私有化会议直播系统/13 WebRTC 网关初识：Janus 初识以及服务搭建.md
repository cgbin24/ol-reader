这节课我们正式进入第二阶段。实战开始前，我们先来了解下 `Janus` 是什么，以及我们为何用 `Janus`？此外，我们还需要补充一个概念：`WebRTC`网关。

音视频时代，简单的音视频通话功能已经远远无法承载这个时代的更多需求，比如视频云录制、呼叫转移、视频流 AI 检测、视频流增强、信令暂存、和已有其他通信协议互相嫁接等等。这些庞大且涉及到复杂计算的能力，必须交给具有一定能力的服务来做，因此就有了`WebRTC`网关，本节课所提到的 `Janus` 就是其中一种开源且稳定更新的`WebRTC`网关。

> Janus 相关地址
>
> - Janus 官网地址：[官网](https://janus.conf.meetecho.com/docs/)。
> - Janus 仓库地址：[Github](https://github.com/meetecho/janus-gateway)。
> - Janus 非官方容器构建仓库 ：[Github](https://github.com/wangsrGit119/janus-webrtc-gateway-docker)。

### Janus 具有的基本功能

- 回声测试、会议桥、媒体记录器、SIP 网关等基本功能。
- 可插拔的，按需引入所需的功能，比如`会议功能、p2p通信功能、录制功能、播放第三方媒体流、屏幕共享`等等，要实现对应功能，可单独引入对应插件，因为 `Janus` 的设计架构就是插拔式的。
- 自带用户统计，只需要按照特定的格式去请求即可，相当于给你提供了 WebSocket 服务器，你只需要按照规范来即可。
- 使用`json`作为向服务器请求服务的参数，简洁。
- 事件回调，接受自定义接口作为回调接口传回事件数据。

看上面的基本功能，我们可以很清晰地知道，有了 `Janus`，我们就无需自己实现信令服务器。

### Janus高级功能

看官网的第一眼我们就能够发现，整个首页最突出的一个单词 `multistream`，这也是 `Janus` 从 0.X 版本过渡到 1.X 版本的重要体现。这个突出功能允许客户端可以发送多个视频流给客户端，而不用局限于只能发送一个视频流造成需要频繁切换画面的窘境。

另一个重要的功能就是 `simulcast`，这个功能允许客户端在单个会话中同时发送多个不同分辨率的视频流。如此一来，接收端就可以根据实际需要动态选择要接收的视频流，提高视频通信的效率和质量。

大家可以畅想一下，在多人会议中，全部参会人员的网络状况是不是都稳定？和我们看视频一样，视频格式有高清、超清、蓝光、4K 等不同的分辨率，就是为了适应不同客户端、不同的网络状况。

好了，了解完 `Janus` 的大体功能，接下来就是实战搭建了。

### 网关服务搭建说明

`Janus` 是使用 C++ 开发的，中间使用了很多其他的开源组件，因此环境配置也比较麻烦。但是流行的服务容器化趋势带给我们诸多便利，`Janus` 也一样有对应的容器版本。大家在 Docker Hub 上输入关键词 `janus-webrtc-gateway-docker` 就可以看到有很多不同用户构建的容器版本：

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/19a6c222f9d341e5843723dd46827765~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

值得注意的是，前面两个下载量较多的已经是三年前的了，而 Janus 至今已经更新 N 多个版本了，老版本必然会和新版本不适配，请大家看下面官网说明：

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/6d58fce8a4bd4b0894a5dad03a2ffc83~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

当然大家无需担心新版本没有对应的容器版本，大家可以看看上面截图中的第三个，这个容器版本是我定期从官网拉取最新代码构建的，和 `Janus` 新版本对应（ [DockerHub](https://hub.docker.com/r/sucwangsr/janus-webrtc-gateway-docker) & [Github](https://github.com/wangsrGit119/janus-webrtc-gateway-docker) ）。如下图中左侧是我构建的容器版本，右侧是对应 Janus 的版本，每当它发版我都会去构建最新的容器。

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/776f9b22396843ce84c4960e76891a2e~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

**服务器搭建**

1. 准备服务器，且下载安装 Docker 和 Docker Compose 环境（这个网上很多我就不再介绍）。
2. 路径以及配置文件准备（网络不通畅的同学直接使用 `GitHub1s`打开拷贝内容即可），如果你下载下来了，那么建议你再检查下文件内容是否正确。

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/1d3c6f8de2714c17b58bc878d05eab36~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

```sh
mkdir -p /home/janus-docker/conf
mkdir -p /home/janus-docker/ssl
mkdir -p /home/janus-docker/record
cd /home/janus-docker/conf
## 下载下面配置文件 如果网络打不开可以尝试 github 替换为 github1s如上图
https://github.com/meetecho/janus-gateway/blob/master/conf/janus.jcfg.sample.in
https://github1s.com/meetecho/janus-gateway/blob/master/conf/janus.transport.http.jcfg.sample
mv janus.jcfg.sample.in janus.jcfg
mv janus.transport.http.jcfg.sample janus.transport.http.jcfg
## 后面我们还会遇到各种插件同样的下载方法 最核心的就是上面俩个
```

3. docker-compose 文件创建以及路径挂载。
```sh
cd /home/janus-docker && touch docker-compose.yml
-------------------yaml文件内容配置-------------------------------
version: '1.2.0'
services:
  janus-gateway:
    image: 'sucwangsr/janus-webrtc-gateway-docker:1.2.0'
    command: ["/usr/local/bin/janus", "-F", "/usr/local/etc/janus"]
    network_mode: "host"
    volumes:
      - "/home/janus-docker/conf/janus.transport.http.jcfg:/usr/local/etc/janus/janus.transport.http.jcfg" 
      - "/home/janus-docker/conf/janus.jcfg:/usr/local/etc/janus/janus.jcfg"
      - "/home/janus-docker/record:/home/janus-gateway/record"
      - "/home/janus-docker/ssl:/home/ssl"
    restart: always
```

4. 修改基础配置。

> `janus.jcfg` 中找下面条目配置修改，一定要注意找到对应的位置哦。
>
> `api_secret` 为我们后面常用的重点配置，Rest API 的通行证。
```sh
##新版本中下面这几个路径在配置文件中是@@变量赋值，这里大家可以直接写成下面的
configs_folder = "/usr/local/etc/janus"                        
plugins_folder = "/usr/local/lib/janus/plugins"                   
transports_folder = "/usr/local/lib/janus/transports"     
events_folder = "/usr/local/lib/janus/events"                    
loggers_folder = "/usr/local/lib/janus/loggers"
-------------------------
api_secret = "sujanxxusrocks"  ## 客户端使用restApi用的token 请自行配置自己的(重点配置)
token_auth_secret = "sujanxxusrocks" ## 使用ws使用的token 请自行配置自己的
token_auth = true  ## 使用开启校验ws
admin_secret = "suaanusoverlord"  #管理员 请自行配置自己的
---------------
media: {
        #ipv6 = true
        #min_nack_queue = 500
        rtp_port_range = "17001-19001" ##  请开放公网服务器的安全组(UDP)
        #dtls_mtu = 1200
        #no_media_timer = 1
        #slowlink_threshold = 4
        #twcc_period = 100
        #dtls_timeout = 500
。。。。。
}
-----------------
## 当然还有其他的配置 比如stun 、turn、nat_1_1_mapping等这里先不用管
```

> `janus.transport.http.jcfg` 配置

```sh
general: {                                                
        base_path = "/janus"      #基础路径
        http = true            # http开启  
        port = 18088            #http端口                              
        https = false           #https是否启用配置；启用的话后面就要配置ssl证书。                  
```

5. 启动。
```sh
cd /home/janus-docker 
docker-compose up -d
## 启动完毕后
docker-compose logs -f
------------------部分日志-------------------------
janus-docker-janus-gateway-1  | Loading plugin 'libjanus_echotest.so'...
janus-docker-janus-gateway-1  | JANUS EchoTest plugin initialized!
janus-docker-janus-gateway-1  | Loading plugin 'libjanus_audiobridge.so'...
janus-docker-janus-gateway-1  | Joining Janus requests handler thread
janus-docker-janus-gateway-1  | Sessions watchdog started
janus-docker-janus-gateway-1  | JANUS AudioBridge plugin initialized!
janus-docker-janus-gateway-1  | Loading plugin 'libjanus_recordplay.so'...
janus-docker-janus-gateway-1  | JANUS Record&Play plugin initialized!
janus-docker-janus-gateway-1  | Loading plugin 'libjanus_sip.so'...
janus-docker-janus-gateway-1  | JANUS SIP plugin initialized!
janus-docker-janus-gateway-1  | Loading plugin 'libjanus_streaming.so'...
janus-docker-janus-gateway-1  | JANUS Streaming plugin initialized!
janus-docker-janus-gateway-1  | Transport plugins folder: /usr/local/lib/janus/transports
janus-docker-janus-gateway-1  | Loading transport plugin 'libjanus_websockets.so'...
janus-docker-janus-gateway-1  | libwebsockets logging: 0
janus-docker-janus-gateway-1  | Websockets server started (port 8188)...
janus-docker-janus-gateway-1  | JANUS WebSockets transport plugin initialized!
janus-docker-janus-gateway-1  | Loading transport plugin 'libjanus_http.so'...
janus-docker-janus-gateway-1  | WebSockets thread started
janus-docker-janus-gateway-1  | HTTP webserver started (port 18088, /janus path listener)...
janus-docker-janus-gateway-1  | Admin/monitor HTTP webserver started (port 18089, /adminsuc path listener)...
janus-docker-janus-gateway-1  | JANUS REST (HTTP/HTTPS) transport plugin initialized!
janus-docker-janus-gateway-1  | [WARN] libnice version outdated: 0.1.15.1 installed, at least 0.1.16 recommended. Notice the installed version was checked at build time: if you updated libnice in the meanwhile, re-configure and recompile to get rid of this warning
janus-docker-janus-gateway-1  | HTTP transport timer started
```

**温馨提示**

搭建过程中我们需要注意的几个点：

1. `rtp_port_range`：RTP 端口配置，`Janus` 作为 `WebRTC 的网关`，最离不开的就是和 “流” 打交道，WebRTC 实现的视频音频通话，涉及到的所有的媒体流发送和接收，都是 通过RTP 协议包。网关也一样，在每个客户端和网关服务器连接的过程中，这个流首先是要经过 `Janus` 的。因此，这个端口必须要放行，`Janus` 是自己配置了端口的，但是有些时候，我们不方便将该区间的端口开放，因此这个参数的目的就是让我们可以动态更改默认的 RTP 端口。

2. `http/https`：这俩参数大家可以同时启用，也可以只用其中一个，我建议是只开放 Http 即可，要想使用 Https ，则可以通过该服务器指定的域名搭配 Nginx 代理映射即可，这样就无需单独为 `Janus` 维护一份 Https 证书。

3. 我在配置中注释的配置文件路径，这些路径在老版本中都是放行且固定的，无需自己配置。但是新版本中这些路径是要自己手动打开且自行配置的。

4. **`nat_1_1_mapping`：这个参数在内网映射公网时是用的到的，比如你的内部地址：192.168.101.1，要映射到公网 x.x.x.x，那么你就要配置这个参数。尤其你的`Janus`部署在公网，那么这个地址填写公网IP，当然一般私有化都是在内网的，可以不用处理**。

好了，这节课我们了解了`WebRTC`网关 `Janus`，同时也在服务器上搭建了该网关，下节课我们来学习如何将 `Janus` 用到我们的实际项目中。

### 课后题

自己按照上面的步骤，完整部署一个 `Janus` 网关服务。