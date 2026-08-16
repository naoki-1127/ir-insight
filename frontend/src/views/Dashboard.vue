<script setup lang="ts">
import { onMounted, ref } from "vue";
import api from "../api/axios";
import Header from "../components/Header.vue";
import Sidebar from "../components/Sidebar.vue";
import UploadView from "../components/main/UploadView.vue";
import CompanyView from "../components/main/CompanyView.vue";
import DocumentContentView from "../components/main/DocumentContentView.vue";
import type { Company } from "../types/company";
import type { CompanyId, DocumentId } from "../types/branded";
import { deleteCompanyData } from "../api/company.ts";

onMounted(() => {
  getCompanies();
});

type ViewMode = "upload" | "company" | "document";

const currentView = ref<ViewMode>("upload");
const selectedCompanyId = ref<CompanyId | null>(null);
const selectCompany = (id: CompanyId) => {
  selectedCompanyId.value = id;
  currentView.value = "company";
};
const companies = ref<Company[]>([]);
const document = ref<any>(null);
const file = ref<File | null>(null);

const openUpload = () => {
  file.value = null;
  selectedCompanyId.value = null;
  currentView.value = "upload";
};

const deleteCompany = async (companyId: CompanyId) => {
  if (!companyId) return;
  try {
    await deleteCompanyData(companyId);
  } catch (err: any) {
    console.error(err);
    // 必要なら alert やトースト
  }
  await getCompanies(); // 一覧を再取得
  selectedCompanyId.value = null;
  currentView.value = "upload";
};

const getDocumentContent = async (documentId: DocumentId) => {
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
  } catch (err: any) {
    console.error("企業一覧の取得に失敗しました:", err);
  }
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
