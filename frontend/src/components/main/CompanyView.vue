<script setup lang="ts">
import { computed } from "vue";
type Company = {
  id: string;
  name: string;
  documents: any[];
};

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
    if (!acc[doc.fiscalYear]) {
      acc[doc.fiscalYear] = [];
    }
    acc[doc.fiscalYear].push(doc);
    return acc;
  }, {});

  return grouped;
});
</script>

<template>
  <div class="w-full h-full flex flex-col gap-4">
    <div
      v-for="(docs, year) in groupedDocuments"
      :key="year"
      class="flex items-center gap-4"
    >
      <!-- 年 -->
      <div class="w-20 text-gray-400 font-bold">FY{{ year }}</div>

      <!-- 横並び -->
      <div class="grid grid-cols-4 gap-4 flex-1">
        <div v-for="doc in docs" :key="doc.id" class="bg-[#1f2020] p-4 rounded">
          <p class="text-sm text-white font-bold mb-2">
            {{ doc.title }}
          </p>
          <p class="text-xs text-gray-400">Q{{ doc.quarter }}</p>
        </div>
      </div>
    </div>
  </div>
</template>
