<script setup lang="ts">
import { onMounted, ref } from "vue";
import { ArrowLeft } from "@lucide/vue";
import api from "../api/axios";
import Header from "../components/Header.vue";
import GalleryView from "../components/main/GalleryView.vue";
import ArchiveView from "../components/main/ArchiveView.vue";
import UploadView from "../components/main/UploadView.vue";
import CompanyView from "../components/main/CompanyView.vue";
import DocumentContentView from "../components/main/DocumentContentView.vue";
import type { Company } from "../types/company";
import type { CompanyId, DocumentId } from "../types/branded";
import {
  deleteCompanyData,
  restoreCompanyData,
  getArchivedCompanies,
} from "../api/company.ts";

onMounted(() => {
  getCompanies();
});

type ViewMode = "gallery" | "upload" | "company" | "document" | "archive";

const currentView = ref<ViewMode>("gallery");
const selectedCompanyId = ref<CompanyId | null>(null);
const selectCompany = (id: CompanyId) => {
  selectedCompanyId.value = id;
  currentView.value = "company";
};
const companies = ref<Company[]>([]);
const archivedCompanies = ref<Company[]>([]);
const document = ref<any>(null);
const file = ref<File | null>(null);

const openUpload = () => {
  file.value = null;
  selectedCompanyId.value = null;
  currentView.value = "upload";
};

const backToGallery = () => {
  selectedCompanyId.value = null;
  currentView.value = "gallery";
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
  currentView.value = "gallery";
};

const showArchive = async () => {
  currentView.value = "archive";
  await getArchivedCompaniesList();
};

const restoreCompany = async (companyId: CompanyId) => {
  if (!companyId) return;
  try {
    await restoreCompanyData(companyId);
  } catch (err: any) {
    console.error(err);
    // 必要なら alert やトースト
  }
  await Promise.all([getCompanies(), getArchivedCompaniesList()]);
};

const getArchivedCompaniesList = async () => {
  try {
    archivedCompanies.value = await getArchivedCompanies();
  } catch (err: any) {
    console.error("アーカイブ一覧の取得に失敗しました:", err);
  }
};

const getDocumentContent = async (documentId: DocumentId) => {
  if (!documentId) return;
  try {
    const res = await api.get(`/ir/detail/${documentId}`);
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
    <!-- Main Content -->
    <main class="flex-1 min-h-0 overflow-y-auto p-6">
      <button
        v-if="currentView !== 'gallery'"
        type="button"
        class="flex items-center gap-1 text-xs text-gray-400 hover:text-white mb-4"
        @click="backToGallery"
      >
        <ArrowLeft class="w-4 h-4" />
        ギャラリーに戻る
      </button>

      <GalleryView
        v-if="currentView === 'gallery'"
        :companies="companies"
        @select="selectCompany"
        @upload="openUpload"
        @delete-company="deleteCompany"
        @show-archive="showArchive"
      />
      <ArchiveView
        v-else-if="currentView === 'archive'"
        :companies="archivedCompanies"
        @restore-company="restoreCompany"
      />
      <UploadView
        v-else-if="currentView === 'upload'"
        @company-selected="getCompanies"
      />
      <CompanyView
        v-else-if="currentView === 'company' && selectedCompanyId"
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
</template>
