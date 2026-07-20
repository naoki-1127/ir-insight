/*
  Warnings:

  - A unique constraint covering the columns `[cik]` on the table `Company` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `cik` to the `Company` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "cik" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Company_cik_key" ON "Company"("cik");
