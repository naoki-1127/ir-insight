-- CreateTable
CREATE TABLE "Financial" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "fiscalQuarter" INTEGER,
    "periodType" TEXT NOT NULL,
    "revenue" DOUBLE PRECISION,
    "netIncomeGaap" DOUBLE PRECISION,
    "netIncomeNonGaap" DOUBLE PRECISION,
    "documentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Financial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Financial_companyId_fiscalYear_fiscalQuarter_periodType_key" ON "Financial"("companyId", "fiscalYear", "fiscalQuarter", "periodType");

-- AddForeignKey
ALTER TABLE "Financial" ADD CONSTRAINT "Financial_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Financial" ADD CONSTRAINT "Financial_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
