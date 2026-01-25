-- CreateTable
CREATE TABLE "StockSnapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "symbol" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "price" REAL NOT NULL,
    "valueScore" INTEGER NOT NULL,
    "sentimentScore" REAL NOT NULL,
    "moneyFlowStrength" REAL NOT NULL
);

-- CreateTable
CREATE TABLE "OptionSignal" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "snapshotId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "strike" REAL NOT NULL,
    "expiry" DATETIME NOT NULL,
    "notional" REAL NOT NULL,
    "direction" TEXT NOT NULL,
    CONSTRAINT "OptionSignal_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "StockSnapshot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OptionCombo" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "snapshotId" INTEGER NOT NULL,
    "strategy" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "notional" REAL NOT NULL,
    "riskProfile" TEXT,
    CONSTRAINT "OptionCombo_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "StockSnapshot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "StockSnapshot_symbol_date_idx" ON "StockSnapshot"("symbol", "date");

-- CreateIndex
CREATE INDEX "OptionSignal_snapshotId_idx" ON "OptionSignal"("snapshotId");

-- CreateIndex
CREATE INDEX "OptionCombo_snapshotId_idx" ON "OptionCombo"("snapshotId");
