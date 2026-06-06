<script setup lang="ts">
import CompanySearch from "../CompanySearch.vue";

interface Company {
  cik: string;
  ticker: string;
  name: string;
}

const emit = defineEmits(["companySelected", "upload"]);

const handleCompanySelected = (company: Company) => {
  emit("companySelected", company);
};
</script>

<template>
  <div class="w-full min-h-full flex items-center justify-center">
    <div class="w-full max-w-3xl">
      <h2 class="text-3xl font-bold mb-2 text-center">決算データを取得</h2>
      <p class="text-gray-400 mb-8 text-center text-sm">
        銘柄を検索して決算データを取得します
      </p>

      <CompanySearch @selected="handleCompanySelected" />
    </div>
  </div>
</template>
