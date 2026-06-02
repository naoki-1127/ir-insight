import { Worker } from "bullmq";
import { get8KPressReleaseHtml } from "../services/edgar.service";
import { summarizeIR } from "../services/ai.service.js";
import * as cheerio from "cheerio";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

const connection = {
  host: process.env.REDIS_HOST ?? "localhost",
  port: Number(process.env.REDIS_PORT ?? 6379),
};

export const earningsWorker = new Worker(
  "earnings",
  async (job) => {
    const { cik, accessionNumber, filingDate, primaryDocument } = job.data;

    console.log(`[worker] processing: ${accessionNumber}`);

    // 既存チェック（重複スキップ）
    const exists = await prisma.financial.findFirst({
      where: {
        company: { id: cik },
        document: { title: accessionNumber },
      },
    });
    if (exists) {
      console.log(`[worker] skip (already exists): ${accessionNumber}`);
      return;
    }

    // HTML取得 → テキスト抽出
    const { ex991Html, ex991Url } = await get8KPressReleaseHtml(
      cik,
      accessionNumber,
      primaryDocument,
    );
    const $ = cheerio.load(ex991Html);
    const text = $("body").text().replace(/\s+/g, " ").trim();

    // OpenAI解析
    const summary = await summarizeIR(text);
    console.log("unko");
    console.log(summary);
    const [fyPart, qPart] = summary.fiscal_period?.split(" ") ?? [];
    const fiscalYear = Number(fyPart.replace("FY", ""));
    const quarter = Number(qPart.replace("Q", ""));
    // DB保存
    const company = await prisma.company.findFirst({
      where: { id: cik },
    });
    if (!company) throw new Error(`Company not found: ${cik}`);

    const document = await prisma.document.create({
      data: {
        title: accessionNumber,
        fileUrl: ex991Url,
        companyId: company.id,
        fiscalYear: fiscalYear,
        quarter: quarter,
        periodType: "Q",
      },
    });

    await prisma.documentContent.create({
      data: {
        documentId: document.id,
        contentEn: text,
        orderIndex: 0,
      },
    });

    await prisma.financial.create({
      data: {
        companyId: company.id,
        documentId: document.id,
        fiscalYear: fiscalYear,
        fiscalQuarter: quarter,
        periodType: "Q",
        revenue: summary.revenue,
        netIncomeGaap: summary.net_income_gaap,
        netIncomeNonGaap: summary.net_income_non_gaap,
      },
    });

    console.log(`[worker] done: ${accessionNumber}`);
  },
  {
    connection,
    concurrency: 1, // OpenAIのレートリミット対策で直列処理
  },
);

earningsWorker.on("failed", (job, err) => {
  console.error(`[worker] failed: ${job?.id}`, err.message);
});
