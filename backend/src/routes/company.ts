import { Router } from "express";
import { searchCompanies } from "../services/company.service";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { enqueue8KJobs } from "../services/earnings.service.js";
import { earningsQueue } from "../queues/earningsQueue.js";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";

const router = Router();
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

router.get("/search", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (!q) return res.json([]);
  const results = await searchCompanies(q);
  res.json(results);
});

// POST /api/companies
router.post("/", authMiddleware, async (req, res) => {
  const { cik, ticker, name } = req.body;
  if (!cik || !ticker || !name) {
    return res.status(400).json({ error: "cik, ticker, name は必須です" });
  }

  // Companyテーブルに登録（既存の場合はスキップ）
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

  // バックグラウンドで8-Kジョブを積む（awaitしない）
  enqueue8KJobs(cik).catch((e) =>
    console.error(`[enqueue] failed: ${e.message}`),
  );

  res.json({ company });
});

router.delete("/:id", authMiddleware, async (req: AuthRequest, res: any) => {
  const { id } = req.params;
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

  if (document.count === 0) return res.status(404).json({ error: "Not found" });
  res.json({ success: true });
});

router.post("/check-all", async (req, res) => {
  const companies = await prisma.company.findMany();
  console.log(`[check-all] checking ${companies.length} companies`);

  let enqueued = 0;

  for (const company of companies) {
    try {
      const secRes = await fetch(
        `https://data.sec.gov/submissions/${company.id}.json`,
      );
      if (!secRes.ok) continue;
      const data = await secRes.json();
      const recent = data.filings.recent;

      // item 2.02 の8-Kを直近1件だけ取得
      let latestFiling = null;
      for (let i = 0; i < recent.form.length; i++) {
        if (recent.form[i] === "8-K" && recent.items[i]?.includes("2.02")) {
          latestFiling = {
            accessionNumber: recent.accessionNumber[i],
            filingDate: recent.filingDate[i],
            primaryDocument: recent.primaryDocument[i],
          };
          break; // 最初に見つかったもの（=直近）だけ使う
        }
      }

      if (!latestFiling) continue;

      // DBに既存かチェック
      const exists = await prisma.document.findFirst({
        where: { title: latestFiling.accessionNumber },
      });
      if (exists) {
        console.log(
          `[check-all] skip: ${company.ticker} ${latestFiling.accessionNumber}`,
        );
        continue;
      }

      // 新着をキューに積む
      await earningsQueue.add("process-8k", {
        cik: company.id,
        ticker: company.ticker,
        ...latestFiling,
      });

      enqueued++;
      console.log(
        `[check-all] enqueued: ${company.ticker} ${latestFiling.accessionNumber}`,
      );
    } catch (e: any) {
      console.error(`[check-all] error: ${company.ticker} ${e.message}`);
    }
  }

  res.json({ checked: companies.length, enqueued });
});

export default router;
