
export const SECTOR_COLORS: Record<string, { bg: string, text: string, border: string }> = {
    'Technology': { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' },
    'Healthcare': { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' },
    'Financial Services': { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30' },
    'Consumer Cyclical': { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30' },
    'Consumer Defensive': { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30' },
    'Energy': { bg: 'bg-amber-600/20', text: 'text-amber-500', border: 'border-amber-600/30' },
    'Utilities': { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/30' },
    'Real Estate': { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30' },
    'Basic Materials': { bg: 'bg-emerald-600/20', text: 'text-emerald-500', border: 'border-emerald-600/30' },
    'Industrials': { bg: 'bg-pink-500/20', text: 'text-pink-400', border: 'border-pink-500/30' },
    'Communication Services': { bg: 'bg-violet-500/20', text: 'text-violet-400', border: 'border-violet-500/30' }
};

export const DEFAULT_COLOR = { bg: 'bg-neutral-700', text: 'text-gray-400', border: 'border-neutral-600' };

export function getSectorStyle(sector?: string) {
    if (!sector) return DEFAULT_COLOR;
    return SECTOR_COLORS[sector] || DEFAULT_COLOR;
}

export function getSectorColorClass(sector?: string) {
    const style = getSectorStyle(sector);
    return `${style.bg} ${style.text} ${style.border}`;
}
