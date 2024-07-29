<script setup>
import { ref, onMounted, watch, onBeforeUnmount, nextTick } from 'vue-demi';
import workerStr from './worker?raw';
import pdfjsLib from './pdf?raw';
import { download as downloadFile, getUrl, loadScript } from '../../utils/url';
import { base64_encode } from '../../utils/base64';

const pdfJsLibSrc = `data:text/javascript;base64,${(base64_encode(pdfjsLib))}`;
const PdfJsWorkerSrc = `data:text/javascript;base64,${(base64_encode(workerStr))}`;

const props = defineProps({
  src: [String, ArrayBuffer],
  requestOptions: {
    type: Object,
    default: () => ({})
  },
  staticFileUrl: {
    type: String,
    default: 'https://unpkg.com/pdfjs-dist@3.1.81/'
  },
  options: {
    type: Object,
    default: () => ({})
  }
});
const emits = defineEmits(['rendered', 'error']);
let pdfDocument = null;
let loadingTask = null;
const wrapperRef = ref(null);
const canvasRef = ref(null);
const numPages = ref(0);
const curIndex = ref(0);  // 当前页码
const loading = ref(false);
const lazySize = 5;

watch(() => props.src, () => {
  checkPdfLib().then(init).catch(e => {
    console.warn(e);
  });
});

onMounted(() => {
  loading.value = true;
  nextTick(() => {
    if (props.src) {
      checkPdfLib().then(init).catch(e => {
        console.warn(e);
        loading.value = false;
      });
    }
  });
});

onBeforeUnmount(() => {
  if (pdfDocument === null) {
    return;
  }
  pdfDocument.destroy();
  pdfDocument = null;
  loadingTask = null;
});

const installPdfScript = () => {
  return loadScript(pdfJsLibSrc).then(() => {
    if (window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PdfJsWorkerSrc;
    } else {
      return Promise.reject('window.pdfjsLib未找到');
    }
  });
};

const checkPdfLib = () => {
  if (window.pdfjsLib) {
    return Promise.resolve();
  }
  return installPdfScript();
};

const init = () => {
  if (!props.src) {
    numPages.value = 0;
    loading.value = false;
    return;
  }
  loadingTask = window.pdfjsLib.getDocument({
    url: getUrl(props.src),
    httpHeaders: props.requestOptions && props.requestOptions.headers,
    withCredentials: props.requestOptions && props.requestOptions.withCredentials,
    cMapUrl: `${props.staticFileUrl.endsWith('/') ? props.staticFileUrl : props.staticFileUrl + '/'}cmaps/`,
    cMapPacked: true,
    enableXfa: true,
  });
  loadingTask.promise.then((pdf) => {
    pdfDocument && pdfDocument.destroy();
    pdfDocument = pdf;
    numPages.value = props.options.lazy ? Math.min(pdfDocument.numPages, lazySize) : pdfDocument.numPages;
    renderPage(1);
  }).catch((e) => {
    emits('error', e);
    loading.value = false;
  });
};

const handleScrollPdf = (e) => {
  if (!props.options.lazy) {
    return;
  }
  const { scrollTop, scrollHeight, clientHeight } = e.target;
  if (scrollTop + clientHeight >= scrollHeight) {
    if (numPages.value >= pdfDocument.numPages) {
      return;
    }
    let oldNum = numPages.value;
    numPages.value = Math.min(pdfDocument.numPages, oldNum + lazySize);
    if (numPages.value > oldNum) {
      renderPage(oldNum + 1);
    }
  }
};

const renderPage = (num) => {
  pdfDocument.getPage(num).then((pdfPage) => {
    const viewport = pdfPage.getViewport({ scale: 2 });
    const outputScale = window.devicePixelRatio > 2 ? 1.5 : 2;

    const canvas = canvasRef.value;
    const ctx = canvas.getContext('2d');

    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);

    let domWidth = Math.floor(viewport.width);
    let domHeight = Math.floor(viewport.height);
    if (props.options.width) {
      let scale = props.options.width / domWidth;
      domWidth = Math.floor(props.options.width);
      domHeight = Math.floor(domHeight * scale);
    }

    let wrapperWidth = wrapperRef.value.getBoundingClientRect().width;
    if (domWidth > wrapperWidth) {
      let scale = wrapperWidth / domWidth;
      domWidth = Math.floor(wrapperWidth);
      domHeight = Math.floor(domHeight * scale);
    }

    canvas.style.width = domWidth + 'px';
    canvas.style.height = domHeight + 'px';

    const transform = outputScale !== 1
      ? [outputScale, 0, 0, outputScale, 0, 0]
      : null;

    const renderTask = pdfPage.render({
      canvasContext: ctx,
      transform,
      viewport
    });
    renderTask.promise.then(() => {
      emits('rendered');
      loading.value = false;
    }).catch((e) => {
      emits('error', e);
      loading.value = false;
    });
  }).catch((e) => {
    emits('error', e);
  });
};

const changePage = (type) => {
  if (type === '+') {
    if (curIndex.value < numPages.value - 1) {
      curIndex.value++;
    } else {
      return;
    }
  } else {
    if (curIndex.value > 0) {
      curIndex.value--;
    } else {
      return;
    }
  }
  renderPage(curIndex.value + 1);
};
</script>

<template>
  <div class="pageWrap">
    <div class="pdfViewer" ref="pdfViewer" @scroll="handleScrollPdf">
      <div v-if="numPages" ref="wrapperRef" class="pdfViewerWrap">
        <canvas ref="canvasRef" style="width:100%" />
      </div>
    </div>
    <!-- 页码切换器 -->
    <div class="pageActions" v-if="numPages">
      <section class="actionBlock">
        <div class="items">{{curIndex + 1}} / {{numPages}}</div>
      </section>
      <section class="actionBlock">
        <div class="items" @click="changePage('-')"> <- pre </div>
        <div class="items" @click="changePage('+')"> next -> </div>
      </section>
    </div>
    <!-- loading -->
    <div v-if="loading" class="loading">
      <div class="loadingCont">
        <div class="loadingIcon"></div>
        <div class="loadingText">Loading...</div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@media (max-width: 768px) {
  .VPDoc.has-sidebar.has-aside {
    padding: 0;
    .VPDocFooter {
      padding: 32px 24px 96px;
    }
  }
}
.pageWrap {
  position: relative;
  .pdfViewerWrap {
    overflow: hidden;
    border: 1px solid #ccc;
    box-sizing: border-box;
    padding: 0;
    border-radius: 4px;
  }
  .pageActions {
    position: absolute;
    bottom: -34px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    .actionBlock {
      display: flex;
      gap: 4px;
      .items {
        user-select: none;
        min-width: 60px;
        padding: 2px 10px;
        text-align: center;
        border-radius: 10px;
        background: rgba(0, 0, 0, 0.2);
        color: #fff;
      }
    }
  }
  
  .loading {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 999;
    display: flex;
    justify-content: center;
    align-items: center;
    .loadingCont {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      .loadingIcon {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        border: 4px solid #fff;
        border-top-color: #ccc;
        animation: spin 1s linear infinite;
      }
      @keyframes spin {
        0% {
          transform: rotate(0deg);
        }
        100% {
          transform: rotate(360deg);
        }
      }
      .loadingText {
        color: #fff;
      }
    }
  }
}
</style>
