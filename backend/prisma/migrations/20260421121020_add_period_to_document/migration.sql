/*
  Warnings:

  - Added the required column `fiscalYear` to the `Document` table without a default value. This is not possible if the table is not empty.
  - Added the required column `periodType` to the `Document` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "fiscalYear" INTEGER NOT NULL,
ADD COLUMN     "periodType" TEXT NOT NULL,
ADD COLUMN     "quarter" INTEGER;

-- AlterTable
ALTER TABLE "RefreshToken" ALTER COLUMN "userId" SET DATA TYPE TEXT;
