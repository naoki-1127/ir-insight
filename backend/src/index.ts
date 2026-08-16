import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/auth.js";
import irRoutes from "./routes/ir.js";
import companyRoutes from "./routes/company.js";
import "./queues/earningsWorker.js";

const app = express();
app.use(
  cors({
    origin: process.env.FRONTEND_URL, // Vue の開発サーバーの URL
    credentials: true, // Cookie を使う場合
  }),
);

app.use(express.json());
app.use(cookieParser());
app.use("/", authRoutes);
app.use("/ir", irRoutes);
app.use("/api/companies", companyRoutes);

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
