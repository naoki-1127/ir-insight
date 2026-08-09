import type { CompanyId } from "./branded";
export type Company = {
  id: CompanyId;
  name: string;
  ticker: string;
  documents: any[];
};

export type RegisterCompany = {
  cik: string;
  name: string;
  ticker: string;
};
