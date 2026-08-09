import { Worker } from "bullmq";
import { get8KPressReleaseHtml } from "../services/edgar.service.js";
import { summarizeIR } from "../services/ai.service.js";
import * as cheerio from "cheerio";
import { prisma } from "../lib/prisma.js";
import { redis } from "../lib/redis.js";

export const earningsWorker = new Worker(
  "earnings",
  async (job) => {
    const { companyId, cik, accessionNumber } = job.data;
    console.log(`[worker] processing: ${accessionNumber}`);

    // 既存チェック（重複スキップ）
    const exists = await prisma.financial.findFirst({
      where: {
        company: { id: companyId },
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
    );
    const $ = cheerio.load(ex991Html);
    const textForAI = $("body").text().replace(/\s+/g, " ").trim();
    const bodyHtml = $("body").html() ?? "";

    // OpenAI解析
    const summary = await summarizeIR(textForAI);
    console.log("サマリー", summary);
    if (!summary.success) {
      console.error(summary.error);
      return;
    }
    const [fyPart, qPart] = summary.data.fiscal_period?.split(" ") ?? [];
    const fiscalYear = Number(fyPart.replace("FY", ""));
    const quarter = Number(qPart.replace("Q", ""));
    // DB保存
    const company = await prisma.company.findFirst({
      where: { id: companyId },
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
        contentEn: bodyHtml,
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
        revenue: summary.data.revenue,
        netIncomeGaap: summary.data.net_income_gaap,
        netIncomeNonGaap: summary.data.net_income_non_gaap,
      },
    });

    console.log(`[worker] done: ${accessionNumber}`);
  },
  {
    connection: redis,
    concurrency: 1, // OpenAIのレートリミット対策で直列処理
  },
);

earningsWorker.on("failed", (job: any, err: any) => {
  console.error(`[worker] failed: ${job?.id}`, err.message);
});
