import { redis } from "../lib/redis.js";
import { prisma } from "../lib/prisma.js";

const TICKER_MAP_KEY = "ticker_map";
const TICKER_MAP_TTL = 86400; // 24時間

interface TickerEntry {
  cik_str: number;
  ticker: string;
  title: string;
}

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

export const searchCompanies = async (query: string) => {
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
) => {
  const company = await prisma.company.upsert({
    where: { ticker },
    update: {},
    create: {
      id: cik,
      ticker,
      name,
      market: "US",
    },
  });
  return company;
};
