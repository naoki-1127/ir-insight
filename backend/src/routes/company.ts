import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { Request } from "express";
import {
  searchCompanies,
  registerCompany,
  deleteCompany,
  NotFoundError,
} from "../services/company.service.js";
import {
  enqueue8KJobs,
  checkAllCompaniesForNew8K,
} from "../services/earnings.service.js";

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
  const company = await registerCompany(cik, ticker, name);
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
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ success: false });
      }
      await deleteCompany(id);
      res.json({ success: true });
    } catch (err) {
      if (err instanceof NotFoundError) {
        return res.status(404).json({ error: err.message });
      }
      console.error(err);
      res.status(500).json({ error: "サーバーエラー" });
    }
  },
);

router.post("/check-all", async (_req, res) => {
  try {
    const result = await checkAllCompaniesForNew8K();
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "サーバーエラー" });
  }
});

export default router;
