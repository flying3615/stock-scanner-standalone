import type { CallCreditStrategySnapshot } from '../types';

interface StrategyMacroBarProps {
    snapshot: CallCreditStrategySnapshot;
}

function formatSignedPercent(value: number): string {
    return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}

export function StrategyMacroBar({ snapshot }: StrategyMacroBarProps) {
    const regime = snapshot.macro?.overallRegime ?? 'UNAVAILABLE';
    const regimeTone = regime === 'RISK_OFF'
        ? 'border-red-500/30 bg-red-950/40 text-red-200'
        : regime === 'RISK_ON'
            ? 'border-emerald-500/30 bg-emerald-950/40 text-emerald-200'
            : regime === 'CHOPPY'
                ? 'border-amber-500/30 bg-amber-950/40 text-amber-200'
                : 'border-neutral-700 bg-neutral-900/80 text-gray-200';

    return (
        <section className="grid grid-cols-1 gap-3 lg:grid-cols-[1.15fr_0.85fr_0.85fr_1fr]">
            <div id="strategy-regime" className={`rounded-3xl border p-5 ${regimeTone}`}>
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <p className="text-[11px] uppercase tracking-[0.24em] text-gray-400">Macro Regime</p>
                        <h2 className="mt-3 text-2xl font-semibold">{regime}</h2>
                    </div>
                    <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-gray-300">
                        {snapshot.candidates.length} setups
                    </div>
                </div>
                <p className="mt-3 text-sm text-gray-300">
                    Filters: ${snapshot.filters.minPrice}-${snapshot.filters.maxPrice} price range, {snapshot.filters.minVolume.toLocaleString()} minimum volume, {snapshot.filters.targetDteMin}-{snapshot.filters.targetDteMax} DTE.
                </p>
            </div>

            <div className="rounded-3xl border border-neutral-700 bg-neutral-900/80 p-5">
                <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">US Dollar</p>
                <div className="mt-3 flex items-end justify-between gap-3">
                    <div>
                        <div className="text-2xl font-semibold text-white">
                            {snapshot.macro ? snapshot.macro.dxy.price.toFixed(2) : '—'}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">{snapshot.macro?.dxy.symbol ?? 'N/A'}</div>
                    </div>
                    <div className={`text-right text-sm font-medium ${snapshot.macro?.dxy.trend === 'UP' ? 'text-red-300' : snapshot.macro?.dxy.trend === 'DOWN' ? 'text-emerald-300' : 'text-gray-400'}`}>
                        <div>{snapshot.macro?.dxy.trend ?? 'N/A'}</div>
                        <div className="mt-1 text-xs text-gray-500">
                            {snapshot.macro ? formatSignedPercent(snapshot.macro.dxy.changePercent) : '—'}
                        </div>
                    </div>
                </div>
            </div>

            <div className="rounded-3xl border border-neutral-700 bg-neutral-900/80 p-5">
                <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Volatility</p>
                <div className="mt-3 flex items-end justify-between gap-3">
                    <div>
                        <div className="text-2xl font-semibold text-white">
                            {snapshot.macro ? snapshot.macro.vix.price.toFixed(2) : '—'}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">{snapshot.macro?.vix.symbol ?? 'N/A'}</div>
                    </div>
                    <div className={`text-right text-sm font-medium ${snapshot.macro?.vix.status === 'RISING' ? 'text-red-300' : snapshot.macro?.vix.status === 'FALLING' ? 'text-emerald-300' : 'text-gray-400'}`}>
                        <div>{snapshot.macro?.vix.status ?? 'N/A'}</div>
                        <div className="mt-1 text-xs text-gray-500">
                            {snapshot.macro ? formatSignedPercent(snapshot.macro.vix.changePercent) : '—'}
                        </div>
                    </div>
                </div>
            </div>

            <div className="rounded-3xl border border-neutral-700 bg-neutral-900/80 p-5">
                <p className="text-[11px] uppercase tracking-[0.24em] text-gray-500">Execution Lens</p>
                <div className="mt-3 space-y-3 text-sm text-gray-300">
                    <div className="flex items-center justify-between">
                        <span>Actionable</span>
                        <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 font-medium text-emerald-300">
                            {snapshot.candidates.filter((candidate) => candidate.setupState === 'ACTIONABLE').length}
                        </span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span>Watchlist</span>
                        <span className="rounded-full bg-amber-500/10 px-2.5 py-1 font-medium text-amber-300">
                            {snapshot.candidates.filter((candidate) => candidate.setupState === 'WATCHLIST').length}
                        </span>
                    </div>
                    <div className="text-xs text-gray-500">
                        Updated {new Date(snapshot.generatedAt).toLocaleString()}
                    </div>
                </div>
            </div>
        </section>
    );
}
