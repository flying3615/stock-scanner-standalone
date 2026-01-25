-- CreateTable
CREATE TABLE "SectorStat" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sector" TEXT NOT NULL,
    "stockCount" INTEGER NOT NULL,
    "avgChange" REAL NOT NULL,
    "totalVolume" REAL NOT NULL,
    "leaderSymbol" TEXT,
    "leaderChange" REAL,
    "rank" INTEGER NOT NULL
);

-- CreateIndex
CREATE INDEX "SectorStat_date_sector_idx" ON "SectorStat"("date", "sector");
