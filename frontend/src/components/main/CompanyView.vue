<script setup lang="ts">
import { computed, watch, ref } from "vue";
import api from "../../api/axios";

type Company = {
  id: string;
  name: string;
  ticker: string;
  documents: any[];
};
type Summary = {
  driver: string;
  risks: string[];
  summaries: any[];
  fiscalYear: number;
  quarter: number;
};

const summaryText = ref<Summary | null>(null);

const props = defineProps<{
  companyId: string;
  companies: Company[];
}>();
const company = computed(() =>
  props.companies.find((c) => c.id === props.companyId),
);

const groupedDocuments = computed(() => {
  if (!company.value) return {};

  const grouped = company.value.documents.reduce((acc: any, doc: any) => {
    if (!acc[doc.fiscalYear]) acc[doc.fiscalYear] = [];
    acc[doc.fiscalYear].push(doc);
    return acc;
  }, {});

  // 親（年）→ 子（四半期）の順でソート
  const sorted = Object.entries(grouped)
    .sort(([a], [b]) => Number(b) - Number(a)) // 年降順
    .map(([year, docs]: any) => [
      year,
      docs.sort((a: any, b: any) => b.quarter - a.quarter), // 四半期降順
    ]);
  console.log(Object.fromEntries(sorted));
  return Object.fromEntries(sorted);
});
let currentRequestId = 0;
watch(
  () => props.companyId,
  async (newId) => {
    if (!newId) return;
    const requestId = ++currentRequestId;
    summaryText.value = null;
    const res = await api.get(`/ir/summary/${newId}/text`);
    if (requestId === currentRequestId) {
      summaryText.value = res.data;
    }
  },
  { immediate: true },
);
</script>

<template>
  <div class="w-full h-full flex flex-col gap-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div class="flex flex-col">
        <h1 class="text-2xl font-bold">
          {{ company?.name }}
        </h1>
        <p class="text-sm text-start">ticker:{{ company?.ticker }}</p>
      </div>

      <!-- スコア -->
      <div class="flex gap-4">
        <div class="bg-[#1f2020] p-4 rounded w-64 text-center">
          <p class="text-xs font-bold text-start">Growth Score</p>
          <p class="text-2xl text-green-400 font-bold">82</p>
        </div>
        <div class="bg-[#1f2020] p-4 rounded w-72 text-center">
          <p class="text-xs font-bold text-start">詳細分析</p>
          <p class="text-2xl text-green-400 font-bold">82</p>
        </div>
      </div>
    </div>

    <!-- KPI -->
    <div class="grid grid-cols-5 gap-4">
      <div class="bg-[#1f2020] p-4 rounded">
        <p class="text-xs text-gray-400 text-start">売上収益（直近四半期）</p>
        <p class="text-lg font-bold text-start">$2.15B</p>
        <p class="text-green-400 text-xs text-start">+25% YoY</p>
      </div>

      <div class="bg-[#1f2020] p-4 rounded">
        <p class="text-xs text-gray-400 text-start">ガイダンス（次四半期）</p>
        <p class="text-green-400 text-lg font-bold text-start">上方修正</p>
      </div>

      <div class="bg-[#1f2020] p-4 rounded">
        <p class="text-xs text-gray-400 text-start">粗利率（直近四半期）</p>
        <p class="text-lg font-bold text-start">72%</p>
      </div>

      <div class="bg-[#1f2020] p-4 rounded">
        <p class="text-xs text-gray-400 text-start">フリーキャッシュフロー</p>
        <p class="text-lg font-bold text-start">$1.55B</p>
      </div>

      <div class="bg-[#1f2020] p-4 rounded">
        <p class="text-xs text-gray-400 text-start">営業利益率（直近四半期）</p>
        <p class="text-lg font-bold text-start">20%</p>
      </div>
    </div>

    <!-- 中段 -->
    <div class="grid grid-cols-9 gap-4">
      <!-- トレンド -->
      <div class="col-span-5 bg-[#1f2020] p-4 rounded">
        <p class="text-sm font-bold mb-4 text-start">
          売上成長率のトレンド (YoY)
        </p>
        <div class="flex items-end gap-4 h-40">
          <div v-for="n in 8" :key="n" class="flex flex-col items-center">
            <div
              class="w-6 bg-green-400"
              :style="{ height: `${20 + n * 10}px` }"
            ></div>
            <p class="text-xs text-gray-400 mt-1">Q{{ n }}</p>
          </div>
        </div>
      </div>

      <!-- ハイライト -->
      <div class="bg-[#1f2020] p-4 rounded col-span-4">
        <p class="text-sm font-bold mb-2 text-start">
          直近IRのハイライト<span v-if="summaryText" class="text-xs"
            >(FY{{ summaryText.fiscalYear }} Q{{ summaryText.quarter }})</span
          >
        </p>
        <ul v-if="summaryText" class="text-xs space-y-1 text-left">
          <li v-for="(summary, index) in summaryText.summaries" :key="index">
            {{ summary.text }}
          </li>
        </ul>
      </div>
    </div>

    <!-- 下段 -->
    <div class="grid grid-cols-5 gap-4">
      <!-- ドキュメント -->
      <div class="bg-[#1f2020] p-4 rounded col-span-3">
        <p class="text-sm font-bold mb-2 text-start">ドキュメント一覧</p>

        <div
          v-for="(docs, year) in groupedDocuments"
          :key="year"
          class="flex items-start gap-4 mb-4"
        >
          <div class="w-20 text-gray-400 font-bold">FY{{ year }}</div>

          <div class="grid grid-cols-4 gap-4 flex-1">
            <div
              v-for="doc in docs"
              :key="doc.id"
              class="bg-[#36393b] p-3 rounded"
            >
              <p class="text-xs font-bold">
                {{ year }}年度　第{{ doc.quarter }}四半期決算発表
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- リスク -->
      <div class="bg-[#1f2020] p-4 rounded col-span-2">
        <p class="text-sm font-bold mb-2 text-start">
          注目すべきリスク・懸念事項
        </p>
        <ul
          v-if="summaryText"
          class="text-xs text-yellow-400 space-y-1 text-start"
        >
          <li v-for="(risk, index) in summaryText.risks" :key="index">
            <span>⚠ </span>{{ risk }}
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
