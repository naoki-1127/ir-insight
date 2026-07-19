import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import { Request } from "express";
import {
  searchCompanies,
  registerCompany,
  deleteCompany,
  NotFoundError,
} from "../services/company.service.js";
import { enqueue8KJobs } from "../services/earnings.service.js";
import { earningsQueue } from "../queues/earningsQueue.js";

const router = Router();

router.get("/search", authMiddleware, async (req, res) => {
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
  const company = registerCompany(cik, ticker, name);
  enqueue8KJobs(cik).catch((e) =>
    console.error(`[enqueue] failed: ${e.message}`),
  );
  res.json({ company });
});

router.delete(
  "/:id",
  authMiddleware,
  async (req: Request<{ id: string }>, res: any) => {
    try {
      if (!req.params) {
        res.json({ success: false });
      }
      const { id } = req.params;
      await deleteCompany(id);
      res.json({ success: true });
    } catch (err) {
      if (err instanceof NotFoundError) {
        return res.status(404).json({ error: err.message });
      }
    }
  },
);

router.post("/check-all", async (_req, res) => {
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
