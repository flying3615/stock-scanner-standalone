import { createExecutionRepository } from '../../db/execution-repository.js';
import type { TigerAdapterClient } from '../../modules/tiger/client.js';
import { DEFAULT_RISK_CONFIG, type RiskConfig } from './config.js';
import {
  executeCreditSpreadEntries,
  type EntryExecutionRepository,
  type ExecuteCreditSpreadEntriesResult,
} from './entry-coordinator.js';
import type { CreditSpreadCandidate } from './types.js';

export type CreditSpreadRunOnceInput = {
  candidates: CreditSpreadCandidate[];
  tigerClient: Pick<TigerAdapterClient, 'previewCombo' | 'placeCombo'>;
  repository?: EntryExecutionRepository & { disconnect?: () => Promise<void> };
  databaseUrl?: string;
  riskConfig?: Partial<RiskConfig>;
  riskContext?: {
    accountNetValue?: number | null;
    currentOpenRisk?: number;
    existingPositionKeys?: Iterable<string>;
    cooldownUntilByKey?: Map<string, number> | Record<string, number>;
  };
  repricingStepCredits?: number;
  tif?: 'DAY' | 'GTC';
  account?: string;
  clientOrderIdPrefix?: string;
};

export async function runCreditSpreadEntryOnce(
  input: CreditSpreadRunOnceInput
): Promise<ExecuteCreditSpreadEntriesResult> {
  const repository =
    input.repository ??
    createExecutionRepository(
      input.databaseUrl ? { databaseUrl: input.databaseUrl } : undefined
    );

  try {
    return await executeCreditSpreadEntries({
      loadCandidates: async () => input.candidates,
      getRiskContext: async () => ({
        accountNetValue: input.riskContext?.accountNetValue,
        currentOpenRisk: input.riskContext?.currentOpenRisk ?? 0,
        existingPositionKeys: input.riskContext?.existingPositionKeys,
        cooldownUntilByKey: input.riskContext?.cooldownUntilByKey,
      }),
      repository,
      tigerClient: input.tigerClient,
      riskConfig: {
        ...DEFAULT_RISK_CONFIG,
        ...input.riskConfig,
      },
      repricingStepCredits: input.repricingStepCredits,
      tif: input.tif,
      account: input.account,
      clientOrderIdPrefix: input.clientOrderIdPrefix,
    });
  } finally {
    if (!input.repository && typeof repository.disconnect === 'function') {
      await repository.disconnect();
    }
  }
}
