import { Router } from "express";
import { searchCompanies } from "../services/company.service";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { enqueue8KJobs } from "../services/earnings.service.js";
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

export default router;
