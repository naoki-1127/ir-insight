import "dotenv/config";
import process from "node:process";
import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import crypto from "crypto";
import cors from "cors";
import cookieParser from "cookie-parser";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import irRoutes from "./routes/ir.js";
import companiesRouter from "./routes/company.js";
import "./queues/earningsWorker";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

const SECRET = process.env.JWT_SECRET || "secret-key";
const app = express();
app.use(
  cors({
    origin: process.env.BACKEND_URL, // Vue の開発サーバーの URL
    credentials: true, // Cookie を使う場合
  }),
);

app.use(express.json());
app.use(cookieParser());
app.use("/ir", irRoutes);
app.use("/api/companies", companiesRouter);

const generateTokens = (userId: string) => {
  const accessToken = jwt.sign({ userId }, SECRET, {
    expiresIn: "15m",
  });
  const refreshToken = crypto.randomBytes(32).toString("hex");
  return { accessToken, refreshToken };
};
app.get("/", async (_req, res) => {
  const result = await prisma.$queryRaw`SELECT * FROM now()`;
  res.json(result); // .rows は pg の Pool 用。$queryRaw は配列をそのまま返す
});

app.get("/do", async (_req, res) => {
  const result = await prisma.$queryRaw`SELECT * FROM User`;
  res.json(result); // .rows は pg の Pool 用。$queryRaw は配列をそのまま返す
});

app.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body;
    const checkUser = await prisma.user.findUnique({
      where: { email: email },
    });
    if (checkUser) {
      res.status(409).json({ error: email + " はすでに登録されています" });
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = await prisma.user.create({
        data: {
          email: email,
          password: hashedPassword,
        },
      });
      // JWT 生成して返す（登録直後に自動ログイン）
      const { accessToken, refreshToken } = generateTokens(newUser.id);
      res
        .cookie("refreshToken", refreshToken, {
          httpOnly: true,
          secure: false,
          sameSite: "lax",
          maxAge: 7 * 24 * 60 * 60 * 1000,
        })
        .json({ accessToken });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "サーバーエラー" });
  }
});

// --- ログイン ---
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "emailとpasswordは必須" });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: "ユーザーなし" });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: "パスワード違う" });

    const { accessToken, refreshToken } = generateTokens(user.id);
    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiredAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7日
      },
    });
    res
      .cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      })
      .json({ accessToken });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "サーバーエラー" });
  }
});

app.post("/logout", async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  await prisma.refreshToken.delete({
    where: { token: refreshToken },
  });
  res.json({ message: "logout" });
});

app.post("/refresh", async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  const stored = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
  });
  if (!stored) return res.status(401).json({ error: "Invalid" });
  if (stored.expiredAt < new Date()) {
    return res.status(401).json({ error: "Expired" });
  }
  const newAccessToken = jwt.sign({ userId: stored.userId }, SECRET, {
    expiresIn: "15m",
  });
  res.json({ accessToken: newAccessToken });
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
