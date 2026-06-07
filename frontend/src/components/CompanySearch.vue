<script setup lang="ts">
import { ref } from "vue";
import api from "../api/axios";

interface Company {
  cik: string;
  ticker: string;
  name: string;
}

const emit = defineEmits<{
  selected: [company: Company];
}>();

const query = ref("");
const results = ref<Company[]>([]);
const selected = ref<Company | null>(null);
const loading = ref(false);
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

const handleInput = () => {
  if (debounceTimer) clearTimeout(debounceTimer);
  if (query.value.length < 1) {
    results.value = [];
    return;
  }
  debounceTimer = setTimeout(() => search(), 300);
};

const search = async () => {
  loading.value = true;
  try {
    const res = await api.get(
      `/api/companies/search?q=${encodeURIComponent(query.value)}`,
    );
    results.value = res.data;
  } catch (e) {
    results.value = [];
  } finally {
    loading.value = false;
  }
};

const select = (company: Company) => {
  selected.value = company;
  results.value = [];
  query.value = "";
};

const clear = () => {
  selected.value = null;
};

const handleAdd = async () => {
  if (!selected.value) return;

  loading.value = true;
  try {
    const res = await api.post("/api/companies", selected.value, {
      headers: { "Content-Type": "application/json" },
    });

    if (!res.status) throw new Error("登録に失敗しました");
    emit("selected", selected.value);
    clear();
  } catch (e) {
    alert("登録に失敗しました");
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="w-full">
    <!-- 検索インプット -->
    <div class="relative mb-2">
      <i
        class="ti ti-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg"
      />
      <input
        v-model="query"
        type="text"
        placeholder="例: NVIDIA / NVDA"
        class="w-full pl-11 pr-10 py-3 rounded-xl bg-gray-800 border border-gray-600 focus:outline-none focus:border-[#d5c5a9] text-sm"
        @input="handleInput"
      />
      <i
        v-if="loading"
        class="ti ti-loader-2 absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg animate-spin"
      />
    </div>

    <!-- 候補ドロップダウン -->
    <div
      v-if="results.length > 0"
      class="bg-gray-800 border border-gray-600 rounded-xl overflow-hidden mb-4"
    >
      <div
        v-for="company in results"
        :key="company.cik"
        class="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-700 border-b border-gray-700 last:border-b-0 transition"
        @click="select(company)"
      >
        <span
          class="text-xs font-medium px-2 py-1 rounded-md bg-blue-900 text-blue-300 shrink-0"
        >
          {{ company.ticker }}
        </span>
        <span class="text-sm truncate">{{ company.name }}</span>
      </div>
    </div>

    <!-- 選択済みカード -->
    <div
      v-if="selected"
      class="flex items-center justify-between bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 mb-4"
    >
      <div class="flex items-center gap-3">
        <div
          class="w-10 h-10 rounded-full bg-blue-900 flex items-center justify-center text-blue-300 text-xs font-medium shrink-0"
        >
          {{ selected.ticker.slice(0, 4) }}
        </div>
        <div>
          <p class="text-sm font-medium">{{ selected.name }}</p>
          <p class="text-xs text-gray-400">{{ selected.ticker }}</p>
        </div>
      </div>
      <button class="text-gray-400 hover:text-white transition" @click="clear">
        <i class="ti ti-x text-lg" />
      </button>
    </div>

    <!-- 追加ボタン -->
    <button
      :disabled="!selected || loading"
      class="w-full py-3 rounded-xl text-sm font-medium transition"
      :class="
        selected && !loading
          ? 'bg-[#d5c5a9] text-black hover:opacity-90'
          : 'bg-gray-700 text-gray-500 cursor-not-allowed'
      "
      @click="handleAdd"
    >
      <i v-if="loading" class="ti ti-loader-2 mr-1 animate-spin" />
      <i v-else class="ti ti-plus mr-1" />
      {{ loading ? "登録中..." : "ウォッチリストに追加" }}
    </button>
  </div>
</template>
