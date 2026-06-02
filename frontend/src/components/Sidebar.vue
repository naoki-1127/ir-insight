<script setup lang="ts">
defineProps<{
  companies: { id: string; name: string }[];
  selectedCompanyId: string | null;
}>();

const emit = defineEmits(["select", "upload"]);

const selectCompany = (id: string) => {
  emit("select", id);
};
</script>

<template>
  <aside class="w-64 bg-[#131313] border-r border-gray-800 p-6">
    <div class="text-[#d5c5a9] font-bold mb-6">Library</div>

    <nav class="space-y-2 text-sm">
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

    <button
      class="mt-8 w-full bg-[#d5c5a9] text-black py-2 rounded text-xs font-bold"
      @click="$emit('upload')"
    >
      企業検索
    </button>
  </aside>
</template>
