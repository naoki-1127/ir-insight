-- ADR 0001: Company を共有の銘柄マスタにし、ユーザごとの登録は Watchlist に持たせる

-- Prisma はマイグレーションをトランザクションに包まないため、明示的に囲む。
-- 途中で失敗した場合はすべて取り消され、中途半端な状態が残らない。
BEGIN;

-- CreateTable
CREATE TABLE "Watchlist" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Watchlist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Watchlist_companyId_idx" ON "Watchlist"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Watchlist_userId_companyId_key" ON "Watchlist"("userId", "companyId");

-- AddForeignKey
ALTER TABLE "Watchlist" ADD CONSTRAINT "Watchlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Watchlist" ADD CONSTRAINT "Watchlist_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: これまでの Company は全員共通の登録銘柄だったため、既存の全ユーザのウォッチに移す。
-- 論理削除（deletedAt）はウォッチのアーカイブ（archivedAt）として引き継ぐ。
INSERT INTO "Watchlist" ("id", "userId", "companyId", "archivedAt", "createdAt")
SELECT gen_random_uuid()::text, u."id", c."id", c."deletedAt", c."createdAt"
FROM "User" u CROSS JOIN "Company" c;

-- AlterTable
ALTER TABLE "Company" DROP COLUMN "deletedAt";

-- DropIndex（ticker は変更・再利用があるため一意にしない）
DROP INDEX "Company_ticker_key";

-- CreateIndex
CREATE INDEX "Company_ticker_idx" ON "Company"("ticker");

-- DropForeignKey
ALTER TABLE "Document" DROP CONSTRAINT "Document_userId_fkey";

-- AlterTable（文書は共有データであり、ユーザとは関係しない）
ALTER TABLE "Document" DROP COLUMN "userId";

COMMIT;
