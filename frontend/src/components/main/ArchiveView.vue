<script setup lang="ts">
import { computed, ref } from "vue";
import { Building2, FileText, ArchiveRestore, Search } from "@lucide/vue";
import type { Company } from "../../types/company";
import type { CompanyId } from "../../types/branded";

const props = defineProps<{
  companies: Company[];
}>();

const emit = defineEmits<{
  restoreCompany: [id: CompanyId];
}>();

const keyword = ref("");

const filteredCompanies = computed(() => {
  const q = keyword.value.trim().toLowerCase();
  if (!q) return props.companies;
  return props.companies.filter(
    (c) =>
      c.name.toLowerCase().includes(q) || c.ticker.toLowerCase().includes(q),
  );
});

const latestDocLabel = (company: Company) => {
  if (!company.documents || company.documents.length === 0) return null;
  const sorted = [...company.documents].sort((a, b) => {
    if (a.fiscalYear !== b.fiscalYear) return b.fiscalYear - a.fiscalYear;
    return b.quarter - a.quarter;
  });
  const latest = sorted[0];
  return `FY${latest.fiscalYear} Q${latest.quarter}`;
};

const restoreCompany = (event: Event, id: CompanyId) => {
  event.stopPropagation();
  emit("restoreCompany", id);
};
</script>

<template>
  <div class="w-full h-full flex flex-col gap-6">
    <!-- Header -->
    <div class="flex items-center justify-between gap-4">
      <div class="flex flex-col items-start">
        <h1 class="text-2xl font-bold">アーカイブ</h1>
        <p class="text-sm text-gray-400">
          削除済みの銘柄です。取得済みの決算データは保持されています。復元するとギャラリーに再表示されます。
        </p>
      </div>

      <div class="relative w-72 shrink-0">
        <Search
          class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
        />
        <input
          v-model="keyword"
          type="text"
          placeholder="銘柄名・ティッカーで検索"
          class="w-full bg-[#1f2020] text-sm rounded pl-9 pr-3 py-2 text-gray-200 placeholder-gray-500 border border-transparent focus:border-[#d5c5a9] focus:outline-none"
        />
      </div>
    </div>

    <!-- Grid -->
    <div
      class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
    >
      <!-- 銘柄カード -->
      <div
        v-for="company in filteredCompanies"
        :key="company.id"
        class="group relative flex flex-col justify-between h-40 rounded-lg bg-[#1f2020] p-4 text-start border border-transparent opacity-70"
      >
        <button
          type="button"
          class="absolute top-3 right-3 flex items-center gap-1 text-xs text-gray-400 hover:text-[#d5c5a9] transition-colors"
          @click="(e) => restoreCompany(e, company.id)"
        >
          <ArchiveRestore class="w-4 h-4" />
        </button>

        <div class="flex items-start gap-2">
          <div
            class="w-9 h-9 shrink-0 rounded-full bg-[#d5c5a9]/10 flex items-center justify-center"
          >
            <Building2 class="w-4 h-4 text-[#d5c5a9]" />
          </div>
          <div class="min-w-0">
            <p class="text-sm font-bold truncate">{{ company.name }}</p>
            <p class="text-xs text-gray-400">{{ company.ticker }}</p>
          </div>
        </div>

        <div class="flex items-center justify-between text-xs text-gray-400">
          <span class="flex items-center gap-1">
            <FileText class="w-3 h-3" />
            {{ company.documents.length }}件
          </span>
          <span v-if="latestDocLabel(company)" class="text-gray-500">
            {{ latestDocLabel(company) }}
          </span>
        </div>
      </div>
    </div>

    <!-- 空状態 -->
    <div
      v-if="companies.length === 0"
      class="flex-1 flex flex-col items-center justify-center text-center text-gray-400 gap-2"
    >
      <Building2 class="w-8 h-8 text-gray-600" />
      <p class="text-sm">アーカイブされた銘柄はありません</p>
    </div>
  </div>
</template>
