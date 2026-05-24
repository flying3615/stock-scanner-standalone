import { translate, type Language } from '../i18n';
import type { CreditSpreadCandidate } from '../types';
import { formatCreditSpreadTemplateHorizon } from '../utils/callCredit';

interface CallCreditCandidateListProps {
    candidates: CreditSpreadCandidate[];
    selectedSymbol: string | null;
    onSelect: (candidate: CreditSpreadCandidate) => void;
    language: Language;
}

function formatSignedPercent(value: number): string {
    return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function formatVolume(value: number): string {
    if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
    return `${value}`;
}

export function CallCreditCandidateList({ candidates, selectedSymbol, onSelect, language }: CallCreditCandidateListProps) {
    const tx = (key: Parameters<typeof translate>[1]) => translate(language, key);
    const getAnchorLabel = (candidate: CreditSpreadCandidate) => candidate.anchorType === 'RESISTANCE' ? tx('resistance') : tx('support');

    if (candidates.length === 0) {
        return (
            <div className="rounded-3xl border border-dashed border-neutral-700 bg-neutral-900/70 p-6 text-sm text-gray-400">
                {tx('noCreditCandidates')}
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {candidates.map((candidate) => (
                (() => {
                    const selectedTone = candidate.setupState === 'ACTIONABLE'
                        ? candidate.direction === 'BULLISH'
                            ? 'border-emerald-400/70 bg-emerald-500/10 shadow-[0_0_0_1px_rgba(52,211,153,0.15)]'
                            : 'border-red-400/70 bg-red-500/10 shadow-[0_0_0_1px_rgba(248,113,113,0.15)]'
                        : 'border-neutral-400/40 bg-neutral-800/90 shadow-[0_0_0_1px_rgba(163,163,163,0.12)]';
                    const idleTone = candidate.setupState === 'ACTIONABLE'
                        ? candidate.direction === 'BULLISH'
                            ? 'border-emerald-500/20 bg-emerald-950/20 hover:border-emerald-400/40 hover:bg-emerald-950/30'
                            : 'border-red-500/20 bg-red-950/20 hover:border-red-400/40 hover:bg-red-950/30'
                        : 'border-neutral-700 bg-neutral-900/70 hover:border-neutral-500 hover:bg-neutral-900';

                    return (
                <button
                    id={`strategy-candidate-${candidate.symbol}`}
                    key={candidate.symbol}
                    type="button"
                    className={`w-full cursor-pointer rounded-3xl border p-4 text-left transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-400/70 ${
                        selectedSymbol === candidate.symbol
                            ? selectedTone
                            : idleTone
                    }`}
                    onClick={() => onSelect(candidate)}
                >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="text-lg font-semibold text-white">{candidate.symbol}</div>
                                <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                                    candidate.setupState === 'ACTIONABLE'
                                        ? 'bg-emerald-500/15 text-emerald-300'
                                        : 'bg-amber-500/15 text-amber-300'
                                }`}>
                                    {candidate.setupState === 'ACTIONABLE' ? tx('actionable') : tx('watchlist')}
                                </span>
                                <span className="rounded-full bg-neutral-800 px-2.5 py-1 text-[11px] text-gray-400">
                                    {tx('score')} {candidate.score.toFixed(1)}
                                </span>
                                <span className="rounded-full bg-neutral-800 px-2.5 py-1 text-[11px] text-gray-400">
                                    {candidate.strategyType === 'BEAR_CALL_CREDIT' ? tx('bearCall') : tx('bullPut')}
                                </span>
                            </div>
                            <div className="mt-1 text-sm text-gray-400">{candidate.name}</div>
                            <div className="mt-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                                <div className="rounded-2xl bg-black/20 px-3 py-2">
                                    <div className="text-[11px] uppercase tracking-[0.18em] text-gray-500">{tx('price')}</div>
                                    <div className="mt-1 font-mono text-white">${candidate.price.toFixed(2)}</div>
                                </div>
                                <div className="rounded-2xl bg-black/20 px-3 py-2">
                                    <div className="text-[11px] uppercase tracking-[0.18em] text-gray-500">{tx('change')}</div>
                                    <div className={`mt-1 font-mono ${candidate.changePercent <= 0 ? 'text-red-300' : 'text-emerald-300'}`}>
                                        {formatSignedPercent(candidate.changePercent)}
                                    </div>
                                </div>
                                <div className="rounded-2xl bg-black/20 px-3 py-2">
                                    <div className="text-[11px] uppercase tracking-[0.18em] text-gray-500">{tx('volume')}</div>
                                    <div className="mt-1 font-mono text-white">{formatVolume(candidate.volume)}</div>
                                </div>
                                <div className="rounded-2xl bg-black/20 px-3 py-2">
                                    <div className="text-[11px] uppercase tracking-[0.18em] text-gray-500">{getAnchorLabel(candidate)}</div>
                                    <div className="mt-1 font-mono text-white">${candidate.anchorLevel.toFixed(2)}</div>
                                </div>
                            </div>
                        </div>

                        <div className="w-full max-w-xs shrink-0 rounded-3xl border border-white/5 bg-black/20 p-4">
                            <div className="text-[11px] uppercase tracking-[0.18em] text-gray-500">{tx('template')}</div>
                            {candidate.spreadTemplate ? (
                                <div className="mt-3 space-y-2">
                                    <div className="text-2xl font-semibold text-white">
                                        {candidate.spreadTemplate.shortStrike}/{candidate.spreadTemplate.longStrike}
                                    </div>
                                    <div className="text-sm text-gray-400">
                                        {formatCreditSpreadTemplateHorizon(
                                            candidate.spreadTemplate.expiryISO,
                                            candidate.dte ?? candidate.spreadTemplate.dte,
                                        )} · {tx('credit')} {candidate.spreadTemplate.creditMid.toFixed(2)}
                                    </div>
                                    <div className="text-xs text-emerald-300">
                                        {tx('premiumEfficiency')} {(candidate.spreadTemplate.creditPctWidth * 100).toFixed(0)}%
                                    </div>
                                </div>
                            ) : (
                                <div className="mt-3 text-sm text-amber-300">
                                    {candidate.watchlistReasons[0] ?? tx('templatePending')}
                                </div>
                            )}
                        </div>
                    </div>
                </button>
                    );
                })()
            ))}
        </div>
    );
}
