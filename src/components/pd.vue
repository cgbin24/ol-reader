<template>
  <div class="pdfPreview">
    <div class="pdfWrap" ref="pWrapRef">
      <canvas ref="canvas" class="pdfCanvas"></canvas>
    </div>
    <!-- <div class="pdfWrap">
      <embed class="pdfCanvas" :src="src" style="width: 580px; height: 350px;" />
    </div> -->
    <div class="page-tool" v-show="showAction">
      <div class="page-tool-item" @click="lastPage">pre</div>
      <div class="page-tool-item" @click="nextPage">next</div>
      <div class="page-tool-item">{{state.pageNum}} / {{state.numPages}}</div>
      <!-- <div class="page-tool-item" @click="pageZoomOut">+</div>
      <div class="page-tool-item" @click="pageZoomIn">-</div>
      <div class="page-tool-item" @click="showAction = false">x</div> -->
    </div>
    <!-- loading -->
    <div v-if="loading" class="loading">
      <div class="loading-content">
        <div class="loading-icon"></div>
        <div class="loading-text">Loading...</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, reactive, onBeforeUnmount } from 'vue';
// import { getDocument, GlobalWorkerOptions, version } from 'pdfjs-dist';
// // import { getDocument, GlobalWorkerOptions, version } from 'pdfjs-dist';
// GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.mjs`;
import workerStr from './vP/worker?raw';
import pdfjsLib from './vP/pdf?raw';
import { base64_encode } from '../utils/base64';
import { download as downloadFile, getUrl, loadScript } from '../utils/url';

const pdfJsLibSrc = `data:text/javascript;base64,${(base64_encode(pdfjsLib))}`;
const PdfJsWorkerSrc = `data:text/javascript;base64,${(base64_encode(workerStr))}`;

const props = defineProps({
  src: {
    type: String,
    required: true,
  },
});

const canvas = ref(null);
const state = reactive({
  source: props.src,
  pageNum: 1,
  scale: 1,
  numPages: 1,
});
const showAction = ref(true);
const pWrapRef = ref(null);
const loading = ref(false);

onMounted(async () => {
  showToast('init GlobalWorkerOptions')
  loading.value = true;
  // setTimeout(() => {
  //   init();
  // }, 1000);
  if (props.src) {
    checkPdfLib().then(init).catch(e => {
      console.warn(e);
      loading.value = false;
    });
  }
});
onBeforeUnmount(() => {
  if (window.pdfjsLib === null) {
    return;
  }
  window.pdfjsLib.destroy();
  window.pdfjsLib = null;
  loadingTask = null;
});

const installPdfScript = () => {
  return loadScript(pdfJsLibSrc).then(() => {
    if (window.pdfjsLib) {
      console.log('installPdfScript:', window.pdfjsLib);
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PdfJsWorkerSrc;
    } else {
      return Promise.reject('window.pdfjsLib未找到');
    }
  });
}

const checkPdfLib = () => {
  if (window.pdfjsLib) {
    return Promise.resolve();
  }
  return installPdfScript();
}

const lastPage = () => {
  if (state.pageNum > 1) {
    state.pageNum -= 1;
    updateCanvas();
  }
};

const nextPage = () => {
  if (state.pageNum < state.numPages) {
    state.pageNum += 1;
    updateCanvas();
  }
};

const pageZoomOut = () => {
  if (state.scale < 2) {
    state.scale += 0.1;
    updateCanvas();
  }
};

const pageZoomIn = () => {
  if (state.scale > 0.8) {
    state.scale -= 0.1;
    updateCanvas();
  }
};

const fetchWithTimeout = (url, timeout = 10000) => {
  return Promise.race([
    fetch(url),
    new Promise((_, reject) =>
      setTimeout(() => reject(showToast('Request timed out')), timeout)
    ),
  ]);
}


const init = async () => {
  try {
    if (canvas.value) {
      showToast('init')
      const pdf = await window.pdfjsLib.getDocument({url: props.src, fetch: fetchWithTimeout}).promise;
      showToast('init getDocument')
      state.numPages = pdf.numPages;
      await renderPage();
    }
  } catch (error) {
    console.error('Error initializing PDF viewer:', error);
    showToast(error);
  } finally {
    loading.value = false;
  }
};

const renderPage = async () => {
  showToast('renderPage')
  try {
    if (canvas.value) {
      const pdf = await window.pdfjsLib.getDocument(props.src).promise;
      const page = await pdf.getPage(state.pageNum);
      const viewport = page.getViewport({ scale: state.scale });
      console.log('viewport:', viewport);
      const context = canvas.value.getContext('2d');

      if (context) {
        showToast('renderPage context')
        // const outputScale = window.devicePixelRatio || 1;
        const outputScale = window.devicePixelRatio > 2 ? 1.5 : 2;
        canvas.value.width = viewport.width * outputScale;
        canvas.value.height = viewport.height * outputScale;
        canvas.value.style.width = `${pWrapRef.value.style.width}px`;
        canvas.value.style.height = `${pWrapRef.value.style.height}px`;

        context.setTransform(outputScale, 0, 0, outputScale, 0, 0);

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };

        await page.render(renderContext).promise;
        loading.value = false;
        showToast('renderPage success')
      }
    }
  } catch (error) {
    console.error('Error rendering page:', error);
  }
};

const updateCanvas = async () => {
  loading.value = true;
  // 将上一次缓存的canvas清空
  const context = canvas.value.getContext('2d');
  context.clearRect(0, 0, canvas.value.width, canvas.value.height);
  await renderPage();
};

const showToast = (msg) => {
  // alert(msg);
  console.log(msg);
};

</script>

<style lang="scss" scoped>
@import url('/static/reset.css');
.pdfPreview {
  position: relative;
  .pdfWrap {
    overflow: hidden;
    border: 1px solid #ccc;
    box-sizing: border-box;
    padding: 0;
    border-radius: 4px;
  }
  .pdfCanvas {
    width: 100%;
    height: auto;
  }
  .page-tool {
    position: absolute;
    top: 10px;
    right: 0px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .page-tool-item {
    user-select: none;
    min-width: 80px;
    padding: 4px 12px;
    text-align: center;
    border-radius: 19px;
    background: rgba(0, 0, 0, 0.2);
    color: #fff;
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
  .loading-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    .loading-icon {
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
    .loading-text {
      color: #fff;
    }
  }
}

</style>
