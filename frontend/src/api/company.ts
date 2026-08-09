import api from "./axios";
import type { CompanyId } from "../types/branded";

export async function deleteCompanyData(companyId: CompanyId): Promise<null> {
  await api.delete(`/api/companies/${companyId}`);
  return null;
}
