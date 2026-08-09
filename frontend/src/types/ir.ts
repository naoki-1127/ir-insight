export type IRDocument = {
  id: string;
  fiscalYear: number;
  quarter: number;
  financials?: Financial[];
  [key: string]: any;
};

export type Financial = {
  fiscalYear: number;
  fiscalQuarter: number;
  revenue: number;
  [key: string]: any;
};

export type Company = {
  id: string;
  name: string;
  ticker: string;
  documents: IRDocument[];
};

export type IRSummaryItem = {
  text: string;
  sentiment: "positive" | "negative" | "neutral";
};

export type IRSummaryText = {
  driver: string;
  risks: string[];
  summaries: IRSummaryItem[];
  fiscalYear: number;
  quarter: number;
};

// バックエンドのレスポンス全体(成功/失敗)
export type IRSummaryResult =
  | { success: true; data: IRSummaryText }
  | { success: false; error: string };

// localStorageに保存する形
export type CachedIRSummary = {
  companyId: string;
  documentId: string;
  cachedAt: string;
  data: IRSummaryText;
};
