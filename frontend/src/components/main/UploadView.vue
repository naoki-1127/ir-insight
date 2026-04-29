<script setup lang="ts">
import { ref } from "vue";

const emit = defineEmits(["fileSelected", "urlSubmitted"]);

const url = ref("");
const isValidUrl = (value: string) => {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
};

const handleUrlSubmit = () => {
  if (!isValidUrl(url.value)) {
    alert("正しいURLを入力してください");
    return;
  }
  emit("urlSubmitted", url.value);
  url.value = "";
};
</script>

<template>
  <div class="w-full min-h-full flex items-center justify-center">
    <div class="w-full max-w-3xl text-center">
      <h2 class="text-3xl font-bold mb-4">
        PDFをアップロード または URLを入力
      </h2>

      <p class="text-gray-400 mb-10">
        文書をアップロードするか、URLから取得できます
      </p>

      <!-- Upload Area -->
      <label class="block cursor-pointer mb-8">
        <input
          type="file"
          accept="application/pdf"
          class="hidden"
          @change="(e) => emit('fileSelected', e)"
        />

        <div
          class="border-2 border-dashed border-gray-600 rounded-xl p-16 hover:border-[#d5c5a9] transition"
        >
          <p class="text-lg">ファイルをドロップ</p>
          <p class="text-sm text-gray-500 mt-2">またはクリックして選択</p>
        </div>
      </label>

      <!-- Divider -->
      <div class="flex items-center my-6">
        <div class="flex-1 h-px bg-gray-700"></div>
        <span class="px-4 text-gray-500 text-sm">または</span>
        <div class="flex-1 h-px bg-gray-700"></div>
      </div>

      <!-- URL Input -->
      <div class="flex gap-2">
        <input
          v-model="url"
          type="text"
          placeholder="PDFのURLを貼り付け"
          class="flex-1 px-4 py-3 rounded-lg bg-gray-800 border border-gray-600 focus:outline-none focus:border-[#d5c5a9]"
        />

        <button
          @click="handleUrlSubmit"
          class="px-6 py-3 bg-[#d5c5a9] text-black rounded-lg hover:opacity-90 transition"
        >
          取得
        </button>
      </div>
    </div>
  </div>
</template>
