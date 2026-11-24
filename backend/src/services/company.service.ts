import { redis } from "../lib/redis.js";
import { prisma } from "../lib/prisma.js";
import type { CompanyId } from "../types/branded.js";
import { asCompanyId } from "../types/branded.js";
import type { Principal } from "../types/principal.js";
import { enqueue8KJobs } from "./earnings.service.js";

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

  // ティッカー完全一致は件数上限で切られないよう先頭に出す
  const exact = entries.filter((e) => e.ticker === q);
  const partial = entries.filter(
    (e) =>
      e.ticker !== q &&
      (e.ticker.startsWith(q) || e.title.toUpperCase().includes(q)),
  );

  return [...exact, ...partial]
    .slice(0, 6)
    .map((e) => ({
      cik: toCik(e.cik_str),
      ticker: e.ticker,
      name: e.title,
    }));
};

const toCik = (cikStr: string | number) =>
  `CIK${String(cikStr).padStart(10, "0")}`;

const documentsInclude = {
  documents: {
    orderBy: [{ fiscalYear: "desc" as const }, { quarter: "desc" as const }],
    include: { financials: true },
  },
};

// 銘柄をウォッチに登録する（ADR 0001）。
// - ticker は EDGAR の企業一覧で解決し、実在する銘柄だけをマスタに入れる
// - Company の列は EDGAR の値だけで埋め、利用者の入力は使わない
// - マスタになければ追加し（遅延登録）、ウォッチを追加する。アーカイブ済みなら復元する
// マスタに新しく追加した銘柄だけ初回取得ジョブを投入する（既存の銘柄は取得・要約済み）
export const registerCompany = async (
  { userId }: Principal,
  ticker: string,
): Promise<{ company: RegisteredCompany; isNew: boolean }> => {
  const entries = await fetchTickerMap();
  const entry = entries.find((e) => e.ticker === ticker.toUpperCase());
  if (!entry) {
    throw new NotFoundError(`EDGAR に存在しない ticker です: ${ticker}`);
  }
  const cik = toCik(entry.cik_str);

  const { company, isNew } = await prisma.$transaction(async (tx) => {
    const existing = await tx.company.findUnique({ where: { cik } });
    // 同時登録で create が衝突しても cik の一意制約で重複はしない（片方がエラーになる）
    const company =
      existing ??
      (await tx.company.create({
        data: { cik, ticker: entry.ticker, name: entry.title, market: "US" },
      }));
    await tx.watchlist.upsert({
      where: { userId_companyId: { userId, companyId: company.id } },
      update: { archivedAt: null },
      create: { userId, companyId: company.id },
    });
    return { company, isNew: !existing };
  });

  if (isNew) {
    enqueue8KJobs(asCompanyId(company.id), company.cik).catch((e) =>
      console.error(`[enqueue] failed: ${e.message}`),
    );
  }

  return {
    company: {
      id: asCompanyId(company.id),
      cik: company.cik,
      ticker: company.ticker,
      name: company.name,
      market: "US",
      createdAt: company.createdAt.toISOString(), // Date → string に変換
    },
    isNew,
  };
};

// ウォッチ中（ギャラリー表示用）の銘柄一覧
export const getCompaniesWithDocument = async ({ userId }: Principal) => {
  return prisma.company.findMany({
    where: { watchlists: { some: { userId, archivedAt: null } } },
    include: documentsInclude,
  });
};

// アーカイブ済み（アーカイブ表示用）の銘柄一覧。アーカイブした日時の新しい順
export const getArchivedCompaniesWithDocument = async ({
  userId,
}: Principal) => {
  const rows = await prisma.watchlist.findMany({
    where: { userId, archivedAt: { not: null } },
    orderBy: { archivedAt: "desc" },
    include: { company: { include: documentsInclude } },
  });
  return rows.map((w) => w.company);
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

// ウォッチをアーカイブする。マスタと取得済みの決算（Document / DocumentContent / Financial）はそのまま残す
export const deleteCompany = ({ userId }: Principal, id: CompanyId) =>
  setArchivedAt(userId, id, new Date());

// アーカイブしたウォッチをギャラリー表示に戻す
export const restoreCompany = ({ userId }: Principal, id: CompanyId) =>
  setArchivedAt(userId, id, null);

const setArchivedAt = async (
  userId: string,
  companyId: CompanyId,
  archivedAt: Date | null,
) => {
  const { count } = await prisma.watchlist.updateMany({
    where: { userId, companyId },
    data: { archivedAt },
  });
  if (count === 0) {
    throw new NotFoundError("Not found");
  }
};

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}
