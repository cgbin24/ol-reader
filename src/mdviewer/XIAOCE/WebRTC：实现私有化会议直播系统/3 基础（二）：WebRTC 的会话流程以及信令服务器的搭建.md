上节我们学了如何通过浏览器的 API 去操控电脑上的摄像头、麦克风、屏幕分享桌面，这些是我们实现会议系统必备的基础知识，接下来我们就要去思考如何实现一个会议系统，以及如何将我们学到的基础 API 和`WebRTC`组合。

清晰的逻辑和流程对于解决任何事情，都可以事半功倍。所以同样的，我们也得首先构思下应该以什么样的方式或流程去实践这项技术，完成这个功能。

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/c15694539d044425a411dc87e38fb268~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

第一步，我们必须得知道`WebRTC`是如何将远端的两个浏览器关联起来的，因为只有建立关联关系，接下来才有多媒体通信的基础。

第二步，关联关系转换到代码层面，那意味着在双方的浏览器中必须存在共性，这个共性你可以理解为一个核心的载体，有了载体就可以维护关联关系，那么在`WebRTC`中这个载体是什么？

这时我们就需要了解下`WebRTC`的核心对象`PeerConnection`，因为这就是上面两个问题的答案，**建立关联关系和维护关联关系的载体**。

### 核心对象 PeerConnection

`PeerConnection`可以说是整个`WebRTC`通话的载体，如果没有这个对象，那么后面所有流程都是没法进行的。

> 首先要明确的是，在不同的浏览器中，`WebRTC`兼容性不一样，虽然前面开篇词提到它的相关 `API` 已经成为 `W3C` 的基础标准，但并不是所有的浏览器都满足这些标准的。`WebRTC`最先开始是谷歌体系，那么兼容性而言，谷歌浏览器就是首选。国内很多的浏览器也是基于谷歌内核的，因此`WebRTC`在很大程度上也是兼容的，这里先说几个常用且兼容`WebRTC`的浏览器：Chrome、360、edge、火狐、Safari。

因此为了尽可能地兼容不同浏览器，获取到有效的`PeerConnection`对象，我们可以通过如下方式获取：
```js
 var PeerConnection = window.RTCPeerConnection ||
        window.mozRTCPeerConnection ||
        window.webkitRTCPeerConnection;
```

知道了这个核心载体，自然就要了解这个载体的核心方法，只有它自身的核心方法才能驱动它进行工作。

> 这些**核心方法**，在这里混个眼熟，后面到整体会话过程的时候，我们会详细来看这些方法的调用顺序以及方式。留意后面红字部分，这个也是很重要的一个点，后面我们单独引申展开看看。

- `addIceCandidate()`： 保存 ICE 候选信息，即双方协商信息，持续整个建立通信过程，直到没有更多候选信息。
- `addTrack()` ：添加音频或者视频轨道。
- `createAnswer()` ：创建应答信令。
- `createDataChannel()`： 创建消息通道，建立`WebRTC`通信之后，就可以 `p2p` 的直接发送文本消息，无需中转服务器。
- `createOffer()`： 创建初始信令。
- `setRemoteDescription()`： 保存远端发送给自己的信令。
- `setLocalDescription()` ：保存自己端创建的信令。

以上就是`PeerConnection`这个载体核心驱动的主要方法了，除了这些核心方法之外，还有一些**事件监听函数**，这些监听函数用于监听远程发送过来的消息。

假如 A 和 B 建立连接，如果 A 作为主动方即呼叫端，则需要调用的就是上述**核心方法**去创建建立连接的信息，而 B 则在另一端使用上述**部分核心方法**创建信息再发送给 A，A 则调用事件监听函数去保存这些信息。常用的**事件监听函数**如下：

- `ondatachannel`： 创建`datachannel`后监听回调以及 `p2p`消息监听。
- `ontrack` ：监听远程媒体轨道即远端音视频信息。
- `onicecandidate`： `ICE` 候选监听。

### `WebRTC`的会话流程

解决完上面俩问题，我们知道了既然要达成会话，那么就需要上述的载体，然后通过载体的核心方法和事件就可以完成从 A 到 B 两个浏览器的关联，那么关联的具体过程是什么呢？那就是我们接下来要详细解释的。首先看我给大家绘制的流程图：

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/48a9cc63f3fc4f7d8f1778b2a19baf77~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

对照这个流程图，我们再来口述一边，上图中 **A 为caller（呼叫端**），**B为callee（被呼叫端）**。

1. 首先 A 呼叫 B，呼叫之前我们一般通过实时通信协议`WebSocket`即可，让对方能收到信息。
2. B 接受应答，A 和 B 均开始初始化`PeerConnection` 实例，用来关联 A 和 B 的`SDP`会话信息。
3. A 调用`createOffer`创建信令，同时通过`setLocalDescription`方法在本地实例`PeerConnection`中储存一份（**图中流程①**）。
4. 然后调用信令服务器将 A 的`SDP`转发给 B（**图中流程②**）。
5. B 接收到 A 的`SDP`后调用`setRemoteDescription`，将其储存在初始化好的`PeerConnection`实例中（**图中流程③**）。
6. B 同时调用`createAnswer`创建应答`SDP`，并调用`setLocalDescription`储存在自己本地`PeerConnection`实例中（**图中流程④**）。
7. B 继续将自己创建的应答`SDP`通过服务器转发给 A（**图中流程⑤**）。
8. A 调用`setRemoteDescription`将 B 的`SDP`储存在本地`PeerConnection`实例（**图中流程⑤**）。
9. 在会话的同时，从图中我们可以发现有个`ice candidate`，这个信息就是 ice 候选信息，A 发给 B 的 B 储存，B 发给 A 的 A 储存，直至候选完成。

> 我们可以发现，这里又出来个新的名词 **`SDP`**，这玩意实际就是`WebRTC`会话的`信令`，完成以上过程就相当于建立了`WebRTC`的会话基础，然后你才可以借助这个桥梁去添加和监听双方的音视频流信息。

### 信令服务器的搭建

从上述整个流程来看，信令服务器为 A、B 两者中转信令起了很重要的角色，直白地讲，就是串通 A、B 的媒介，假如我的手机是 A，你的手机是 B，那么我们俩联系就需要通过运营商，而运营商的服务器替我们中转呼叫、接听、挂断等操作，在这里，**运营商的服务器就是信令服务器**。

信令服务器听上去很高大上，但实际上，它在不做复杂操作的时候，就是个即时通讯服务器，转发通话双方需要交换的信息，或者会话的信息，因此我们可以直接写个`WebSocket`服务端来完成信令服务器的使命。

当然，要完成信令服务器，我们也需要有针对性，我们的目的是为了`WebRTC`，那么针对的肯定就是`WebRTC`会话过程中需要的转发逻辑，由此我们可以构思下服务端应该具备哪些功能，看下图。

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/b728a5be84794491b11757d89cb006e0~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

为了完成上面这个构思，我们可以尝试写出来一个最基本的信令服务器。记住我们的目的是什么？**一个会议系统**，是的，所以我们设计的东西一定要满足会议的基本条件，即：用户单独标识和集体标识，也就是一开始必须区分的关键信息`userId`、`roomId`，但是怎么存会议室中的用户信息呢？ 这里我会用到`Redis`的一种数据结构`Hash`，存放的大体结构如下图所示。

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/8e6a44604e56403e80f32150140db6b0~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

信令服务器用什么语言呢？我们以 Web 端为主体，因此直接通过大家熟悉的`nodejs`来写即可，简单、方便、成本低，会一点点`JavaScript`即可。

#### 具体代码
```js
const httpServer = require('http').createServer();
const io = require('socket.io')(httpServer);

//redis
var redis = require('redis')
const roomKey = "meeting-room::"
var redisClient = redis.createClient(6379, '127.0.0.1')
redisClient.on('error', function (err) {
  console.log('redisClient connect Error ' ,err);
});

const userMap = new Map() // user - > socket
io.on('connection', async (socket) => {
    await onListener(socket)
});

httpServer.listen(18080, async() => {
  console.log('服务器启动成功 *:18080');
  await redisClient.connect();
});

/**
 * res data
 */
function getMsg(type,msg,status=200,data=null){
    return {"type":type,"msg":msg,"status":status,"data":data}

}

function getParams(url,queryName){
    let query = decodeURI(url.split('?')[1]);
    let vars = query.split("&");
    for (var i = 0; i < vars.length; i++) {
      var pair = vars[i].split("=");
      if (pair[0] === queryName) {
        return pair[1];
      }
    }
    return null;
}

/**
 * DB data
 * @author suke
 * @param {Object} userId
 * @param {Object} roomId
 */
async function getUserDetailByUid(userId,roomId){
    let res = JSON.stringify(({"userId":userId,"roomId":roomId}))
    console.log(res)
    return res
}

/**
 * 监听
 * @author suke
 * @param {Object} s
 */
async function onListener(s){
    let url = s.client.request.url
    let userId = getParams(url,'userId')
    let roomId = getParams(url,'roomId')
    console.log("client uid："+userId+" roomId: "+roomId+" online ")
    //user map
    userMap.set(userId,s)
    //room cache
    if(roomId){
        await redisClient.hSet(roomKey+roomId,userId, await getUserDetailByUid(userId,roomId))
        oneToRoomMany(roomId,getMsg('join',userId+ ' join then room'))
    }

    s.on('msg', async (data) => {
          console.log("msg",data)
          await oneToRoomMany(roomId,data)
    });

    s.on('disconnect', () => { 
          console.log("client uid："+userId+" roomId: "+roomId+" offline ")
          userMap.delete(userId)
          if(roomId){
              redisClient.hDel(roomKey+roomId,userId)
              oneToRoomMany(roomId,getMsg('leave',userId+' leave the room '))
          }
    });    

    s.on('roomUserList', async (data) => {
        // console.log("roomUserList msg",data)
        s.emit('roomUserList',await getRoomUser(data['roomId']))
    })
    s.on('call',(data) => {
        let targetUid = data['targetUid']
        if(userMap.get(targetUid)){
            oneToOne(targetUid,getMsg('call',"远程呼叫",200,data))
        }else{
            console.log(targetUid+ "不在线")
        }
    })
    s.on('candidate',(data) => {
        let targetUid = data['targetUid']
        if(userMap.get(targetUid)){
            oneToOne(targetUid,getMsg('candidate',"ice candidate",200,data))
        }else{
            console.log(targetUid+ "不在线")
        }
    })
    s.on('offer',(data) => {
        let targetUid = data['targetUid']
        if(userMap.get(targetUid)){
            oneToOne(targetUid,getMsg('offer',"rtc offer",200,data))
        }else{
            console.log(targetUid+ "不在线")
        }
    })
    s.on('answer',(data) => {
        let targetUid = data['targetUid']
        if(userMap.get(targetUid)){
            oneToOne(targetUid,getMsg('answer',"rtc answer",200,data))
        }else{
            console.log(targetUid+ "不在线")
        }
    })
}

/**
 * ono to one (event msg)
 * @author suke
 * @param {Object} uid
 * @param {Object} msg
 */
function oneToOne(uid,msg){
    let s = userMap.get(uid)
    if(s){
        s.emit('msg',msg)
    }else{
        console.log(uid+"用户不在线")
    }
}

/**
 * 获取房间用户列表
 * @author suke
 * @param {Object} roomId
 */
async function getRoomUser(roomId){
    return await redisClient.hGetAll(roomKey+roomId)
}

/**
 * one to room many
 * @author suke
 * @param {Object} roomId
 * @param {Object} msg
 */
async function oneToRoomMany(roomId,msg){
    let ulist = await redisClient.hGetAll(roomKey+roomId)
    for(const uid in ulist){
      oneToOne(uid,msg)
    }

}
```

#### 项目演示指南

下载代码后，找到目录下： socket-server 文件夹，到文件夹执行依赖安装并配置 Redis 链接。

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/d83f305038a34fcda6afca04c1d920e5~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

```perl
cd socket-server
cnpm i 
npm run start ## 启动
---------------------打印如下则代表信令服务器启动成功---------------------------------
> socket-server@1.0.0 start
> node app.js

服务器启动成功 *:18080
redis 连接成功
```

### 扩展

在看完`WebRTC`会话流程之后，你会发现，在整个核心会话中，并没有出现媒体信息交换（比如：摄像头、麦克风媒体流的发送和接受）。所以很明显，`WebRTC`不只可以用来音视频通话。

确实如此，在无需视频通话的时候，我们可以用`WebRTC`这个桥梁当作是一种新的数据双向传输方案，现阶段已经有网站用这种方式上传用户数据或其他加密消息媒介了，而且因为`WebRTC`中数据传输协议非`HTTP`或者`WebSocket`协议请求，很多探测工具也就没法察觉。

下一节，我们将利用搭建好的信令服务器，去具体实现最简单的 `P2P` 音视频通话，同时也为了给大家演示下，`WebRTC`除音视频场景之外，利用`WebRTC`已完成会话这个桥梁，去实现无需服务端的点对点 `IM` 通信。

### 本节所有源代码地址

[信令服务器源码](https://gist.github.com/wangsrGit119/7b1d280550e593987f55f34e13f4f6aa)

### 课后题

利用 `Node JS` 搭建好信令服务器之后，我们就需要在前端页面完成和 `socket` 服务器的连接。前面已经明确了信令服务器的基本功能就是信令的转发，信令说白了就是一种特殊的消息，因此课后大家可以先尝试使用这个服务器实现 `Web` 端的基本文本聊天。