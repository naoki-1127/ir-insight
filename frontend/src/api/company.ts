import api from "./axios";
import type { CompanyId } from "../types/branded";
import type { Company } from "../types/company";

export async function deleteCompanyData(companyId: CompanyId): Promise<null> {
  await api.delete(`/api/companies/${companyId}`);
  return null;
}

export async function restoreCompanyData(companyId: CompanyId): Promise<null> {
  await api.post(`/api/companies/${companyId}/restore`);
  return null;
}

export async function getArchivedCompanies(): Promise<Company[]> {
  const res = await api.get("/ir/companies/archived");
  return res.data;
}
