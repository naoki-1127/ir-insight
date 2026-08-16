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
    update: {},
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

export const getCompaniesWithDocument = async () => {
  const data = await prisma.company.findMany({
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
};

export const getLatestFilingMeta = async (ticker: string) => {
  ticker = "fdc2b9c3-fe26-473b-9243-4e9f4fa7a382";
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
  if (!data) {
    return "見つからない";
  }
  return data;
};

export const getDocumentContent = async (documentId: string) => {
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
};

export const deleteCompany = async (id: CompanyId) => {
  const company = await prisma.company.findUnique({ where: { id } });
  if (!company) {
    throw new NotFoundError("Not found");
  }
  const document = await prisma.$transaction([
    prisma.documentContent.deleteMany({
      where: {
        document: {
          companyId: id,
        },
      },
    }),
    prisma.document.deleteMany({
      where: {
        companyId: id,
      },
    }),
    prisma.financial.deleteMany({
      where: {
        companyId: id,
      },
    }),
    prisma.company.delete({
      where: {
        id,
      },
    }),
  ]);
  if (document.count === 0) {
    throw new NotFoundError("Not found");
  }
};
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}
