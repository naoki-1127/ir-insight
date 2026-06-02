<script setup lang="ts">
import { onMounted, ref } from "vue";
import api from "../api/axios";
import Header from "../components/Header.vue";
import Sidebar from "../components/Sidebar.vue";
import UploadView from "../components/main/UploadView.vue";
import CompanyView from "../components/main/CompanyView.vue";

onMounted(() => {
  getCompanies();
});

type Company = {
  id: string;
  name: string;
  ticker: string;
  documents: any[];
};

type ViewMode = "upload" | "company";

const currentView = ref<ViewMode>("upload");
const selectedCompanyId = ref("");
const selectCompany = (id: string) => {
  selectedCompanyId.value = id;
  currentView.value = "company";
};
const companies = ref<Company[]>([]);
const file = ref<File | null>(null);

const openUpload = () => {
  file.value = null;
  selectedCompanyId.value = "";
  currentView.value = "upload";
};

const getCompanies = async () => {
  try {
    const res = await api.get("/ir/companies");
    companies.value = res.data;
  } catch (err: any) {}
};
</script>

<template>
  <div class="min-h-screen flex flex-col bg-[#0e0e0e] text-gray-200">
    <!-- Header -->
    <Header />
    <!-- Main Layout -->
    <div class="flex flex-1">
      <!-- Sidebar -->
      <Sidebar
        :companies="companies"
        :selectedCompanyId="selectedCompanyId"
        @select="selectCompany"
        @upload="openUpload"
      />
      <!-- Main Content -->
      <main class="flex-1 flex p-6">
        <UploadView v-if="currentView === 'upload'" />
        <CompanyView
          v-else-if="currentView === 'company'"
          :company-id="selectedCompanyId"
          :companies="companies"
        />
      </main>
    </div>
  </div>
</template>
