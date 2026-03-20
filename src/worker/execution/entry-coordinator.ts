import {
  evaluateCreditSpreadCandidateRisk,
  type CreditSpreadRiskConfig,
  type CreditSpreadRiskContext,
} from './risk.js';
import type { CreditSpreadCandidate } from './types.js';
import type {
  TigerAdapterClient,
  TigerAdapterComboPlaceResponse,
  TigerAdapterComboPreviewResponse,
  TigerAdapterComboRequest,
} from '../../modules/tiger/client.js';

export type EntryExecutionRepository = {
  createTradeIntent(input: {
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
  }): Promise<{ id: number }>;
  updateTradeIntent(input: {
    id: number;
    status?: string;
    quantity?: number;
    targetNetCredit?: number;
    minAcceptableNetCredit?: number;
    maxLoss?: number;
    direction?: string | null;
    setupState?: string | null;
    blockersJson?: string | null;
  }): Promise<unknown>;
  createTradeExecution(input: {
    tradeIntentId: number;
    managedPositionId?: number | null;
    phase: string;
    status: string;
    brokerOrderId?: string | null;
    quantity: number;
    limitPrice?: number | null;
    filledPrice?: number | null;
    notes?: string | null;
  }): Promise<{ id: number }>;
  createManagedPosition(input: {
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
  }): Promise<{ id: number }>;
  createRiskEvent(input: {
    tradeIntentId?: number | null;
    managedPositionId?: number | null;
    reasonCode: string;
    message?: string | null;
  }): Promise<unknown>;
};

export type EntryCoordinatorTigerClient = Pick<TigerAdapterClient, 'previewCombo' | 'placeCombo'>;

export type ExecuteCreditSpreadEntriesOptions = {
  loadCandidates: () => Promise<CreditSpreadCandidate[]>;
  getRiskContext: () => Promise<CreditSpreadRiskContext>;
  repository: EntryExecutionRepository;
  tigerClient: EntryCoordinatorTigerClient;
  riskConfig: CreditSpreadRiskConfig;
  repricingStepCredits?: number;
  tif?: 'DAY' | 'GTC';
  account?: string;
  clientOrderIdPrefix?: string;
};

export type ExecuteCreditSpreadEntriesResult = {
  processed: number;
  accepted: number;
  placed: number;
  skipped: number;
  failed: number;
};

const DEFAULT_REPRICING_STEP_CREDITS = 0.05;

export async function executeCreditSpreadEntries(
  options: ExecuteCreditSpreadEntriesOptions
): Promise<ExecuteCreditSpreadEntriesResult> {
  const candidates = await options.loadCandidates();
  const riskContext = await options.getRiskContext();
  const result: ExecuteCreditSpreadEntriesResult = {
    processed: 0,
    accepted: 0,
    placed: 0,
    skipped: 0,
    failed: 0,
  };

  for (const candidate of candidates) {
    result.processed += 1;

    const riskDecision = evaluateCreditSpreadCandidateRisk(candidate, riskContext, options.riskConfig);
    if (!riskDecision.accepted) {
      result.skipped += 1;
      continue;
    }

    result.accepted += 1;

    const sizedCandidate = riskDecision.sizedCandidate;
    const tradeIntent = await options.repository.createTradeIntent({
      symbol: sizedCandidate.symbol,
      strategyType: sizedCandidate.strategyType,
      status: 'PENDING_PREVIEW',
      idempotencyKey: sizedCandidate.idempotencyKey,
      expiryISO: sizedCandidate.expiryISO,
      quantity: sizedCandidate.quantity,
      width: sizedCandidate.width,
      targetNetCredit: sizedCandidate.targetNetCredit,
      minAcceptableNetCredit: sizedCandidate.minAcceptableNetCredit,
      maxLoss: sizedCandidate.maxLoss,
      direction: sizedCandidate.direction,
      setupState: sizedCandidate.setupState,
      blockersJson: sizedCandidate.blockers ? JSON.stringify(sizedCandidate.blockers) : undefined,
    });

    const previewRequest = buildComboRequest(sizedCandidate, {
      netPrice: sizedCandidate.targetNetCredit,
      account: options.account,
      tif: options.tif ?? 'DAY',
      clientOrderId: buildClientOrderId(options.clientOrderIdPrefix, sizedCandidate.idempotencyKey, 'preview'),
    });

    let preview: TigerAdapterComboPreviewResponse;
    try {
      preview = await options.tigerClient.previewCombo(previewRequest);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await rejectPreview(options.repository, tradeIntent.id, message);
      result.failed += 1;
      continue;
    }

    if (preview.ok === false) {
      await rejectPreview(options.repository, tradeIntent.id, preview.message ?? 'broker preview rejected');
      result.failed += 1;
      continue;
    }

    const placement = await tryPlaceWithRepricing(
      sizedCandidate,
      options,
      tradeIntent.id
    );

    if (!placement.orderId) {
      await options.repository.updateTradeIntent({
        id: tradeIntent.id,
        status: 'FAILED',
        quantity: sizedCandidate.quantity,
      });
      result.failed += 1;
      continue;
    }

    await options.repository.updateTradeIntent({
      id: tradeIntent.id,
      status: 'PENDING_ENTRY',
      quantity: sizedCandidate.quantity,
      targetNetCredit: placement.finalNetCredit,
      minAcceptableNetCredit: sizedCandidate.minAcceptableNetCredit,
      maxLoss: sizedCandidate.maxLoss,
    });

    const managedPosition = await options.repository.createManagedPosition({
      tradeIntentId: tradeIntent.id,
      symbol: sizedCandidate.symbol,
      strategyType: sizedCandidate.strategyType,
      status: 'PENDING_ENTRY',
      idempotencyKey: sizedCandidate.idempotencyKey,
      expiryISO: sizedCandidate.expiryISO,
      quantity: sizedCandidate.quantity,
      width: sizedCandidate.width,
      entryCredit: placement.finalNetCredit,
      maxLoss: sizedCandidate.maxLoss,
    });

    await options.repository.createTradeExecution({
      tradeIntentId: tradeIntent.id,
      managedPositionId: managedPosition.id,
      phase: 'ENTRY',
      status: placement.status ?? 'SUBMITTED',
      brokerOrderId: placement.orderId,
      quantity: sizedCandidate.quantity,
      limitPrice: placement.finalNetCredit,
      notes: placement.message ?? null,
    });

    result.placed += 1;
  }

  return result;
}

async function rejectPreview(
  repository: EntryExecutionRepository,
  tradeIntentId: number,
  message: string
) {
  await repository.updateTradeIntent({
    id: tradeIntentId,
    status: 'PREVIEW_REJECTED',
  });
  await repository.createRiskEvent({
    tradeIntentId,
    reasonCode: 'BROKER_PREVIEW_REJECTED',
    message,
  });
}

async function tryPlaceWithRepricing(
  candidate: CreditSpreadCandidate,
  options: ExecuteCreditSpreadEntriesOptions,
  tradeIntentId: number
): Promise<TigerAdapterComboPlaceResponse & { finalNetCredit: number }> {
  const repricingStepCredits = Math.max(
    0.01,
    roundTo(options.repricingStepCredits ?? DEFAULT_REPRICING_STEP_CREDITS, 2)
  );
  let netPrice = roundTo(candidate.targetNetCredit, 2);
  const floor = roundTo(candidate.minAcceptableNetCredit, 2);
  let lastResponse: TigerAdapterComboPlaceResponse & { finalNetCredit: number } = {
    finalNetCredit: netPrice,
  };

  while (netPrice + 1e-9 >= floor) {
    const response = await options.tigerClient.placeCombo(
      buildComboRequest(candidate, {
        netPrice,
        account: options.account,
        tif: options.tif ?? 'DAY',
        clientOrderId: buildClientOrderId(options.clientOrderIdPrefix, candidate.idempotencyKey, 'entry'),
      })
    );

    lastResponse = {
      ...response,
      finalNetCredit: netPrice,
    };

    if (response.orderId) {
      return lastResponse;
    }

    if (netPrice <= floor + 1e-9) {
      break;
    }

    netPrice = roundTo(Math.max(floor, netPrice - repricingStepCredits), 2);
  }

  await options.repository.createTradeExecution({
    tradeIntentId,
    phase: 'ENTRY',
    status: lastResponse.status ?? 'FAILED',
    quantity: candidate.quantity,
    limitPrice: lastResponse.finalNetCredit,
    notes: lastResponse.message ?? 'entry repricing exhausted',
  });

  return lastResponse;
}

function buildComboRequest(
  candidate: CreditSpreadCandidate,
  options: {
    netPrice: number;
    tif: 'DAY' | 'GTC';
    account?: string;
    clientOrderId?: string;
  }
): TigerAdapterComboRequest {
  return {
    account: options.account,
    strategyType: candidate.strategyType,
    symbol: candidate.symbol,
    quantity: candidate.quantity,
    netPrice: roundTo(options.netPrice, 2),
    tif: options.tif,
    clientOrderId: options.clientOrderId,
    legs: [candidate.shortLeg, candidate.longLeg].map((leg) => ({
      symbol: leg.symbol,
      expiry: leg.expiry,
      strike: leg.strike,
      putCall: leg.putCall,
      action: leg.action,
      quantity: 1,
      multiplier: leg.multiplier,
    })),
  };
}

function buildClientOrderId(prefix: string | undefined, idempotencyKey: string, phase: string): string {
  const sanitizedKey = idempotencyKey.replace(/[^A-Za-z0-9:_-]/g, '-');
  return prefix ? `${prefix}:${phase}:${sanitizedKey}` : `${phase}:${sanitizedKey}`;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
