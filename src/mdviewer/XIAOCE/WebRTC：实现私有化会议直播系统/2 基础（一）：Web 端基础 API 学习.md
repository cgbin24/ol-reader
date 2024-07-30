摄像头和麦克风属于用户的隐私设备，`WebRTC`既然成为了浏览器中音视频即时通信的`W3C`标准，因此必然会提供`API`，让有一定代码开发能力的人去调用。当然，这些是程序员的基础技能了，要求不是很高，但也需要我们基本熟知。这节课，我们就来看看这些基础`API`。

> 注意敲黑板： 使用这些`API`是有前提条件的哦，首先在`安全源`访问，调用`API`才没有任何阻碍的。那什么是`安全源`呢？看下面思维导图（更详细的看：[chrome官方文档](https://www.chromium.org/Home/chromium-security/prefer-secure-origins-for-powerful-new-features/)），且记住这句话：**`安全源` 是至少匹配以下（ Scheme 、 Host 、 Port ）模式之一的源**。

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/c8dc0f611e154ca4ba4db4ef61ad5568~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

> 举个简单的例子：你本地开发用`HTTP`请求地址获取摄像头`API`没有问题，但是你的同事用他的电脑访问你电脑IP对应的项目地址时，摄像头调用失败，为什么呢？

> 因为在他的浏览器中，你的项目访问地址非`HTTPS`，在非`HTTPS`的情况下，如果`IP`不是`localhost`或`127.0.0.1`，都不属于安全源。

> **当然事非绝对，在特定情况下必须使用非`HTTPS`访问也是可以的，`Chrome`提供了对应的取消限制但是不太建议用（安全为上），因此我在这里就不再多余阐述。**

> 所以经常有同学问，为什么我的代码在自己浏览器中可以获取到摄像头，但是在区域网下别的电脑的浏览器中获取不到？同样的浏览器、同样的操作系统，为什么获取不到呢？原因就是上面的**安全源**限制。

### getUserMedia

以前的版本中我们经常使用 `navigator.getUserMedia` 来获取计算机的摄像头或者麦克风，但是现在这个接口废弃，变更为 `navigator.mediaDevices.getUserMedia`，因此后面我们均使用新的`API`来完成代码编写。

#### `getUserMedia`可以干什么？

意如其名，那就是获取用户层面的媒体，当你的计算机通过 `USB` 或者其他网络形式接入了 **N 多个**摄像头或虚拟设备时，都是可以通过这个 `API` 获取到的。 当然不仅仅是视频设备，还包括音频设备和虚拟音频设备。 **获取媒体设备是最简单的操作，它还可以控制获取到媒体的分辨率，以及其他的以一些可选项**。

> PS：在很多云会议中，我们开会只能选择一个摄像头，这并不是只能使用一个摄像头，而是厂商针对“大多数场景中只会用到一个摄像头”而设计的；**但在有些业务中，我们可能需要自己设备上的N 个摄像头（带USB摄像头）同时使用，那么如何办到呢**（这个场景其实蛮多的，后面留个课后题）。因此熟知这个 API 对于解决基本的会议和其他复杂场景问题很有用。

#### 如何使用 `getUserMedia`？
有简单的用法，有复杂的用法。一般简易场景下，大多数 API 用默认参数就可以实现对应功能，`getUserMedia`也一样，直接调用不使用任何参数，则获取的就是 PC 的默认摄像头和麦克风。

但是，当我们遇到复杂一点的应用场景，比如**你的电脑上自带麦克风，同时你连接了蓝牙耳机和有线耳机，那么在视频通话过程中，你如何主动选择使用哪个呢？也就是说**， 在用摄像头或者麦克风之前，我们先要解决如何从 **N 个摄像头或者麦克风**中选择我们想要的。

要解决这个问题，我们必须先有个大体的思路（当然这个思路并不是凭空想象出来的，而是在一定的技术储备下才有的。如果你开始前没有任何思路也没关系，可以参考他人的经验），如下：

1. 获取当前设备所有的摄像头和麦克风信息；
2. 从所有的设备信息中遍历筛选出我们想要使用的设备；
3. 将我们想要使用的设备以某种参数的形式传递给浏览器 `API`；
4. 浏览器`API`去执行获取的任务。

上面提到的**设备以某种参数的形式传递给 `API`**，那么这个设备必然是以参数存在的，因此这里有几个概念需要提前知道，如下：

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/3b120e9bf11f4cc092dd1687f10738a3~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

设备分成了图中的三个大类型，每个类型都有固定的字段，比如 `ID`、`kind`、`label` ，而其中用于区分它们的就是`kind字段`中的**固定值**，**最核心的字段就是 ID**，后面我们经常用的就是这个 ID。

那么，在前端如何使用 ```JavaScript```获取到这些信息？

大家先看下面这段代码，大体上过一遍，并留意 `initInnerLocalDevice`函数内部执行顺序。
```js
function handleError(error) {
    alert("摄像头无法正常使用，请检查是否占用或缺失")
    console.error('navigator.MediaDevices.getUserMedia error: ', error.message, error.name);
}
/**
 * @author suke
 * device list init 
 */
function initInnerLocalDevice(){
        const that  = this
        var localDevice = {
            audioIn:[],
            videoIn: [],
            audioOut: []

        }
        let constraints = {video:true, audio: true}
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
            console.log("浏览器不支持获取媒体设备");
            return;
        }
        navigator.mediaDevices.getUserMedia(constraints)
            .then(function(stream) {
                stream.getTracks().forEach(trick => {
                    trick.stop()
                })
                // List cameras and microphones.
                navigator.mediaDevices.enumerateDevices()
                    .then(function(devices) {
                        devices.forEach(function(device) {
                            let obj = {id:device.deviceId, kind:device.kind, label:device.label}
                            if(device.kind === 'audioinput'){
                                if(localDevice.audioIn.filter(e=>e.id === device.deviceId).length === 0){
                                    localDevice.audioIn.push(obj)
                                }
                            }if(device.kind === 'audiooutput'){
                                if(localDevice.audioOut.filter(e=>e.id === device.deviceId).length === 0){
                                    localDevice.audioOut.push(obj)
                                }
                            }else if(device.kind === 'videoinput' ){
                                if(localDevice.videoIn.filter(e=>e.id === device.deviceId).length === 0){
                                    localDevice.videoIn.push(obj)
                                }
                            }
                        });
                    })
                    .catch(handleError);

            })
            .catch(handleError);
    }
```

这个代码片段的主要作用就是获取用户设备上所有的摄像头和麦克风信息，起关键作用的是`enumerateDevices`函数，但是在调用这个关键函数之前，`getUserMedia`函数出现在了这里，它的出现是用户在访问服务时直接调用用户摄像头，此时如果用户授权且同意使用设备摄像头、麦克风，那么`enumerateDevices`函数就能获取设备信息了，在这里`getUserMedia`函数可以理解为获取摄像头或者麦克风权限集合的**探路函数**。

看下图，我将我电脑上使用`enumerateDevices`函数加载到的信息，根据前面提到的字段`kind`，将其分三类并打印到控制台。

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/0b117aa627324b72b6fbe039461468f1~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

千万不要小看现在获取到的这些信息哦，在后面视频通话或会议过程中，我们需要抉择摄像头用前置还是后置，麦克风是用蓝牙还是有线，都是离不开这些信息的。

在拿到所有的摄像头麦克风信息之后，我们需选出最终要参与视频通话的那个信息体，看上图中 **`VideoIn`数组里面`label:"eseSoft Vcam"`** ， 这个摄像头就是我想要参会的摄像头，那么我怎样指定让代码去选择这个摄像头呢？这里就涉及到了`getUserMedia`的约束参数`constraints` 。

#### 媒体约束 constraints

在具体讲解约束参数 constraints 之前，大家先看下面这段示例代码。
```js
let constraints = {video:true, audio: true} 
--
    function handleError(error) {
        console.error('navigator.MediaDevices.getUserMedia error: ', error.message, error.name);
    }
--
    /**
     * 获取设备 stream
     * @param constraints
     * @returns {Promise<MediaStream>}
     */
    async function getLocalUserMedia(constraints){
        return await navigator.mediaDevices.getUserMedia(constraints)
    }
--
    let stream = await this.getLocalUserMedia(constraints).catch(handleError);
console.log(stream)
```

上面的代码片段为`JavaScript`获取计算机摄像头和麦克风的媒体流（视频和音频流我们统称为媒体流）的一种方式，大多数情况下都是这么用的，如果电脑有摄像头、麦克风，这样获取没有任何问题，但就担心你用的时候，你的电脑上**没有配摄像头或麦克风，或者有多个摄像头而你想指定其中某一个**。 为了兼容更多情况，我们需要知道`constraints`这个参数的详细用法。

接下来我们看下这个参数在几种常见场景下的具体配置，以及为什么这样配置。

1. **同时获取视频和音频输入**

使用下面约束， 如果遇到计算机没有摄像头的话，你调用上述代码的过程中就会报错，因此我们在调用之前可以通过`enumerateDevices`返回结果主动判断有无视频输入源，没有的话，可以动态将这个参数中的 `video`设置为`false`。
```js
{ audio: true, video: true }
```

2. **获取指定分辨率**

在会议宽带足够且流媒体传输合理的情况下，无需考虑服务端压力，而需考虑客户端用户摄像头的分辨率范围，通常我们会设置一个分辨率区间。

下面展示的①约束是请求一个 `1920×1080` 分辨率的视频，但是还提到 `min` 参数，将 `320×240` 作为最小分辨率，因为并不是所有的网络摄像头都可以支持 `1920×1080` 。当请求包含一个 `ideal`（应用最理想的）值时，这个值有着更高的权重，意味着浏览器会先尝试找到最接近指定理想值的设定或者摄像头（如果设备拥有不止一个摄像头）。

但是，在多人会议简单架构场景中，在不改变会议稳定性的情况下，为了让更多的客户端加入，我们通常会把高分辨率主动降低到低分辨率，约束特定摄像头获取指定分辨率如下面②配置。
```js

    --------------------①:1--------------------------
    {
        audio: true,
        video: {
            width: { min: 320, ideal: 1280, max: 1920 },
            height: { min: 240, ideal: 720, max: 1080 }
        }
    }
    --------------------②:2--------------------------
    {
    audio: true,
    video: { width: 720, height: 480}
}
```

3. **指定视频轨道约束：获取移动设备的前置或者后置摄像头**

`facingMode`属性。可接受的值有：`user`（前置摄像头）、`environment`（后置摄像头）；需要注意的是，**这个属性在移动端可用**，当我们的会议项目通过 h5 在移动端打开时，我们可以动态设置这个属性从而达到**切换前后摄像头**的场景。
```js
{ audio: true, video: { facingMode: "user" } }
{ audio: true, video: { facingMode: { exact: "environment" } } }
```

4. **指定帧速率`frameRate`**

帧速率（你可以理解为`FPS`）不仅对视频质量，还对带宽有着影响，所以在我们通话过程中，如果判定网络状况不好，那么可以限制帧速率。

我们都知道，**视频是通过一定速率的连续多张图像形成的**，比如每秒 24 张图片才会形成一个基础流畅的视频，因此帧速率对于实时通话的质量也有影响，你可以想象成和你的游戏的`FPS`一个道理。
```js
const constraints = {
    audio: true,
    video: {
        width:1920,
        height:1080,
        frameRate: { ideal: 10, max: 15 }
    }
};
```

实际上，通过`FPS`我们可以引申出来一些场合，在特定场合选择特定的`FPS`搭配前面的分辨率配置，以提高我们会议系统的质量，比如：

- 屏幕分享过程中，我们应当很重视高分辨率而不是帧速率，稍微卡点也没关系；
- 在普通会议过程中，我们应当重视的是画面的流畅，即帧速率而不是高分辨率；
- 在开会人数多但宽带又受限的情况下，我们重视的同样是会议的流程性，同样低分辨率更适合宽带受限的多人会议；
- ……

还有很多场合大家可以想想。

5. **使用特定的网络摄像头或者麦克风**

重点哦，我们最前面`enumerateDevices`函数获取到的设备集合可以派上用场了。
```js
/**
 * 获取指定媒体设备id对应的媒体流
 * @author suke
 * @param videoId
 * @param audioId
 * @returns {Promise<void>}
 */
async function getTargetIdStream(videoId,audioId){
    const constraints = {
        audio: {deviceId: audioId ? {exact: audioId} : undefined},
        video: {
            deviceId: videoId ? {exact: videoId} : undefined,
            width:1920,
            height:1080,
            frameRate: { ideal: 10, max: 15 }
        }
    };
    if (window.stream) {
        window.stream.getTracks().forEach(track => {
            track.stop();
        });
    }
    //被调用方法前面有，此处不再重复
    let stream = await this.getLocalUserMedia(constraints).catch(handleError);

}
```

### getDisplayMedia

我们日常开会，多数需要通过会议 App 来分享自己的屏幕，或者仅分享桌面上固定的应用程序那么在浏览器中实现视频通话，能否实现分享屏幕呢？**答案是肯定的**， `W3C`的 [Screen Capture](https://w3c.github.io/mediacapture-screen-share/) 标准中有说明，就是使用`getDisplayMedia`。
```js
var promise = navigator.mediaDevices.getDisplayMedia(constraints);

## 获取屏幕分享
navigator.mediaDevices.getDisplayMedia(constraints)
  .then((stream) => {
    /* use the stream */
  })
  .catch((err) => {
    /* handle the error */
  });
```

#### 参数 Constraints

同上一个函数一样，同样需要配置`constraints`约束，当然这个也是可选的， 如果选择传参的话，那么参数设置如下：
```js
getDisplayMedia({
  audio: true,
  video: true
})
```

但是这里的`constraints`配置和前面`getUserMedia`的约束配置是有差别的。又一个重点来了，在屏幕分享的约束中，**video** 是不能设置为`false` 的，**但是可以设置指定的分辨率**，如下：
```js
getDisplayMedia({
  audio: true,
  video: {width:1920,height:1080}
})
```

1. **audio**为**true**

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/06e1a3ae0e694142bf8a7a97b4e454af~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

2. **audio** 为 **false**

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/e430db0142b44504a2263c5d86767aaf~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

请留意上面两图的对比，当去掉音频后，第二张图少了个勾选系统音频的 radio 框。

#### 完整案例
```js
/**
 * 获取屏幕分享的媒体流
 * @author suke
 * @returns {Promise<void>}
 */
async function getShareMedia(){
    const constraints = {
        video:{width:1920,height:1080},
        audio:false
    };
    if (window.stream) {
        window.stream.getTracks().forEach(track => {
            track.stop();
        });
    }
    return await navigator.mediaDevices.getDisplayMedia(constraints).catch(handleError);
}
```

#### 项目演示指南

下载仓库代码之后，启动；然后打开第一个摄像头操作模块。

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/67390fdc96f24bf1a32fc8d0824c728b~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

![](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/b03a957556ee4a779f36b7e9ef800086~tplv-k3u1fbpfcp-jj-mark:3024:0:0:0:q75.awebp)

请选择好参数，然后点击确定，就可以演示这些参数的作用，尤其到 `FPS` 那里，大家可以尝试调制 `1-5` 效果最明显。

#### 本节所有源代码地址

[源码和体验地址](https://codepen.io/wangsrgit119/pen/ZERVjRo)

### 小提示
- 在前面的案例代码中，我们在获取系统的音频或者视频的`stream`之前，一般会调用以下代码，目的是清除当前标签页中没有销毁的媒体流。   
```js
   if (window.stream) {
           window.stream.getTracks().forEach(track => {
               track.stop();
           });
       }
```

如果不销毁，你可以看到在标签页旁边一直有个小红圈闪烁，鼠标按上去提示正在使用当前设备的摄像头，因此在后面的开发中保持好习惯：结束自己会议后或页面用完摄像头后，一般除了强制刷新，也可以调用上面代码清除正在使用的`stream`调用。

好了，这节课我们我们掌握了两个最重要的 API，下节课我们开始搭建一个信令服务器，同时完成 `P2P` (单人对单人)的视频通话（跑代码的时候一定要记得前面提到的**安全源**哦）。

### 课后题

大家可以思考思考，在分辨率和`FPS`的配置以及宽带的利用上还有有哪些场景和实践，欢迎在留言区讨论。