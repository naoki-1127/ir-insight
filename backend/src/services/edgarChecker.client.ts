// edgar-checker(Go)サービスのHTTPクライアント。
// EDGARへの逐次アクセスをNode側でawaitループしないための窓口で、
// 企業リストをまとめて渡すと、各社の最新8-K(Item 2.02)を並行取得して返してくれる。

export type EdgarCheckerRequest = {
  companyId: string;
  cik: string;
  ticker: string;
};

export type LatestFiling = {
  accessionNumber: string;
  filingDate: string;
  primaryDocument: string;
};

export type EdgarCheckerResult = {
  companyId: string;
  cik: string;
  ticker: string;
  latestFiling: LatestFiling | null;
  error?: string;
};

const EDGAR_CHECKER_URL =
  process.env.EDGAR_CHECKER_URL ?? "http://edgar-checker:8080";

export const checkLatestFilings = async (
  companies: EdgarCheckerRequest[],
): Promise<EdgarCheckerResult[]> => {
  const res = await fetch(`${EDGAR_CHECKER_URL}/check-latest-8k`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(companies),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`edgar-checker ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
};
