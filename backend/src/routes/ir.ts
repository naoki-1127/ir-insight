// src/routes/todo.ts
import express from "express";
import multer from "multer";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import fs from "fs/promises";
import path from "path";
import { summarizeIR, summarizeIRText } from "../services/ai.service";
import {
  get8KPressReleaseHtml2,
  get8KPressReleaseHtml,
} from "../services/edgar.service.js";
const router = express.Router();
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

type CreateCompanyReq = {
  ticker: string;
  company_name: string;
  market: string;
  fiscal_period: string;
  fileName: string;
  title: string;
};
type CreateCompanySuccessRes = {
  company: string | null;
  document: string | null;
  financial: string | null;
};
type ErrorResponse = {
  error: string;
};
type CompanyRes = CreateCompanySuccessRes | ErrorResponse;

const prisma = new PrismaClient({ adapter });
const storage = multer.diskStorage({
  destination: async (req: AuthRequest, _file: any, cb: any) => {
    const userId = req.userId; // 認証済み前提
    const dir = path.join(process.cwd(), "uploads", `user_${userId}`);
    // ディレクトリがなければ作成
    await fs.mkdir(dir, { recursive: true });

    cb(null, dir);
  },
  filename: (_req: AuthRequest, file: any, cb: any) => {
    // 重複防止
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

const createCompany = async (input: CreateCompanyReq) => {
  const checkTicker = await prisma.company.findUnique({
    where: { ticker: input.ticker },
  });
  if (!checkTicker) {
    try {
      const company = await prisma.company.create({
        data: {
          name: input.company_name,
          ticker: input.ticker,
          market: "US",
        },
      });
      let { documentId, financialId } = await createDocument(company.id, input);
      return { companyId: company.id, documentId, financialId };
    } catch {
      console.log("企業登録時に予期せぬエラーが発生しました");
      return null;
    }
  } else {
    let { documentId, financialId } = await createDocument(
      checkTicker.id,
      input,
    );
    return { companyId: checkTicker.id, documentId, financialId };
  }
};

const createDocument = async (
  companyId: string,
  irdocument: CreateCompanyReq,
) => {
  const [fyPart, qPart] = irdocument.fiscal_period.split(" ");
  const fiscalYear = Number(fyPart.replace("FY", ""));
  const quarter = Number(qPart.replace("Q", ""));
  const checkDocument = await prisma.document.findFirst({
    where: { companyId: companyId, fiscalYear: fiscalYear, quarter: quarter },
  });
  if (!checkDocument) {
    const document = await prisma.document.create({
      data: {
        title: irdocument.title,
        fileUrl: irdocument.fileName,
        fiscalYear: fiscalYear,
        quarter: quarter,
        periodType: "Q",
        companyId: companyId,
      },
    });
    let financialId = await createFinance(document, irdocument);
    return { documentId: document.id, financialId };
  } else {
    let financialId = await createFinance(checkDocument, irdocument);
    return { documentId: checkDocument.id, financialId };
  }
};

const createFinance = async (data: any, irdocument: any) => {
  const checkFinancial = await prisma.financial.findFirst({
    where: {
      companyId: data.companyId,
      fiscalYear: data.fiscalYear,
      fiscalQuarter: data.quarter,
    },
  });
  if (!checkFinancial) {
    const finance = await prisma.financial.create({
      data: {
        companyId: data.companyId,
        fiscalYear: data.fiscalYear,
        fiscalQuarter: data.quarter,
        periodType: "Q",
        revenue: irdocument.revenue,
        netIncomeGaap: irdocument.net_income_gaap,
        netIncomeNonGaap: irdocument.net_income_non_gaap,
        documentId: data.id,
      },
    });
    return finance.id;
  } else {
    return checkFinancial.id;
  }
};

router.get("/8k/:cik", authMiddleware, async (req: AuthRequest, res: any) => {
  const { cik } = req.params;
  const data = await get8KPressReleaseHtml2(cik);
  //console.log(data);
  res.json(data);
});

router.get("/8k2/:cik", authMiddleware, async (req: AuthRequest, res: any) => {
  const { cik } = req.params;
  try {
    const data = await get8KPressReleaseHtml(cik);
    //console.log(data);
    res.json(data);
  } catch (e) {
    return res.status(404).json({
      message: "エラーが発生しました",
    });
  }
});

// 全 ir 取得
router.get("/", authMiddleware, async (req: AuthRequest, res: any) => {
  const userId = req.userId;
  const dirPath = path.join(process.cwd(), "uploads", `user_${userId}`);
  const files = await fs.readdir(dirPath);

  const fileList = files.map((file) => ({
    name: file,
    path: path.join(dirPath, file),
  }));

  res.json(fileList);
});

// Symbol取得
router.get(
  "/companies",
  authMiddleware,
  async (_req: AuthRequest, res: any) => {
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
    return res.json(data);
  },
);

//AI要約
router.post("/summary", authMiddleware, async (req: AuthRequest, res: any) => {
  if (!req.body.text) {
    return res.status(400).json({ error: "テキストがありません" });
  }
  const result = await summarizeIR(req.body.text);
  res.json(result);
});

router.get(
  "/summary/:companyId/text",
  authMiddleware,
  async (req: AuthRequest, res: any) => {
    const { companyId } = req.params;
    if (!companyId) {
      return res.status(400).json({ error: "企業情報が取得できませんでした" });
    }
    const document = await prisma.document.findFirst({
      where: {
        companyId,
      },
      orderBy: [{ fiscalYear: "desc" }, { quarter: "desc" }],
      include: {
        contents: {
          orderBy: {
            orderIndex: "asc",
          },
        },
      },
    });

    const contentEn = document?.contents[0]?.contentEn;
    if (!contentEn) {
      return res.status(400).json({ error: "8K情報が取得できませんでした" });
    }

    const result = await summarizeIRText(contentEn);
    res.json({
      ...result,
      fiscalYear: document.fiscalYear,
      quarter: document.quarter,
    });
  },
);

//企業登録
router.post(
  "/company",
  authMiddleware,
  async (req: AuthRequest<CreateCompanyReq>, res: Response<CompanyRes>) => {
    if (!req.body.ticker) {
      return res.status(400).json({ error: "銘柄情報がありません" });
    }
    const { companyId, documentId, financialId } = await createCompany(
      req.body,
    );
    res.json({
      company: companyId,
      document: documentId,
      financial: financialId,
    });
  },
);

// ir 作成
router.post(
  "/",
  authMiddleware,
  upload.single("file"),
  async (req: AuthRequest, res: any) => {
    try {
      let filePath: string;
      let originalName: string;

      if (req.file) {
        filePath = req.file.path;
        originalName = req.file.originalname;
      } else if (req.body.url) {
        const url = req.body.url;
        //if (!url.startsWith("https://")) throw new Error("invalid url");
        const userId = req.userId;
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 500000);
        const response = await fetch(url, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error("取得失敗");
        }
        const contentType = response.headers.get("content-type");
        if (!contentType?.includes("pdf")) {
          throw new Error("PDFじゃない");
        }
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        // ③ multerと同じディレクトリ構造
        const dir = path.join(process.cwd(), "uploads", `user_${userId}`);
        await fs.mkdir(dir, { recursive: true });

        // ④ 元ファイル名っぽいものをURLから取得
        const urlPath = new URL(url).pathname;
        let baseName = path.basename(urlPath);
        if (!baseName || !baseName.endsWith(".pdf")) {
          baseName = "document.pdf";
        }
        // ⑤ multerと同じ命名ルール
        const uniqueName = `${Date.now()}-${baseName}`;
        filePath = path.join(dir, uniqueName);
        await fs.writeFile(filePath, buffer);
        originalName = baseName;
      } else {
        return res.status(400).json({ error: "ファイルかURLが必要です" });
      }
      // 共通処理（ここがミソ）
      const fileBuffer = await fs.readFile(filePath);
      const data = await pdf(fileBuffer);
      return res.json({
        message: "アップロード成功",
        file: {
          path: filePath,
          originalname: originalName,
        },
        text: data.text,
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: "処理に失敗しました" });
    }
  },
);

// Document 更新
router.put("/:id", authMiddleware, async (req: AuthRequest, res: any) => {
  const { id } = req.params;
  const { title, completed } = req.body;

  const todo = await prisma.todo.updateMany({
    where: { id: Number(id), userId: req.userId },
    data: { title, completed },
  });

  if (todo.count === 0) return res.status(404).json({ error: "Not found" });

  res.json({ success: true });
});

// Document 削除
router.delete(
  "/company/document/:id",
  authMiddleware,
  async (req: AuthRequest, res: any) => {
    const { id } = req.params;
    const document = await prisma.document.deleteMany({
      where: { id: id },
    });

    if (document.count === 0)
      return res.status(404).json({ error: "Not found" });
    res.json({ success: true });
  },
);

export default router;
