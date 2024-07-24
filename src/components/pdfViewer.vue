<template>
  <div class="pdfPreview">
    <div class="pdfWrap">
      <vue-pdf-embed :source="state.source" :style="scale" :page="state.pageNum" />
    </div>
    <div class="page-tool" v-show="showAction">
      <div class="page-tool-item" @click="lastPage">pre</div>
      <div class="page-tool-item" @click="nextPage">next</div>
      <div class="page-tool-item">{{state.pageNum}} / {{state.numPages}}</div>
      <div class="page-tool-item" @click="pageZoomOut">+</div>
      <div class="page-tool-item" @click="pageZoomIn">-</div>
      <div class="page-tool-item" @click="showAction = false">x</div>
    </div>
  </div>
</template>
<script setup lang="ts">
import VuePdfEmbed from "vue-pdf-embed";
import { getDocument, GlobalWorkerOptions, version } from "pdfjs-dist";
import { reactive, onMounted, computed, ref, nextTick } from "vue";

GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.mjs`;
const props = defineProps({
  pdfUrl: {
    type: String,
    required: true
  }
})
const state = reactive({
  source: props.pdfUrl, //预览pdf文件地址
  pageNum: 1, //当前页面
  scale: 1, // 缩放比例
  numPages: 1, // 总页数
});
const scale = computed(() => `transform:scale(${state.scale})`)
const showAction = ref(true)

onMounted(() => {
  init()
});

const init = async () => {
  try {
    const pdf = await getDocument(state.source).promise
    state.numPages = pdf.numPages;
  } catch (error) {
    console.log(error);
  }
}

const lastPage = () => {
  if (state.pageNum > 1) {
      state.pageNum -= 1;
  }
}
const nextPage = () => {
  if (state.pageNum < state.numPages) {
      state.pageNum += 1;
  }
}
const pageZoomOut = () => {
  if (state.scale < 2) {
      state.scale += 0.1;
  }
}
const pageZoomIn = () => {
  if (state.scale > 0.8) {
      state.scale -= 0.1;
  }
}
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
    background: rgba(66, 66, 66, 0.4);
    color: #fff;
  }
}
</style>