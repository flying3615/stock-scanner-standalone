import type { CreditSpreadCandidate } from '../types';
import { formatCreditSpreadTemplateHorizon, getCreditSpreadAnchorLabel } from '../utils/callCredit';

interface CallCreditDetailPanelProps {
    candidate: CreditSpreadCandidate | null;
}

export function CallCreditDetailPanel({ candidate }: CallCreditDetailPanelProps) {
    if (!candidate) {
        return (
            <div className="rounded-[28px] border border-dashed border-neutral-700 bg-neutral-900/70 p-8">
                <div className="max-w-md">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Detail Panel</div>
                    <h3 className="mt-3 text-2xl font-semibold text-white">Select a setup</h3>
                    <p className="mt-2 text-sm leading-6 text-gray-400">
                        Choose a ranked candidate to inspect the short strike, long strike, credit target, stop plan, and invalidation level.
                    </p>
                </div>
            </div>
        );
    }

    const spread = candidate.spreadTemplate;

    return (
        <section className="rounded-[28px] border border-neutral-700 bg-neutral-900/85 p-6">
            <div className="flex flex-col gap-4 border-b border-neutral-800 pb-5 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-neutral-800 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-gray-400">
                            {candidate.setupState}
                        </span>
                        <span className="rounded-full bg-neutral-800 px-2.5 py-1 text-[11px] text-gray-400">
                            Score {candidate.score.toFixed(1)}
                        </span>
                        <span className="rounded-full bg-neutral-800 px-2.5 py-1 text-[11px] text-gray-400">
                            {candidate.strategyType === 'BEAR_CALL_CREDIT' ? 'Bear Call Credit' : 'Bull Put Credit'}
                        </span>
                    </div>
                    <h3 className="mt-3 text-3xl font-semibold text-white">{candidate.symbol}</h3>
                    <p className="mt-1 text-sm text-gray-400">{candidate.name}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-3xl border border-white/5 bg-black/20 px-4 py-3">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-gray-500">{getCreditSpreadAnchorLabel(candidate)}</div>
                        <div className="mt-1 font-mono text-xl text-white">${candidate.anchorLevel.toFixed(2)}</div>
                    </div>
                    <div className="rounded-3xl border border-white/5 bg-black/20 px-4 py-3">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Invalidation</div>
                        <div className="mt-1 font-mono text-xl text-white">${candidate.invalidationPrice.toFixed(2)}</div>
                    </div>
                </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-3xl bg-black/20 p-4">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Short Strike</div>
                    <div id="strategy-detail-short-strike" className="mt-2 text-2xl font-semibold text-white">
                        {spread ? spread.shortStrike : '—'}
                    </div>
                </div>
                <div className="rounded-3xl bg-black/20 p-4">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Long Strike</div>
                    <div className="mt-2 text-2xl font-semibold text-white">{spread ? spread.longStrike : '—'}</div>
                </div>
                <div className="rounded-3xl bg-black/20 p-4">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Net Credit</div>
                    <div id="strategy-detail-credit" className="mt-2 text-2xl font-semibold text-emerald-300">
                        {spread ? spread.creditMid.toFixed(2) : '—'}
                    </div>
                </div>
                <div className="rounded-3xl bg-black/20 p-4">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Take Profit / Stop</div>
                    <div className="mt-2 font-mono text-base text-white">
                        {spread ? `${spread.takeProfitAt.toFixed(2)} / ${spread.stopLossAt.toFixed(2)}` : '—'}
                    </div>
                </div>
                <div className="rounded-3xl bg-black/20 p-4">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Expiry</div>
                    <div className="mt-2 font-mono text-base text-white">
                        {spread ? formatCreditSpreadTemplateHorizon(spread.expiryISO, candidate.dte ?? spread.dte) : '—'}
                    </div>
                </div>
            </div>

            <div className="mt-6 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-3xl border border-neutral-800 bg-black/20 p-5">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Why It Ranks</div>
                    <div className="mt-4 flex flex-wrap gap-2">
                        {candidate.eventTags.length > 0 ? candidate.eventTags.map((tag) => (
                            <span key={tag} className="rounded-full bg-blue-500/10 px-2.5 py-1 text-xs text-blue-300">
                                {tag}
                            </span>
                        )) : (
                            <span className="rounded-full bg-neutral-800 px-2.5 py-1 text-xs text-gray-400">No event tags</span>
                        )}
                    </div>
                    <div className="mt-4 space-y-2">
                        {candidate.thesis.map((point) => (
                            <div key={point} className="rounded-2xl bg-neutral-900/80 px-3 py-2 text-sm text-gray-200">
                                {point}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="rounded-3xl border border-neutral-800 bg-black/20 p-5">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Execution Notes</div>
                    {spread ? (
                        <div className="mt-4 space-y-3 text-sm text-gray-300">
                            <div className="flex items-center justify-between rounded-2xl bg-neutral-900/80 px-3 py-2">
                                <span>Width</span>
                                <span className="font-mono text-white">{spread.width.toFixed(0)}</span>
                            </div>
                            <div className="flex items-center justify-between rounded-2xl bg-neutral-900/80 px-3 py-2">
                                <span>Leg Type</span>
                                <span className="font-mono text-white">{spread.shortLegType}</span>
                            </div>
                            <div className="flex items-center justify-between rounded-2xl bg-neutral-900/80 px-3 py-2">
                                <span>Short Delta</span>
                                <span className="font-mono text-white">{spread.shortDelta.toFixed(2)}</span>
                            </div>
                            <div className="flex items-center justify-between rounded-2xl bg-neutral-900/80 px-3 py-2">
                                <span>DTE</span>
                                <span className="font-mono text-white">{candidate.dte ?? spread.dte}</span>
                            </div>
                            <div className="flex items-center justify-between rounded-2xl bg-neutral-900/80 px-3 py-2">
                                <span>Premium Efficiency</span>
                                <span className="font-mono text-emerald-300">{(spread.creditPctWidth * 100).toFixed(0)}%</span>
                            </div>
                        </div>
                    ) : (
                        <div className="mt-4 space-y-2">
                            {candidate.watchlistReasons.map((reason) => (
                                <div key={reason} className="rounded-2xl bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                                    {reason}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}
