<script setup lang="ts">
import type { CompanyId } from "../types/branded";
defineProps<{
  companies: { id: CompanyId; name: string }[];
  selectedCompanyId: CompanyId | null;
}>();

const emit = defineEmits(["select", "upload"]);

const selectCompany = (id: CompanyId) => {
  emit("select", id);
};
</script>

<template>
  <aside
    class="w-64 shrink-0 flex flex-col overflow-hidden bg-[#131313] border-r border-gray-800"
  >
    <div class="p-6 pb-0 shrink-0">
      <button
        class="w-full bg-[#d5c5a9] text-black py-2 rounded text-xs font-bold"
        @click="$emit('upload')"
      >
        企業検索
      </button>
    </div>

    <nav class="flex-1 overflow-y-auto p-6 space-y-2 text-sm">
      <div
        v-for="company in companies"
        :key="company.id"
        @click="selectCompany(company.id)"
        class="px-4 py-2 cursor-pointer text-start"
        :class="
          selectedCompanyId === company.id
            ? 'bg-[#1f2020] text-white rounded'
            : 'text-gray-400 hover:text-white'
        "
      >
        {{ company.name }}
      </div>
    </nav>
  </aside>
</template>
