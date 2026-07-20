<script setup lang="ts">
import { onMounted, ref } from "vue";
import api from "../api/axios";
import Header from "../components/Header.vue";
import Sidebar from "../components/Sidebar.vue";
import UploadView from "../components/main/UploadView.vue";
import CompanyView from "../components/main/CompanyView.vue";
import DocumentContentView from "../components/main/DocumentContentView.vue";

onMounted(() => {
  getCompanies();
});

type Company = {
  id: string;
  name: string;
  ticker: string;
  documents: any[];
};

type ViewMode = "upload" | "company" | "document";

const currentView = ref<ViewMode>("upload");
const selectedCompanyId = ref("");
const selectCompany = (id: string) => {
  selectedCompanyId.value = id;
  currentView.value = "company";
};
const companies = ref<Company[]>([]);
const document = ref<any>(null);
const file = ref<File | null>(null);

const openUpload = () => {
  file.value = null;
  console.log("tesr");
  selectedCompanyId.value = "";
  currentView.value = "upload";
};

const deleteCompany = async (companyId: string) => {
  if (!companyId) return;
  try {
    await api.delete(`/api/companies/${companyId}`);
    await getCompanies(); // 一覧を再取得
    selectedCompanyId.value = "";
    currentView.value = "upload";
  } catch (err: any) {
    console.error(err);
    // 必要なら alert やトースト
  }
};

const getDocumentContent = async (documentId: string) => {
  if (!documentId) return;
  try {
    const res = await api.get(`/ir/detail/${documentId}`);
    console.log(res.data);
    document.value = res.data;
    currentView.value = "document";
  } catch (err: any) {
    console.error(err);
  }
};

const getCompanies = async () => {
  try {
    const res = await api.get("/ir/companies");
    companies.value = res.data;
  } catch (err: any) {}
};
</script>

<template>
  <div
    class="overflow-hidden h-screen flex flex-col bg-[#0e0e0e] text-gray-200"
  >
    <!-- Header -->
    <Header class="shrink-0" />
    <!-- Main Layout -->
    <div class="flex flex-1 min-h-0">
      <!-- Sidebar -->
      <Sidebar
        :companies="companies"
        :selectedCompanyId="selectedCompanyId"
        @select="selectCompany"
        @upload="openUpload"
      />
      <!-- Main Content -->
      <main class="flex-1 min-h-0 overflow-y-auto p-6">
        <UploadView
          v-if="currentView === 'upload'"
          @company-selected="getCompanies"
        />
        <CompanyView
          v-else-if="currentView === 'company'"
          :company-id="selectedCompanyId"
          :companies="companies"
          @delete-company="deleteCompany"
          @get-document-content="getDocumentContent"
        />
        <DocumentContentView
          v-else-if="currentView === 'document'"
          :document="document"
          @select="selectCompany"
        />
      </main>
    </div>
  </div>
</template>
