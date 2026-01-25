

export function MoneyFlowGauge({ value, small = false }: { value: number, small?: boolean }) {
    // Clamp value between -1 and 1
    const clamped = Math.max(-1, Math.min(1, value));
    // Convert -1..1 to 0..100%
    const percent = ((clamped + 1) / 2) * 100;

    if (small) {
        return (
            <div className="w-full h-full flex flex-col justify-end">
                {/* Value Label (Tiny, centered or right aligned) */}
                <div className="flex justify-between items-end mb-0.5 px-1">
                    <span className="text-[8px] text-gray-600 uppercase tracking-wider">MFI</span>
                    <span className={`text-[9px] font-bold font-mono leading-none ${value > 0.05 ? 'text-green-400' : value < -0.05 ? 'text-red-400' : 'text-gray-400'}`}>
                        {value > 0 ? '+' : ''}{value.toFixed(2)}
                    </span>
                </div>

                {/* Bar */}
                <div className="relative h-1 bg-neutral-700/50 rounded-full w-full overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-red-500/60 via-neutral-500/20 to-green-500/60"></div>
                    {/* Center Marker */}
                    <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/20 transform -translate-x-1/2"></div>
                    <div
                        className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_4px_rgba(255,255,255,0.8)]"
                        style={{ left: `${percent}%` }}
                    ></div>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full">
            <div className="flex justify-between items-end mb-2">
                <span className="text-xs text-gray-400">Money Flow Strength</span>
                <span className={`text-lg font-bold font-mono ${value > 0.05 ? 'text-green-400' : value < -0.05 ? 'text-red-400' : 'text-gray-400'}`}>
                    {value > 0 ? '+' : ''}{value.toFixed(2)}
                </span>
            </div>

            <div className="relative h-1.5 bg-neutral-800 rounded-full w-full">
                {/* Gradient Background */}
                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-red-500/80 via-neutral-600/30 to-green-500/80"></div>

                {/* Center Marker */}
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/30 transform -translate-x-1/2"></div>

                {/* Needle/Marker */}
                <div
                    className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white border-2 border-neutral-900 rounded-full shadow-[0_0_10px_rgba(255,255,255,0.5)] transition-all duration-500 ease-out"
                    style={{ left: `${percent}%`, transform: 'translate(-50%, -50%)' }}
                ></div>
            </div>

            <div className="flex justify-between text-[10px] text-gray-600 mt-1 font-mono">
                <span>bear (-1)</span>
                <span>neutral</span>
                <span>bull (+1)</span>
            </div>
        </div>
    );
}
