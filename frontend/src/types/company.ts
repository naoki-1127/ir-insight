export type Company = {
  id: string;
  name: string;
  ticker: string;
  documents: any[];
};

export type RegisterCompany = {
  cik: string;
  name: string;
  ticker: string;
};
