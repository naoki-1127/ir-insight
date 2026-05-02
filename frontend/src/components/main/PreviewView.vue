<script setup lang="ts">
// pdf.ts
//import * as pdfjsLib from "pdfjs-dist";
// ★ Vite / ESMではworkerを明示指定する
//import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
//pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

//export default pdfjsLib;
defineProps<{
  fileName: string;
  fileText: string;
}>();

const emit = defineEmits(["generate"]);
</script>

<template>
  <div class="w-full max-w-3xl">
    <div class="flex items-center gap-4 mb-4">
      <!-- File Name -->
      <h1 class="flex-1 text-sm text-gray-400 break-words">
        {{ fileName }}
      </h1>

      <!-- Button -->
      <button
        class="shrink-0 whitespace-nowrap bg-[#d5c5a9] text-black px-4 py-2 rounded text-xs font-bold"
        @click="$emit('generate')"
      >
        要約を生成する
      </button>
    </div>

    <!-- Text -->
    <p class="text-sm text-gray-400 whitespace-pre-wrap">
      {{ fileText }}
    </p>
  </div>
</template>
