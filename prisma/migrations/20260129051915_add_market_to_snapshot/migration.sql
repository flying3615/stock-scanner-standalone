-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_StockSnapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "symbol" TEXT NOT NULL,
    "market" TEXT NOT NULL DEFAULT 'US',
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "price" REAL NOT NULL,
    "valueScore" INTEGER NOT NULL,
    "sentimentScore" REAL NOT NULL,
    "moneyFlowStrength" REAL NOT NULL
);
INSERT INTO "new_StockSnapshot" ("date", "id", "moneyFlowStrength", "price", "sentimentScore", "symbol", "valueScore") SELECT "date", "id", "moneyFlowStrength", "price", "sentimentScore", "symbol", "valueScore" FROM "StockSnapshot";
DROP TABLE "StockSnapshot";
ALTER TABLE "new_StockSnapshot" RENAME TO "StockSnapshot";
CREATE INDEX "StockSnapshot_symbol_date_idx" ON "StockSnapshot"("symbol", "date");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
