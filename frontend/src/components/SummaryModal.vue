<script setup lang="ts">
type Summary = {
  title: string;
  symbol: string;
  company_name: string;
  fiscal_period: string;
  revenue: number;
  previous_revenue: number;
};

const props = defineProps<{
  show: boolean;
  summary: Summary | null;
}>();

const emit = defineEmits(["close", "generate", "save"]);

const summaryLists = [
  { key: "title", label: "IRタイトル" },
  { key: "symbol", label: "銘柄" },
  { key: "company_name", label: "会社名" },
  { key: "fiscal_period", label: "会計期" },
  { key: "revenue", label: "売上" },
  { key: "previous_revenue", label: "前年同会計期売上" },
] as const;
</script>

<template>
  <div
    v-if="show"
    class="fixed inset-0 bg-black/50 flex items-center justify-center"
  >
    <!-- 未生成 -->
    <div v-if="!summary" class="bg-white rounded-lg p-6 w-[400px] text-left">
      <h2 class="text-lg font-bold mb-4 text-black">要約を生成しますか？</h2>

      <p class="text-sm text-black mb-6">このPDFの内容をAIで要約します。</p>

      <div class="flex justify-end gap-2">
        <button
          class="px-3 py-1 text-sm bg-gray-200 text-black rounded"
          @click="$emit('close')"
        >
          キャンセル
        </button>

        <button
          class="px-3 py-1 text-sm bg-[#d5c5a9] text-black rounded font-bold"
          @click="$emit('generate')"
        >
          実行
        </button>
      </div>
    </div>

    <!-- 生成後 -->
    <div v-else class="bg-white rounded-lg p-6 w-[400px] text-left">
      <h2 class="text-lg font-bold mb-4 text-black">要約しました</h2>

      <div v-for="item in summaryLists" :key="item.key">
        <p v-if="summary[item.key]" class="text-sm text-black mb-2">
          {{ item.label }}: {{ summary[item.key] }}
        </p>
      </div>

      <div class="flex justify-end gap-2 mt-4">
        <button
          class="px-3 py-1 text-sm bg-gray-200 text-black rounded"
          @click="$emit('close')"
        >
          キャンセル
        </button>

        <button
          class="px-3 py-1 text-sm bg-[#d5c5a9] text-black rounded font-bold"
          @click="$emit('save')"
        >
          保存
        </button>
      </div>
    </div>
  </div>
</template>
