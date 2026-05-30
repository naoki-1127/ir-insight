<script setup lang="ts">
//import PdfViewer from "./PdfViewer.vue";
import { onMounted, ref } from "vue";
import { loadPdf } from "../../service/pdf/loadPdf";
import { renderPage } from "../../service/pdf/renderPage";
import pdfIcon from "../../assets/pdf.png";
const container = ref<HTMLDivElement | null>(null);
const props = defineProps<{
  fileUrl: string;
  fileName: string;
  file: File | null;
}>();
const emit = defineEmits(["generate"]);
onMounted(async () => {
  console.log(props.fileUrl);
  if (props.fileUrl) {
    const pdf = await loadPdf(props.fileUrl);
    const canvas = await renderPage(pdf, 1);
    container.value?.appendChild(canvas);
  } else {
    if (props.file) {
      const url = URL.createObjectURL(props.file);
      console.log("test" + url);
      const pdf = await loadPdf(url);
      const canvas = await renderPage(pdf, 1);
      container.value?.appendChild(canvas);
    }
  }
});
</script>

<template>
  <div class="w-full max-w-3xl">
    <div class="flex flex-col gap-4 mb-4">
      <!-- タイトル -->
      <div class="flex">
        <h1 class="flex-1 text-ms font-bold flex gap-2 overflow-hidden">
          <img :src="pdfIcon" class="w-6 h-6 shrink-0" alt="" />
          <span class="truncate">
            {{ fileName }}
          </span>
        </h1>
      </div>

      <!-- ボタン -->
      <div class="flex justify-end">
        <button
          class="shrink-0 whitespace-nowrap bg-[#d5c5a9] text-black px-4 py-2 rounded text-xs font-bold"
          @click="$emit('generate')"
        >
          要約を生成する
        </button>
      </div>
    </div>

    <div ref="container"></div>
  </div>
</template>
