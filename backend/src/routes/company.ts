import { Router, Request, Response } from "express";
import { authMiddleware } from "../middleware/auth.js";
import {
  searchCompanies,
  registerCompany,
  deleteCompany,
  NotFoundError,
  type RegisteredCompany,
} from "../services/company.service.js";
import {
  enqueue8KJobs,
  checkAllCompaniesForNew8K,
  type checkNew8k,
} from "../services/earnings.service.js";
import type { CompanyId, DocumentId, FinancialId } from "../types/branded.js";
import { asCompanyId } from "../types/branded.js";

const router = Router();

type SearchQuery = {
  q?: string;
};

type CompanyBase = {
  cik: string;
  name: string;
  ticker: string;
};

type PeriodType = "Q";

type BaseEntity = {
  createdAt: string;
};

type Document = BaseEntity & {
  id: DocumentId;
  title: string;
  fileUrl: string;
  companyId: CompanyId;
  userId: null;
  fiscalYear: number;
  quarter: number;
  periodType: PeriodType;
};

type Financial = BaseEntity & {
  id: FinancialId;
  companyId: CompanyId;
  fiscalYear: number;
  quarter: number;
  periodType: PeriodType;
  revenue: number;
  netIncomeGaap: number;
  netIncomeNonGaap: number;
  documentId: DocumentId;
};

type Company = BaseEntity &
  CompanyBase & {
    id: CompanyId;
    market: "US";
    documents: Document[];
    financials: Financial[];
  };

type CompanyBaseResponse = CompanyBase[] | { error: string };
type DeleteCompanyResponse = { success: true } | { error: string };
type RegisterCompanyResponse =
  | { company: RegisteredCompany }
  | { error: string };
type CheckAllNew8KResponse = checkNew8k | { error: string };

router.get(
  "/search",
  authMiddleware,
  async (
    req: Request<{}, {}, {}, SearchQuery>,
    res: Response<CompanyBaseResponse>,
  ) => {
    const q = (req.query.q ?? "").trim();
    if (!q) return res.json([]);
    try {
      const results = await searchCompanies(q);
      res.json(results);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "検索に失敗しました" });
    }
  },
);

// POST /api/companies
router.post(
  "/",
  authMiddleware,
  async (
    req: Request<{}, {}, CompanyBase>,
    res: Response<RegisterCompanyResponse>,
  ) => {
    const { cik, ticker, name } = req.body;
    if (!cik || !ticker || !name) {
      return res.status(400).json({ error: "cik, ticker, name は必須です" });
    }
    const company = await registerCompany(cik, ticker, name);
    enqueue8KJobs(company.id, cik).catch((e) =>
      console.error(`[enqueue] failed: ${e.message}`),
    );
    res.json({ company });
  },
);

router.delete(
  "/:id",
  authMiddleware,
  async (
    req: Request<{ id: string }>,
    res: Response<DeleteCompanyResponse>,
  ) => {
    try {
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ error: "idが指定されていません" });
      }
      const companyId = asCompanyId(id);
      await deleteCompany(companyId);
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

// バッチ処理(cron)専用エンドポイント。ユーザー認証ではなく、
// BATCH_SECRETによる共有シークレット認証を行う
router.post(
  "/check-all",
  async (req: Request, res: Response<CheckAllNew8KResponse>) => {
    try {
      const secret = process.env.BATCH_SECRET;
      if (!secret || req.headers["x-batch-secret"] !== secret) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const result = await checkAllCompaniesForNew8K();
      res.json(result);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "サーバーエラー" });
    }
  },
);

export default router;
