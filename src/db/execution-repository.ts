import { PrismaClient } from '@prisma/client';

export type CreateExecutionRepositoryOptions = {
  databaseUrl?: string;
};

export type CreateTradeIntentInput = {
  symbol: string;
  strategyType: string;
  status: string;
  idempotencyKey: string;
  expiryISO: string;
  quantity: number;
  width: number;
  targetNetCredit: number;
  minAcceptableNetCredit: number;
  maxLoss: number;
  direction?: string;
  setupState?: string;
  blockersJson?: string;
};

export type CreateTradeExecutionInput = {
  tradeIntentId: number;
  managedPositionId?: number | null;
  phase: string;
  status: string;
  brokerOrderId?: string | null;
  quantity: number;
  limitPrice?: number | null;
  filledPrice?: number | null;
  notes?: string | null;
};

export type CreateManagedPositionInput = {
  tradeIntentId: number;
  symbol: string;
  strategyType: string;
  status: string;
  idempotencyKey: string;
  expiryISO: string;
  quantity: number;
  width: number;
  entryCredit?: number | null;
  exitCredit?: number | null;
  maxLoss: number;
  closedAt?: Date | null;
};

export type CreateRiskEventInput = {
  tradeIntentId?: number | null;
  managedPositionId?: number | null;
  reasonCode: string;
  message?: string | null;
};

export type UpdateTradeIntentInput = {
  id: number;
  status?: string;
  quantity?: number;
  targetNetCredit?: number;
  minAcceptableNetCredit?: number;
  maxLoss?: number;
  direction?: string | null;
  setupState?: string | null;
  blockersJson?: string | null;
};

export type UpdateTradeExecutionInput = {
  id: number;
  phase?: string;
  status?: string;
  brokerOrderId?: string | null;
  quantity?: number;
  limitPrice?: number | null;
  filledPrice?: number | null;
  notes?: string | null;
};

export type UpdateManagedPositionInput = {
  id: number;
  status?: string;
  quantity?: number;
  entryCredit?: number | null;
  exitCredit?: number | null;
  maxLoss?: number;
  closedAt?: Date | null;
};

export function createExecutionRepository(
  options: CreateExecutionRepositoryOptions = {}
) {
  const prisma = new PrismaClient({
    datasources: options.databaseUrl
      ? {
          db: {
            url: options.databaseUrl,
          },
        }
      : undefined,
  });

  return {
    async createTradeIntent(input: CreateTradeIntentInput) {
      return prisma.tradeIntent.create({
        data: {
          symbol: input.symbol.toUpperCase(),
          strategyType: input.strategyType,
          status: input.status,
          idempotencyKey: input.idempotencyKey,
          expiryISO: input.expiryISO,
          quantity: input.quantity,
          width: input.width,
          targetNetCredit: input.targetNetCredit,
          minAcceptableNetCredit: input.minAcceptableNetCredit,
          maxLoss: input.maxLoss,
          direction: input.direction,
          setupState: input.setupState,
          blockersJson: input.blockersJson,
        },
      });
    },

    async createTradeExecution(input: CreateTradeExecutionInput) {
      return prisma.tradeExecution.create({
        data: {
          tradeIntentId: input.tradeIntentId,
          managedPositionId: input.managedPositionId ?? undefined,
          phase: input.phase,
          status: input.status,
          brokerOrderId: input.brokerOrderId ?? undefined,
          quantity: input.quantity,
          limitPrice: input.limitPrice ?? undefined,
          filledPrice: input.filledPrice ?? undefined,
          notes: input.notes ?? undefined,
        },
      });
    },

    async createManagedPosition(input: CreateManagedPositionInput) {
      return prisma.managedPosition.create({
        data: {
          tradeIntentId: input.tradeIntentId,
          symbol: input.symbol.toUpperCase(),
          strategyType: input.strategyType,
          status: input.status,
          idempotencyKey: input.idempotencyKey,
          expiryISO: input.expiryISO,
          quantity: input.quantity,
          width: input.width,
          entryCredit: input.entryCredit ?? undefined,
          exitCredit: input.exitCredit ?? undefined,
          maxLoss: input.maxLoss,
          closedAt: input.closedAt ?? undefined,
        },
      });
    },

    async createRiskEvent(input: CreateRiskEventInput) {
      return prisma.riskEvent.create({
        data: {
          tradeIntentId: input.tradeIntentId ?? undefined,
          managedPositionId: input.managedPositionId ?? undefined,
          reasonCode: input.reasonCode,
          message: input.message ?? undefined,
        },
      });
    },

    async updateTradeIntent(input: UpdateTradeIntentInput) {
      return prisma.tradeIntent.update({
        where: { id: input.id },
        data: {
          status: input.status,
          quantity: input.quantity,
          targetNetCredit: input.targetNetCredit,
          minAcceptableNetCredit: input.minAcceptableNetCredit,
          maxLoss: input.maxLoss,
          direction: input.direction === undefined ? undefined : input.direction,
          setupState: input.setupState === undefined ? undefined : input.setupState,
          blockersJson: input.blockersJson === undefined ? undefined : input.blockersJson,
        },
      });
    },

    async updateTradeExecution(input: UpdateTradeExecutionInput) {
      return prisma.tradeExecution.update({
        where: { id: input.id },
        data: {
          phase: input.phase,
          status: input.status,
          brokerOrderId: input.brokerOrderId === undefined ? undefined : input.brokerOrderId,
          quantity: input.quantity,
          limitPrice: input.limitPrice === undefined ? undefined : input.limitPrice,
          filledPrice: input.filledPrice === undefined ? undefined : input.filledPrice,
          notes: input.notes === undefined ? undefined : input.notes,
        },
      });
    },

    async updateManagedPosition(input: UpdateManagedPositionInput) {
      return prisma.managedPosition.update({
        where: { id: input.id },
        data: {
          status: input.status,
          quantity: input.quantity,
          entryCredit: input.entryCredit === undefined ? undefined : input.entryCredit,
          exitCredit: input.exitCredit === undefined ? undefined : input.exitCredit,
          maxLoss: input.maxLoss,
          closedAt: input.closedAt === undefined ? undefined : input.closedAt,
        },
      });
    },

    async getTradeIntentById(id: number) {
      return prisma.tradeIntent.findUnique({
        where: { id },
        include: {
          tradeExecutions: true,
          managedPosition: true,
          riskEvents: true,
        },
      });
    },

    async getManagedPositionById(id: number) {
      return prisma.managedPosition.findUnique({
        where: { id },
        include: {
          tradeIntent: true,
          tradeExecutions: true,
          riskEvents: true,
        },
      });
    },

    async listRiskEventsForTradeIntent(tradeIntentId: number) {
      return prisma.riskEvent.findMany({
        where: { tradeIntentId },
        orderBy: { createdAt: 'asc' },
      });
    },

    async disconnect() {
      await prisma.$disconnect();
    },
  };
}
