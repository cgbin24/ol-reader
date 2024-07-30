上节我们了解了 `Janus`，接下来我们来看看如何将 `Janus` 应用到我们的实际项目中，并通过实战项目实现我们的第二种会议系统架构。

首先在项目中要使用 `Janus`，那必不可少的就是要引入对应的调用 API，如果大家翻过官网的话，不难发现在它的文档首页就有对应说明，直接了当地告诉大家 `JavaScript API`：

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/b49d980ed0ff415e9969e8283c8492ee~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

上面截图第三行中有介绍怎么以 `module` 引入的，但是对于很多人来说太麻烦，接下来按照我说的步骤，我相信很容易将 `Janus` 引入项目并初始化看到效果。

### 下载官方 JS

官方 [JS 地址](https://github.com/meetecho/janus-gateway/blob/master/html/janus.js)，如果不下载，直接拷贝内容到自己创建的 JS 文件也可以，完成内容拷贝后，在这个文件最后加入一行代码，原因是 `Janus` 所有的操作包括初始化、销毁、加载插件等都是在官方 JS 文件中封装好的，可直接通过该变量控制，因此对外暴露后便于我们在项目中使用。
```js
// 对外暴露全局变量
export default Janus
```

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/102c2da93a124e0794bcf2b04774b55d~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

看上图就是我创建的 `Janus API` 对应的 JS 文件。

有了 Janus API 文件，接下来给项目安装以下依赖，最新版本即可。
```lua
"webrtc-adapter": "^8.2.0"
---------
npm i webrtc-adapter -S
```

### 使用 Janus API 文件并初始化

在页面上，首先引入的就是上面我们准备的两个模块。
```js
import adapter from 'webrtc-adapter';
import Janus from "@/utils/Janus.js";
```

引入之后，创建初始化 Janus 的 `init()` 函数。

请注意下面的 `Debug`参数，如果开启则控制台会打印一系列 `Janus` 日志，如果不想看到则可以关闭。与此同时，`Janus` 封装了一套日志，如果我们将 `Janus` 放置到全局初始化后，则可以使用该套日志。在后续代码中，如果大家想要项目日志全局可控（比如一键开关等），则可使用 `Janus` 封装好的日志，这样只需要更改`Debug`参数就可以全局控制日志输出或者隐藏。
```js
initJanus(){
  const that = this;
  Janus.init({
        debug: true,
        dependencies: Janus.useDefaultDependencies({
          adapter: adapter
        }),
        callback: ()=> {
          if(!Janus.isWebrtcSupported()) {
                Janus.log('is not Supported Webrtc!');
                return;
          }
        }
  });
  //客户端唯一标识
  let opaqueId = "videocall-"+Janus.randomString(12);
  console.log("opaqueId",opaqueId)
        // 注册：
  janus = new Janus({
                server: 'http://1.15.172.xx:18088/janus',
                apisecret:'suc119s119',
                success: function() {
                                Janus.log("初始化成功")
                },
                error: function(cause) {
                                // Error, can't go on...
                                Janus.log(cause)
                },
                destroyed: function() {
                                // I should get rid of this
                                Janus.log("destroyed")
                }
          });            
},
```

刷新页面查看，如果浏览器控制台打印如下内容，则表明初始化无误。

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/3fe1f83e58da4e56bedee8c47813d003~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

但是如果有**红色提示 ， 比如什么跨域或者是 403 等异常提示**时，那就说明你的 `Janus` 配置和自己当前连接的参数不一致。最常见的就是如下错误，你的 `Janus` 服务配置密钥（我们上一节讲的重点配置 `API Secret` 参数）和你当前代码中配置的不一致。
```sh
Ooops: 403 Unauthorized request (wrong or missing secret/token)
```

初始化 Janus API 之后，我们就要开始使用它的插件了，`Janus` 最优也是最灵活的特性就是它的插件了。

### 即插即拔的插件

为什么说 `Janus` 的插件 “`即插即拔`” 呢？因此 `Janus` 设计的架构就是如此，用到什么则引用什么。

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/8c4f2681194044e8886465e377d6e730~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

看上图我在官网截的一部分图，红色框框中的全部是它的插件 。

- `VideoCall` 代表 P2P 语音视频呼叫插件；
- `SIP` 代表 SIP 服务器插件，可以呼叫转移等等；
- `VideoRoom` 代表多媒体房间插件；
- `Record&Play` 代表视频录制插件。

还有其他几个我们就不细说了，在本小册中，我们的重点核心就是**实现会议**，会议和前面提到的多媒体房间是不是很类似？是的，因此我们在 `Janus` 网关应用的核心就是多媒体房间插件，同时如果涉及到房间内画面录制，那么自然少不了视频录制插件。

好了，了解了插件，接下来我们就实战使用 `Janus` 丰富的插件，先拿最简单的 P2P 媒体呼叫插件来举例子。

### 插件的初始化

在 Janus JavaScript API 中，所有的插件引入格式基本一致，都是按照插件名称来的，大家先看下面的代码，是 `videoCall` 插件的一些回调函数详解，在后面正式初始化的时候我会简写。
```js
janus.attach(
    {
        plugin: "janus.plugin.videocall",
        success: function(pluginHandle) {
            //插件初始化成功后 pluginHandle 就是全局句柄，通过 pluginHandle可以操作当前
            //会话的所有功能
        },
        error: function(cause) {
            //插件初始化失败
        },
       
        onmessage: function(msg, jsep) {
            //msg 交互信息包括挂断 接听等事件监听
            // jsep  协商信令
        },
        onlocaltrack: function(track, added) {
            // 本地媒体流发布后可以监听
        },
        onremotetrack: function(track, mid, added) {
            // 远端媒体流
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
```

看完了插件的详细信息，接下来我们就要初始化了，但前提是 `Janus` 已经在当前客户端注册成功，然后才能加载并初始化对应的插件，初始化方法的代码回调函数我保留了两个，其余的和前面详解中的一样：
```js
janus = new Janus({
        server: 'http://1.15.xx.xx:18088/janus',
        apisecret:'suc119119',
        success: function() {
            //Janus 这里初始化成功，然后调用初始化插件的方法
            Janus.log("初始化成功")
            //初始化插件
            that.initVideoCallPlugin()
        },
        error: function(cause) {
            // Error, can't go on...
            Janus.log(cause)
        },
        destroyed: function() {
            // I should get rid of this
            Janus.log("destroyed")
        }
});
------------------初始化插件的伪代码---------------------------------
initVideoCallPlugin(){
    const that = this
    janus.attach({
            plugin: "janus.plugin.videocall",
            success: function(pluginHandle) {
                //插件初始化成功后 pluginHandle 就是全局句柄，通过 pluginHandle可以操作当前
                //会话的所有功能
                videoCallPluginHandle = pluginHandle
                // console.log("视频呼叫插件初始化成功",videoCallPluginHandle)
            },
            error: function(cause) {
                //插件初始化失败
            },
        });
},
```

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/87e20907c07f44f2b6b07bf2feb5f015~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/bb19549c3d704a3cbad95cedea621235~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

上面两个图，第一个就是客户端 `Janus` 初始化成功后并成功初始化 `VideoCall` 插件，第二个图为服务器上打印的日志，仔细看里面的几个类似时间戳的长数字，是不是一致？

**在这里要给大家一个温馨提示，每个客户端每次初始化成功都会返回一个 `sessionId` ，这个 ID 和服务器是互相关联的，如果你的服务器重启 ， 那么当前客户端的 `sessionId` 也就没法用了。因此这个初始化过程一定要做全局可控。**

插件既然初始化了，那么怎么使用呢？关键就是我们在前面初始化代码中提到的句柄 `pluginHandle`，这个句柄可以操作所有的会话操作，比如呼叫、接听、挂断、媒体监控、媒体流控制等。

### 课后题

这节课的课后题就不扩展新的了，大家按照我说的从头下载 `Janus` 官方 JS，然后封装到自己的项目中，看看有没有什么问题，同时看看初始化过程中有无异常，会不会出现连接失败等现象。