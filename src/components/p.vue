<template>
  <div v-loading="loading">
      <!-- <vue-office-pdf
          :src="src"
          @rendered="renderedHandler"
          @error="errorHandler"
      /> -->
    <vue-office
      :file="src"
      :type="fileType"
      @loaded="handleLoaded"
    />
  </div>
</template>

<script setup>
//引入VueOfficePdf组件
import VueOffice from 'vue-office';
import { ref } from 'vue'

defineProps({
  src: {
    type: String,
    required: true
  },
  fileType: {
    type: String,
    default: 'pdf'
  }
})

const loading = ref(true)
// pdf: 'http://static.shanhuxueyuan.com/test.pdf' //设置文档地址

const handleLoaded = () => {
  loading.value = false
  console.log('File loaded successfully');
};
</script>

<style scoped>

</style>