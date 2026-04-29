// src/routes/todo.ts
import express from "express";
import multer from "multer";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import fs from "fs/promises";
import path from "path";
import { createRequire } from "module";
import { summarizeIR } from "../services/ai.service";
const require = createRequire(import.meta.url);
const pdfModule = require("pdf-parse");
const pdf = pdfModule.default ?? pdfModule;
const router = express.Router();
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

type CreateCompanyBody = {
  ticker: string;
  company: string;
  market: string;
};

const prisma = new PrismaClient({ adapter });

const storage = multer.diskStorage({
  destination: async (req: AuthRequest, file: any, cb: any) => {
    const userId = req.userId; // 認証済み前提
    const dir = path.join(process.cwd(), "uploads", `user_${userId}`);
    // ディレクトリがなければ作成
    await fs.mkdir(dir, { recursive: true });

    cb(null, dir);
  },
  filename: (req: AuthRequest, file: any, cb: any) => {
    // 重複防止
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});

const upload = multer({ storage });

const createCompany = async (symbol: any) => {
  const checkSymbol = await prisma.company.findUnique({
    where: { ticker: symbol.symbol },
  });
  if (!checkSymbol) {
    const company = await prisma.company.create({
      data: {
        name: symbol.company_name,
        ticker: symbol.symbol,
        market: "US",
      },
    });
    return company.id;
  }
  return checkSymbol.id;
};
const createDocument = async (companyId: any, irdocument: any) => {
  console.log(companyId);
  console.log(irdocument);
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
    return document.id;
  }
  return checkDocument.id;
};

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
router.get("/companies", authMiddleware, async (req: AuthRequest, res: any) => {
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
      },
    },
  });
  return res.json(data);
});

//bufferを取得
router.get("/detail", authMiddleware, async (req: AuthRequest, res) => {
  if (!req.body.path) {
    return res.status(400).json({ error: "ファイルがありません" });
  }
  const dirPath = req.body.path;
  const fileBuffer = await fs.readFile(dirPath);
  const data = await pdf(fileBuffer);
  res.json(data);
});

//AI要約
router.post("/summary", authMiddleware, async (req: AuthRequest, res: any) => {
  if (!req.body.text) {
    return res.status(400).json({ error: "テキストがありません" });
  }
  const result = await summarizeIR(req.body.text);
  res.json(result);
});

//企業登録
router.post(
  "/company",
  authMiddleware,
  async (req: AuthRequest<CreateCompanyBody>, res: any) => {
    if (!req.body.symbol) {
      return res.status(400).json({ error: "銘柄情報がありません" });
    }
    console.log("aaa");
    console.log(req.body);
    const company = await createCompany(req.body);
    const document = await createDocument(company, req.body);
    res.json({ company: company, document: document });
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
        const userId = req.userId;
        const response = await fetch(url);
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

      console.log(req.file);
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

// Todo 更新
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
    //console.log(id);
    const document = await prisma.document.deleteMany({
      where: { id: id },
    });

    if (document.count === 0)
      return res.status(404).json({ error: "Not found" });
    res.json({ success: true });
  },
);

export default router;
