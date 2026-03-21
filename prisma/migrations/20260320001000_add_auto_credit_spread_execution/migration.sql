-- CreateTable
CREATE TABLE "TradeIntent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "symbol" TEXT NOT NULL,
    "strategyType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "expiryISO" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "width" REAL NOT NULL,
    "targetNetCredit" REAL NOT NULL,
    "minAcceptableNetCredit" REAL NOT NULL,
    "maxLoss" REAL NOT NULL,
    "direction" TEXT,
    "setupState" TEXT,
    "blockersJson" TEXT
);

-- CreateTable
CREATE TABLE "TradeExecution" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "tradeIntentId" INTEGER NOT NULL,
    "managedPositionId" INTEGER,
    "phase" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "brokerOrderId" TEXT,
    "quantity" INTEGER NOT NULL,
    "limitPrice" REAL,
    "filledPrice" REAL,
    "notes" TEXT,
    CONSTRAINT "TradeExecution_tradeIntentId_fkey" FOREIGN KEY ("tradeIntentId") REFERENCES "TradeIntent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TradeExecution_managedPositionId_fkey" FOREIGN KEY ("managedPositionId") REFERENCES "ManagedPosition" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ManagedPosition" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "tradeIntentId" INTEGER NOT NULL,
    "symbol" TEXT NOT NULL,
    "strategyType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "expiryISO" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "width" REAL NOT NULL,
    "entryCredit" REAL,
    "exitCredit" REAL,
    "maxLoss" REAL NOT NULL,
    "closedAt" DATETIME,
    CONSTRAINT "ManagedPosition_tradeIntentId_fkey" FOREIGN KEY ("tradeIntentId") REFERENCES "TradeIntent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RiskEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tradeIntentId" INTEGER,
    "managedPositionId" INTEGER,
    "reasonCode" TEXT NOT NULL,
    "message" TEXT,
    CONSTRAINT "RiskEvent_tradeIntentId_fkey" FOREIGN KEY ("tradeIntentId") REFERENCES "TradeIntent" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RiskEvent_managedPositionId_fkey" FOREIGN KEY ("managedPositionId") REFERENCES "ManagedPosition" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TradeIntent_idempotencyKey_key" ON "TradeIntent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "TradeIntent_symbol_strategyType_idx" ON "TradeIntent"("symbol", "strategyType");

-- CreateIndex
CREATE INDEX "TradeIntent_status_idx" ON "TradeIntent"("status");

-- CreateIndex
CREATE INDEX "TradeExecution_tradeIntentId_idx" ON "TradeExecution"("tradeIntentId");

-- CreateIndex
CREATE INDEX "TradeExecution_managedPositionId_idx" ON "TradeExecution"("managedPositionId");

-- CreateIndex
CREATE UNIQUE INDEX "ManagedPosition_tradeIntentId_key" ON "ManagedPosition"("tradeIntentId");

-- CreateIndex
CREATE INDEX "ManagedPosition_status_idx" ON "ManagedPosition"("status");

-- CreateIndex
CREATE INDEX "ManagedPosition_symbol_strategyType_idx" ON "ManagedPosition"("symbol", "strategyType");

-- CreateIndex
CREATE INDEX "RiskEvent_tradeIntentId_idx" ON "RiskEvent"("tradeIntentId");

-- CreateIndex
CREATE INDEX "RiskEvent_managedPositionId_idx" ON "RiskEvent"("managedPositionId");

-- CreateIndex
CREATE INDEX "RiskEvent_reasonCode_idx" ON "RiskEvent"("reasonCode");
