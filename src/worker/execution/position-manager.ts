import type {
  TigerAdapterClient,
  TigerAdapterComboPlaceResponse,
  TigerAdapterOptionOrder,
  TigerAdapterOptionPosition,
} from '../../modules/tiger/client.js';
import type { ExitPolicy } from './types.js';

export type ManagedSpreadPositionRecord = {
  id: number;
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
};

export type PositionManagerRepository = {
  updateManagedPosition(input: {
    id: number;
    status?: string;
    quantity?: number;
    entryCredit?: number | null;
    exitCredit?: number | null;
    maxLoss?: number;
    closedAt?: Date | null;
  }): Promise<unknown>;
  createTradeExecution(input: {
    tradeIntentId?: number;
    managedPositionId?: number | null;
    phase: string;
    status: string;
    brokerOrderId?: string | null;
    quantity: number;
    limitPrice?: number | null;
    filledPrice?: number | null;
    notes?: string | null;
  }): Promise<unknown>;
  createRiskEvent(input: {
    tradeIntentId?: number | null;
    managedPositionId?: number | null;
    reasonCode: string;
    message?: string | null;
  }): Promise<unknown>;
};

export type PositionManagerTigerClient = Pick<
  TigerAdapterClient,
  'getOptionPositions' | 'getOptionOrders' | 'placeCombo'
>;

export type ManageCreditSpreadPositionsOptions = {
  loadManagedPositions: () => Promise<ManagedSpreadPositionRecord[]>;
  repository: PositionManagerRepository;
  tigerClient: PositionManagerTigerClient;
  exitPolicy: ExitPolicy;
  now?: () => Date;
  tif?: 'DAY' | 'GTC';
  account?: string;
  clientOrderIdPrefix?: string;
};

export type ManageCreditSpreadPositionsResult = {
  processed: number;
  exitsSubmitted: number;
  manualInterventions: number;
  skipped: number;
};

export async function manageCreditSpreadPositions(
  options: ManageCreditSpreadPositionsOptions
): Promise<ManageCreditSpreadPositionsResult> {
  const managedPositions = await options.loadManagedPositions();
  const optionPositions = await options.tigerClient.getOptionPositions();
  const optionOrders = await options.tigerClient.getOptionOrders();
  const now = options.now?.() ?? new Date();

  const result: ManageCreditSpreadPositionsResult = {
    processed: 0,
    exitsSubmitted: 0,
    manualInterventions: 0,
    skipped: 0,
  };

  for (const managedPosition of managedPositions) {
    result.processed += 1;

    if (managedPosition.status !== 'OPEN' && managedPosition.status !== 'PENDING_EXIT') {
      result.skipped += 1;
      continue;
    }

    const parsedPosition = parseManagedPositionIdempotencyKey(managedPosition);
    if (!parsedPosition) {
      await flagManualIntervention(options.repository, managedPosition.id, 'Unable to parse managed position legs.');
      result.manualInterventions += 1;
      continue;
    }

    if (hasWorkingExitOrder(managedPosition.symbol, optionOrders)) {
      result.skipped += 1;
      continue;
    }

    const matchedLegs = matchLiveLegs(parsedPosition, optionPositions, managedPosition.quantity);
    if (!matchedLegs) {
      await flagManualIntervention(options.repository, managedPosition.id, 'Live option legs do not match local managed position.');
      result.manualInterventions += 1;
      continue;
    }

    const closeDebit = roundTo(
      Math.max(0, (matchedLegs.shortLeg.marketPrice ?? 0) - (matchedLegs.longLeg.marketPrice ?? 0)),
      2
    );

    const exitReason = resolveExitReason(managedPosition, closeDebit, options.exitPolicy, now);
    if (!exitReason) {
      result.skipped += 1;
      continue;
    }

    const closeOrder = await options.tigerClient.placeCombo({
      account: options.account,
      strategyType: managedPosition.strategyType,
      symbol: managedPosition.symbol,
      quantity: managedPosition.quantity,
      netPrice: closeDebit,
      tif: options.tif ?? 'DAY',
      clientOrderId: buildClientOrderId(options.clientOrderIdPrefix, managedPosition.idempotencyKey, 'exit'),
      legs: [
        {
          symbol: matchedLegs.shortLeg.symbol ?? managedPosition.symbol,
          expiry: matchedLegs.shortLeg.expiry ?? canonicalExpiry(managedPosition.expiryISO),
          strike: matchedLegs.shortLeg.strike ?? parsedPosition.shortStrike,
          putCall: matchedLegs.shortLeg.putCall ?? parsedPosition.putCall,
          action: 'BUY',
        },
        {
          symbol: matchedLegs.longLeg.symbol ?? managedPosition.symbol,
          expiry: matchedLegs.longLeg.expiry ?? canonicalExpiry(managedPosition.expiryISO),
          strike: matchedLegs.longLeg.strike ?? parsedPosition.longStrike,
          putCall: matchedLegs.longLeg.putCall ?? parsedPosition.putCall,
          action: 'SELL',
        },
      ],
    });

    await options.repository.updateManagedPosition({
      id: managedPosition.id,
      status: 'PENDING_EXIT',
      exitCredit: closeDebit,
    });
    await options.repository.createTradeExecution({
      managedPositionId: managedPosition.id,
      phase: 'EXIT',
      status: closeOrder.status ?? 'SUBMITTED',
      brokerOrderId: closeOrder.orderId ?? null,
      quantity: managedPosition.quantity,
      limitPrice: closeDebit,
      notes: exitReason,
    });

    result.exitsSubmitted += 1;
  }

  return result;
}

export async function closeManagedCreditSpreadPosition(
  position: ManagedSpreadPositionRecord,
  dependencies: Omit<ManageCreditSpreadPositionsOptions, 'loadManagedPositions'>
): Promise<ManageCreditSpreadPositionsResult> {
  return manageCreditSpreadPositions({
    ...dependencies,
    loadManagedPositions: async () => [position],
  });
}

function resolveExitReason(
  position: ManagedSpreadPositionRecord,
  closeDebit: number,
  exitPolicy: ExitPolicy,
  now: Date
): string | null {
  const entryCredit = position.entryCredit ?? null;
  const dte = calculateDaysToExpiry(position.expiryISO, now);

  if (dte <= exitPolicy.forceCloseDte) {
    return 'FORCE_CLOSE_DTE';
  }

  if (entryCredit != null && closeDebit <= roundTo(entryCredit * (1 - exitPolicy.takeProfitCreditPct), 2)) {
    return 'TAKE_PROFIT';
  }

  if (entryCredit != null && closeDebit >= roundTo(entryCredit * exitPolicy.stopLossMultiple, 2)) {
    return 'STOP_LOSS';
  }

  return null;
}

async function flagManualIntervention(
  repository: PositionManagerRepository,
  managedPositionId: number,
  message: string
) {
  await repository.updateManagedPosition({
    id: managedPositionId,
    status: 'MANUAL_INTERVENTION_REQUIRED',
  });
  await repository.createRiskEvent({
    managedPositionId,
    reasonCode: 'POSITION_RECONCILIATION_MISMATCH',
    message,
  });
}

function hasWorkingExitOrder(symbol: string, orders: TigerAdapterOptionOrder[]): boolean {
  return orders.some((order) => {
    if ((order.symbol ?? '').toUpperCase() !== symbol.toUpperCase()) return false;
    const status = (order.status ?? '').toUpperCase();
    return status === 'NEW' || status === 'PENDING' || status === 'SUBMITTED';
  });
}

function matchLiveLegs(
  parsedPosition: ParsedManagedPosition,
  optionPositions: TigerAdapterOptionPosition[],
  quantity: number
): { shortLeg: TigerAdapterOptionPosition; longLeg: TigerAdapterOptionPosition } | null {
  const expiry = canonicalExpiry(parsedPosition.expiryISO);
  const normalizedQuantity = Math.abs(quantity);

  const shortLeg = optionPositions.find((position) =>
    (position.symbol ?? '').toUpperCase() === parsedPosition.symbol.toUpperCase() &&
    position.putCall === parsedPosition.putCall &&
    roundTo(position.strike ?? Number.NaN, 4) === parsedPosition.shortStrike &&
    canonicalExpiry(position.expiry ?? '') === expiry &&
    Math.abs(position.quantity ?? 0) === normalizedQuantity
  );

  const longLeg = optionPositions.find((position) =>
    (position.symbol ?? '').toUpperCase() === parsedPosition.symbol.toUpperCase() &&
    position.putCall === parsedPosition.putCall &&
    roundTo(position.strike ?? Number.NaN, 4) === parsedPosition.longStrike &&
    canonicalExpiry(position.expiry ?? '') === expiry &&
    Math.abs(position.quantity ?? 0) === normalizedQuantity
  );

  if (!shortLeg || !longLeg) {
    return null;
  }

  return { shortLeg, longLeg };
}

type ParsedManagedPosition = {
  symbol: string;
  strategyType: string;
  expiryISO: string;
  putCall: 'CALL' | 'PUT';
  shortStrike: number;
  longStrike: number;
};

function parseManagedPositionIdempotencyKey(
  position: ManagedSpreadPositionRecord
): ParsedManagedPosition | null {
  const parts = position.idempotencyKey.split(':');
  if (parts.length < 5) return null;

  const [symbol, strategyType, expiryISO, shortStrikeRaw, longStrikeRaw] = parts;
  const shortStrike = roundTo(Number(shortStrikeRaw), 4);
  const longStrike = roundTo(Number(longStrikeRaw), 4);

  if (!Number.isFinite(shortStrike) || !Number.isFinite(longStrike)) {
    return null;
  }

  return {
    symbol,
    strategyType,
    expiryISO,
    putCall: strategyType === 'BEAR_CALL_CREDIT' ? 'CALL' : 'PUT',
    shortStrike,
    longStrike,
  };
}

function calculateDaysToExpiry(expiryISO: string, now: Date): number {
  const expiry = new Date(`${expiryISO}T00:00:00Z`);
  if (Number.isNaN(expiry.getTime())) {
    return Number.POSITIVE_INFINITY;
  }

  const diffMs = expiry.getTime() - now.getTime();
  return Math.ceil(diffMs / 86_400_000);
}

function canonicalExpiry(expiryISO: string): string {
  if (/^\d{8}$/.test(expiryISO)) {
    return expiryISO;
  }

  const date = new Date(`${expiryISO}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return expiryISO;
  }

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function buildClientOrderId(prefix: string | undefined, idempotencyKey: string, phase: string): string {
  const sanitizedKey = idempotencyKey.replace(/[^A-Za-z0-9:_-]/g, '-');
  return prefix ? `${prefix}:${phase}:${sanitizedKey}` : `${phase}:${sanitizedKey}`;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
