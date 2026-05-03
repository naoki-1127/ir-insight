<script setup lang="ts">
import { onMounted, ref } from "vue";
import api from "../api/axios";
import Header from "../components/Header.vue";
import Sidebar from "../components/Sidebar.vue";
import UploadView from "../components/main/UploadView.vue";
import PreviewView from "../components/main/PreviewView.vue";
import SummaryModal from "../components/SummaryModal.vue";
import CompanyView from "../components/main/CompanyView.vue";

onMounted(() => {
  getCompanies();
});

type Summary = {
  title: string;
  symbol: string;
  company_name: string;
  fiscal_period: string;
  revenue: number;
  previous_revenue: number;
  net_income_gaap: number;
  previous_net_income_gaap: number;
  net_income_non_gaap: number;
  previous_net_income_non_gaap: number;
};

type dispSummary = {
  dispRevenue: string;
  revenue_yoy: string;
  net_income_yoy: string;
  margin: string;
  gap_ratio: string;
};

type Company = {
  id: string;
  name: string;
  ticker: string;
  documents: any[];
};

type ViewMode = "upload" | "preview" | "company";

const currentView = ref<ViewMode>("upload");
const fileName = ref("");
const fileText = ref("");
const selectedCompanyId = ref("");
const selectCompany = (id: string) => {
  selectedCompanyId.value = id;
  currentView.value = "company";
};
const uploadFileName = ref("");
const summary = ref<Summary | null>(null);
const companies = ref<Company[]>([]);
const file = ref<File | null>(null);
const showDialog = ref(false);
const fileUrl = ref("");
const dispRevenue = ref("");
const openDialog = () => {
  showDialog.value = true;
  summary.value = null;
};
const closeDialog = () => {
  showDialog.value = false;
};

const openUpload = () => {
  file.value = null;
  selectedCompanyId.value = "";
  currentView.value = "upload";
};

const generateSummary = async () => {
  // ここでAPI呼ぶ
  try {
    const res = await api.post("/ir/summary", {
      text: fileText.value,
    });
    summary.value = res.data;
    caluclatedSummary(summary.value);
  } catch (err: any) {
    console.error(err);
  }
};

const saveCompanyandIR = async (summary: any, fileName: string) => {
  // ここでAPI呼ぶ
  console.log("保存");
  try {
    await api.post("/ir/company", {
      ...summary,
      fileName,
    });
  } catch (err: any) {
    console.error(err);
  }
  getCompanies();
  file.value = null;
  showDialog.value = false;
  summary.value = null;
  selectedCompanyId.value = "";
  currentView.value = "upload";
};

const getCompanies = async () => {
  try {
    const res = await api.get("/ir/companies");
    companies.value = res.data;
  } catch (err: any) {}
};

const handleFile = async (event: Event) => {
  const input = event.target as HTMLInputElement;

  if (!input.files || input.files.length === 0) return;

  if (input.files.length > 1) {
    alert("ファイルは1つだけ選択してください");
    input.value = "";
    return;
  }

  const selectedFile = input.files[0];

  if (selectedFile.type !== "application/pdf") {
    alert("PDFのみアップロード可能");
    input.value = "";
    return;
  }

  file.value = selectedFile;
  fileName.value = selectedFile.name;

  const formData = new FormData();
  formData.append("file", selectedFile);

  try {
    const res = await api.post("/ir", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    fileName.value = res.data.file.originalname;
    fileText.value = res.data.text;
    uploadFileName.value = res.data.file.path;
    currentView.value = "preview";
  } catch (err: any) {}
};
const handleUrl = async (url: string) => {
  try {
    const res = await api.post("/ir", {
      url,
    });
    fileUrl.value = url;
    fileName.value = res.data.fileName; // URLなので自前で作る
    fileText.value = res.data.text;
    uploadFileName.value = res.data.file.path;
    currentView.value = "preview";
  } catch (err: any) {
    console.error(err);
  }
};
const caluclatedSummary = (summary: Summary | null): dispSummary => {
  try {
    if (summary.revenue >= 1000000000) {
      dispRevenue.value = (summary.revenue / 1000000000).toFixed(2) + "B";
    }
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
        <UploadView
          v-if="currentView === 'upload'"
          @fileSelected="handleFile"
          @urlSubmitted="handleUrl"
        />
        <PreviewView
          v-else-if="currentView === 'preview'"
          :file-url="fileUrl"
          :file-name="fileName"
          @generate="openDialog"
        />
        <CompanyView
          v-else-if="currentView === 'company'"
          :company-id="selectedCompanyId"
          :companies="companies"
        />
        <SummaryModal
          :show="showDialog"
          :summary="summary"
          @close="closeDialog"
          @generate="generateSummary"
          @save="() => saveCompanyandIR(summary, uploadFileName)"
        />
      </main>
    </div>
  </div>
</template>
