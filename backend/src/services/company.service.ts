import { redis } from "../lib/redis.js";
import { prisma } from "../lib/prisma.js";
import type { CompanyId } from "../types/branded.js";
import { asCompanyId } from "../types/branded.js";

const TICKER_MAP_KEY = "ticker_map";
const TICKER_MAP_TTL = 86400; // 24時間

type TickerEntry = {
  cik_str: string;
  ticker: string;
  title: string;
};
type Company = {
  cik: string;
  name: string;
  ticker: string;
};
export type RegisteredCompany = {
  id: CompanyId;
  cik: string;
  ticker: string;
  name: string;
  market: "US";
  createdAt: string;
};

const fetchTickerMap = async (): Promise<TickerEntry[]> => {
  const cached = await redis.get(TICKER_MAP_KEY);
  if (cached) return JSON.parse(cached);

  const res = await fetch("https://www.sec.gov/files/company_tickers.json");
  if (!res.ok) throw new Error(`SEC API ${res.status}`);
  const data = await res.json();
  const entries = Object.values(data) as TickerEntry[];

  await redis.set(
    TICKER_MAP_KEY,
    JSON.stringify(entries),
    "EX",
    TICKER_MAP_TTL,
  );
  return entries;
};

export const searchCompanies = async (query: string): Promise<Company[]> => {
  const entries = await fetchTickerMap();
  const q = query.toUpperCase();

  return entries
    .filter((e) => e.ticker.startsWith(q) || e.title.toUpperCase().includes(q))
    .slice(0, 6)
    .map((e) => ({
      cik: `CIK${String(e.cik_str).padStart(10, "0")}`,
      ticker: e.ticker,
      name: e.title,
    }));
};

// Companyテーブルに登録（既存の場合はスキップ）
export const registerCompany = async (
  cik: string,
  ticker: string,
  name: string,
): Promise<RegisteredCompany> => {
  const company = await prisma.company.upsert({
    where: { ticker },
    // 過去に論理削除された銘柄を再登録した場合は復元する
    update: { deletedAt: null },
    create: {
      cik: cik,
      ticker,
      name,
      market: "US",
    },
  });
  return {
    id: asCompanyId(company.id),
    cik: company.cik,
    ticker: company.ticker,
    name: company.name,
    market: "US",
    createdAt: company.createdAt.toISOString(), // Date → string に変換
  };
};

// 未削除（ギャラリー表示用）の銘柄一覧
export const getCompaniesWithDocument = async () => {
  try {
    const data = await prisma.company.findMany({
      where: { deletedAt: null },
      include: {
        documents: {
          orderBy: [
            {
              fiscalYear: "desc",
            },
            {
              quarter: "desc",
            },
          ],
          include: {
            financials: true,
          },
        },
      },
    });
    return data;
  } catch (err) {
    console.log(err);
  }
};

// 論理削除済み（アーカイブ表示用）の銘柄一覧
export const getArchivedCompaniesWithDocument = async () => {
  try {
    const data = await prisma.company.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
      include: {
        documents: {
          orderBy: [
            {
              fiscalYear: "desc",
            },
            {
              quarter: "desc",
            },
          ],
          include: {
            financials: true,
          },
        },
      },
    });
    return data;
  } catch (err) {
    console.log(err);
  }
};

export const getLatestFilingMeta = async (ticker: CompanyId) => {
  try {
    const data = await prisma.document.findFirst({
      where: { companyId: ticker },
      orderBy: [
        {
          fiscalYear: "desc",
        },
        {
          quarter: "desc",
        },
      ],
    });
    //console.log("check");
    return data;
  } catch (err) {
    console.log(err);
  }
};

export const getLatestFilingMeta2 = async (ticker: CompanyId) => {
  try {
    const data = await prisma.document.findFirst({
      where: { companyId: ticker },
      orderBy: [
        {
          fiscalYear: "desc",
        },
        {
          quarter: "desc",
        },
      ],
      include: {
        contents: {
          orderBy: {
            orderIndex: "asc",
          },
        },
      },
    });
    return data;
  } catch (err) {
    console.log(err);
  }
};

export const getFinance = async (ticker: CompanyId) => {
  try {
    const data = await prisma.financial.findMany({
      where: { companyId: ticker },
      orderBy: [
        {
          fiscalYear: "asc",
        },
        {
          fiscalQuarter: "asc",
        },
      ],
    });
    return { data: data };
  } catch (err) {
    console.log(err);
  }
};

export const getDocumentContent = async (documentId: string) => {
  try {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: {
        company: true,
        contents: true,
      },
    });
    if (!document) {
      throw new NotFoundError("Not found");
    }
    return document;
  } catch (err) {
    console.log(err);
  }
};

// 物理削除は行わず、deletedAtを立てるだけの論理削除。
// 取得済みの決算（Document / DocumentContent / Financial）はそのまま残す。
export const deleteCompany = async (id: CompanyId) => {
  const company = await prisma.company.findUnique({ where: { id } });
  if (!company) {
    throw new NotFoundError("Not found");
  }
  console.log("削除：", id);
  try {
    const updated = await prisma.company.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return updated;
  } catch (err) {
    console.log(err);
    throw new NotFoundError("Not found");
  }
};

// 論理削除した銘柄をギャラリー表示に戻す
export const restoreCompany = async (id: CompanyId) => {
  const company = await prisma.company.findUnique({ where: { id } });
  if (!company) {
    throw new NotFoundError("Not found");
  }
  try {
    const updated = await prisma.company.update({
      where: { id },
      data: { deletedAt: null },
    });
    return updated;
  } catch (err) {
    console.log(err);
    throw new NotFoundError("Not found");
  }
};
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}
