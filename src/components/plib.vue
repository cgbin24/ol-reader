<template>
  <div class="pdfPreview">
    <div class="pdfWrap" ref="pWrapRef">
      <canvas ref="canvas" class="pdfCanvas"></canvas>
    </div>
    <div class="page-tool" v-show="showAction">
      <div class="page-tool-item" @click="lastPage">pre</div>
      <div class="page-tool-item" @click="nextPage">next</div>
      <div class="page-tool-item">{{ state.pageNum }} / {{ state.numPages }}</div>
    </div>
    <div v-if="loading" class="loading">
      <div class="loading-content">
        <div class="loading-icon"></div>
        <div class="loading-text">Loading...</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, reactive } from 'vue';
import { PDFDocument } from 'pdf-lib';

// Utility function to create an image from a Blob
const createImageFromBlob = (blob) => {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = URL.createObjectURL(blob);
  });
};

const props = defineProps({
  src: {
    type: String,
    required: true,
  },
});

const canvas = ref(null);
const state = reactive({
  pageNum: 1,
  numPages: 1,
});
const showAction = ref(true);
const pWrapRef = ref(null);
const loading = ref(false);

onMounted(async () => {
  loading.value = true;
  await init();
});

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

const init = async () => {
  try {
    // Fetch the PDF file
    const response = await fetch(props.src);
    const pdfBytes = await response.arrayBuffer();

    // Load the PDF document
    const pdfDoc = await PDFDocument.load(pdfBytes);
    state.numPages = pdfDoc.getPageCount();

    // Render the current page to canvas
    await renderPage(pdfDoc);
  } catch (error) {
    console.error('Error initializing PDF viewer:', error);
  } finally {
    loading.value = false;
  }
};

const renderPage = async (pdfDoc) => {
  try {
    if (canvas.value) {
      const page = pdfDoc.getPage(state.pageNum - 1); // PDF pages are 0-indexed
      const { width, height } = page.getSize();
      const context = canvas.value.getContext('2d');

      if (context) {
        // Adjust canvas size
        canvas.value.width = width;
        canvas.value.height = height;
        canvas.value.style.width = `${width}px`;
        canvas.value.style.height = `${height}px`;

        // Convert page to image and draw on canvas
        const pdfBytes = await pdfDoc.save();
        const pdfUrl = URL.createObjectURL(new Blob([pdfBytes], { type: 'application/pdf' }));
        
        // Use pdf.js or a similar library to render PDF to image
        const image = await createImageFromBlob(new Blob([pdfBytes], { type: 'application/pdf' }));
        context.drawImage(image, 0, 0, width, height);
        URL.revokeObjectURL(pdfUrl);
      }
    }
  } catch (error) {
    console.error('Error rendering page:', error);
  }
};

const updateCanvas = async () => {
  const response = await fetch(props.src);
  const pdfBytes = await response.arrayBuffer();
  const pdfDoc = await PDFDocument.load(pdfBytes);
  await renderPage(pdfDoc);
};
</script>

<style lang="scss" scoped>
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
