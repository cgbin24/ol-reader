这节课我们来说说 Coturn 网络打洞服务器， Coturn 是一个开源的 TURN & STUN 服务器，[Github地址](https://github.com/coturn/coturn)。

这里又扯到了 TURN 和 STUN 两个特别的东西，在具体介绍这两个名词的知识前，我们先看看在用 `WebRTC`进行视频通话过程中会遇到什么问题。

需要知道的是， `WebRTC`进行通话过程中是没有任何视频服务器的，所有的 RTP 数据包都是直接通过双方的 IP 和对应的端口进行发送和传输的（大家感兴趣的话，可以尝试用 GB28181 和监控摄像头交互然后获取监控的 RTP 包 ）。

因此通常在开始通话之前，就必须进行 ICE 协商获取双方的 IP 以及端口，如果通话是区域网则简单，直接区域网 IP 即可，但通话如果是在公共复杂网络，且客户端并未直接接入公共网路，而是仅接入到本地 `NAT 网关`中呢？

此时是无法直接获取通话客户端的公有 IP 的。这个时候就需要特定的东西去**获取客户端真实且互相可以抵达的公有 IP**，而 STUN 服务器的作用就是干这个的，有了它就可以让通话双方发现对方的公共通讯地址。

接上面，能发现公有地址不代表就能进行通话，进行通话的前提是允许客户端能够在相应端口进行上行和下行数据的发送和接收。就好比你电脑启动了一个服务但是防火墙是开着的，那么别人访问你的服务还是没法访问的。此时 TURN 来了，**它的作用就是充当双方中继地址，将双方的流量中继到当前服务器从而实现双方流量的交换**。

### 打洞服务器的搭建

为了让大家免于各种复杂环境的困扰，我们使用容器来搭建。

1. 首先提前下载对应的配置文件：[官方文件](https://github.com/coturn/coturn/blob/master/docker/coturn/turnserver.conf)。
2. 修改重要的配置，**`注意不是替换，是找到下面配置的地址`**，注意看每个配置的描述。
> 在纯内网环境，很多时候服务器只有一个 IP ，因此下面遇到的 IP 配置都配置同一个，而 realm 使用默认即可，无需配置。
```sh
#中继服务器监听的IP地址，可以指定多个IP  最好直接写 ip addr  输出的etho的ip
listening-ip=10.0.4.3
listening-port=3478
#中继服务器转发地址(本地IP地址将用于传递数据包的给每个端)，最好直接写 ip addr 输出的eth0的ip,不存在则直接公网IP
relay-ip=10.0.4.3
#外部IP,直接写公网IP地址
external-ip=115.15.172.71
# 中继线程，如果服务器资源充足可以适当扩大，最大不能超过 50
relay-threads=2
#打开密码验证，使用短期证书机制。
lt-cred-mech
#UDP端口 下面默认就有 可以自定义自己想要的区间 这个就是中继流量转发的端口
min-port=17001
max-port=19001
#turn服务器的用户和凭据
user=suke:suke119119
#打开下面DB关闭mysql DB ，
userdb=/var/lib/coturn/turndb
##mysql-userdb xxxxxxxxxxxxxxxxxxx ##注释
## 这里可以不用管，公网需要的则可以配置对应的域名
realm=example.cn 
## 配置日志输出，用户后面直接重定向到容器日志
log-file=stdout # 注释 sys-log 
```

3. 挂载配置文件位置启动容器。

> Coturn 我这里指定的镜像为 4.6 版本的，如果有新的，大家可以尝试最新稳定版本。
```sh
sudo docker run -d --privileged=true --name=mycoturn   --network=host \
           -v /home/ubuntu/turnserver/turnserver.conf:/my/turnserver.conf \
       coturn/coturn:4.6 -c /my/turnserver.conf 
```

4. 日志。

> 下面的 167.160.189.179 IP 为我搭建的启动成功后的日志。
```sh
root@C20220407114397:~# docker logs -f mycoturn
0: : Listener address to use: 167.160.189.179
0: : Listener address to use: 167.160.189.179
0: : Relay address to use: 167.160.189.179
0: : 
RFC 3489/5389/5766/5780/6062/6156 STUN/TURN Server
Version Coturn-4.6.0 'Gorst'
0: : 
Max number of open files/sockets allowed for this process: 1048576
0: : 
Due to the open files/sockets limitation,
max supported number of TURN Sessions possible is: 524000 (approximately)
0: : 

==== Show him the instruments, Practical Frost: ====

0: : TLS supported
0: : DTLS supported
0: : DTLS 1.2 supported
0: : TURN/STUN ALPN supported
0: : Third-party authorization (oAuth) supported
0: : GCM (AEAD) supported
0: : OpenSSL compile-time version: OpenSSL 1.1.1n  15 Mar 2022 (0x101010ef)
0: : 
0: : SQLite supported, default database location is /var/lib/coturn/turndb
0: : Redis supported
0: : PostgreSQL supported
Cannot create pid file: /var/run/turnserver.pid: Permission denied
0: : MySQL supported
0: : MongoDB supported
0: : 
0: : Default Net Engine version: 3 (UDP thread per CPU core)

=====================================================

0: : Domain name: 
0: : Default realm: example.org
0: : WARNING: cannot find certificate file: /etc/ssl/certs/cert.pem (1)
0: : WARNING: cannot start TLS and DTLS listeners because certificate file is not set properly
0: : WARNING: cannot find private key file: /etc/ssl/private/privkey.pem (1)
0: : WARNING: cannot start TLS and DTLS listeners because private key file is not set properly
0: : Cannot create pid file: /var/run/turnserver.pid
0: : pid file created: /var/tmp/turnserver.pid
0: : IO method (main listener thread): epoll (with changelist)
0: : WARNING: I cannot support STUN CHANGE_REQUEST functionality because only one IP address is provided
0: : Wait for relay ports initialization...
0: :   relay 167.160.189.179 initialization...
0: :   relay 167.160.189.179 initialization done
0: : Relay ports initialization done
0: : IO method (general relay thread): epoll (with changelist)
0: : turn server id=0 created
You must obtain superuser privileges to bind a socket to device: Operation not permitted
0: : Cannot bind listener socket to device ens17
0: : IPv4. SCTP listener opened on : 167.160.189.179:3478
You must obtain superuser privileges to bind a socket to device: Operation not permitted
0: : Cannot bind listener socket to device ens17
0: : IPv4. TCP listener opened on : 167.160.189.179:3478
0: : IO method (general relay thread): epoll (with changelist)
0: : turn server id=1 created
0: : Total General servers: 2
0: : IO method (auth thread): epoll (with changelist)
0: : IO method (admin thread): epoll (with changelist)
0: : IO method (auth thread): epoll (with changelist)
0: : IPv4. CLI listener opened on : 127.0.0.1:5766
0: : SQLite DB connection success: /var/lib/coturn/turndb
0: : Prometheus collector disabled, not started.
```

5.测试是否成功。

最简单的方法是直接在浏览器输入服务器 `IP:3478`，然后看输出日志，如果输出以下类似日志，则大概率部署成功。

> 可以注意到日志中 username 的值。
```sh
86396: : session 001000000000000001: usage: realm=<example.org>, username=<>, rp=1, rb=20, sp=1, sb=88
86396: : session 001000000000000001: peer usage: realm=<example.org>, username=<>, rp=0, rb=0, sp=0, sb=0
86396: : session 001000000000000001: closed (2nd stage), user <> realm <example.org> origin <>, local 167.160.189.179:3478, remote 146.88.240.4:36837, reason: allocation watchdog determined stale session state
98891: : session 001000000000000002: usage: realm=<example.org>, username=<>, rp=1, rb=20, sp=1, sb=88
98891: : session 001000000000000002: peer usage: realm=<example.org>, username=<>, rp=0, rb=0, sp=0, sb=0
98891: : session 001000000000000002: closed (2nd stage), user <> realm <example.org> origin <>, local 167.16
```

### 项目中使用

1. 代码配置

`iceTransportPolicy` 配置表示所有配置此参数的客户端在通话的时候都走 Turn 服务器中继。
```js
//全局变量
rtcPcParams:{
        iceTransportPolicy: 'relay', //强制走中继
        iceServers: [
             {urls: 'turn:167.160.189.179:3478', username:'suc', credential:'suc001'},
            ]
    },
    
 //初始化RTC和核心对象时配置此参数
 let pc = new PeerConnection(that.rtcPcParams)
```

2. 中继日志

> 注意看 username 字段以及后面的 incoming packet。
```sh
519121: : session 000000000000000016: delete: realm=<example.org>, username=<suc>
519212: : session 000000000000000017: peer 192.168.0.49 lifetime updated: 600
519212: : session 000000000000000017: realm <example.org> user <suc>: incoming packet CHANNEL_BIND processed, success
519212: : session 001000000000000026: peer 192.168.0.49 lifetime updated: 600
519212: : session 001000000000000026: realm <example.org> user <suc>: incoming packet CHANNEL_BIND processed, success
519272: : session 001000000000000026: refreshed, realm=<example.org>, username=<suc>, lifetime=600
519272: : session 001000000000000026: realm <example.org> user <suc>: incoming packet REFRESH processed, success
519272: : session 000000000000000017: refreshed, realm=<example.org>, username=<suc>, lifetime=600
519272: : session 000000000000000017: realm <example.org> user <suc>: incoming packet REFRESH processed, success
519452: : session 001000000000000026: realm <example.org> 
```

### 温馨提示

从前面的代码配置和部署中，我们基本上看到的只有 TURN 服务的配置和使用，中间并没有提到 STUN ，实际上在你部署启动 Coturn 服务的那一刻起，当前服务就已经支持 STUN 了，大家可以看启动成功的日志：

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/7f858be7dc574d94a1962bacadb7e93b~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

因此如果你的 TURN 服务已经没问题了，那么 STUN 服务必然没有问题的，在你的代码中配置的时候，你可以同时配置 STUN 和 TURN 服务，我代码中为了演示，并没有使用 STUN 服务，因为我不想让网络流量都走自己的网络，而是走 TURN 服务，如此我就可以直观地看到流量包的走向。

在实际场景中，尤其涉及到网络比较严格或者不容易抵达，尤其是防火墙限制很严重的情况下，此时我也是建议单独使用性能较好的服务器部署 Coturn 服务，让所有的流量全部都中继服务器，避免 ICE 协商失败导致无法进行通话。

### 课后作业

本节课，我们主要讨论了复杂的网络环境中如何使用打洞服务器保证通话成功率，课后大家试试在多人会议聊天的时候强制中继配置后，TURN 服务器的性能变化以及网络流量的变化。以及关闭该服务器后视频通话能否再进行呢？