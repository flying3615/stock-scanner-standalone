import { useEffect, useState, type FormEvent } from 'react';
import { Languages, Search } from 'lucide-react';
import axios from 'axios';
import './App.css';
import type {
  CreditSpreadStrategySnapshot,
  CreditSpreadStrategyType,
  Stock,
  OptionSignal,
  StockSnapshot,
  MacroSnapshot,
  NewsItem,
  ShortTermSignalScore,
} from './types';
import { StockDetailModal } from './components/StockDetailModal';
import { MoneyFlowGauge } from './components/MoneyFlowGauge';
import { SectorStats } from './components/SectorStats';
import { SectorTrendRadar } from './components/SectorTrendRadar';
import { StrategyMacroBar } from './components/StrategyMacroBar';
import { CallCreditCandidateList } from './components/CallCreditCandidateList';
import { CallCreditDetailPanel } from './components/CallCreditDetailPanel';
import { getSectorColorClass } from './utils/sectorColors';
import {
  getDefaultSelectedCreditSpreadSymbol,
  getVisibleCreditSpreadCandidates,
  hasActionableCreditSpreadCandidates,
} from './utils/callCredit';
import { detectInitialLanguage, translate, translateIndustryName, translateMarketLabel, translateSectorName, type Language } from './i18n';

// API Base URL
const rawBase = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');
const API_URL = rawBase ? `${rawBase}/api` : '/api';

interface FinancialJuiceTokenStatus {
  configured: boolean;
  hasToken: boolean;
  obtainedAt?: number;
  softExpireAt?: number;
  hardExpireAt?: number;
  refreshFailures?: number;
  lastRefreshReason?: string;
  refreshedBy?: string;
  msToSoftExpire?: number;
  msToHardExpire?: number;
  likelyExpired?: boolean;
}

function App() {
  const [language, setLanguage] = useState<Language>(() => detectInitialLanguage());
  const [moversType, setMoversType] = useState<'active' | 'gainers' | 'losers'>('active');
  const [dashboardView, setDashboardView] = useState<'scanner' | 'radar' | 'strategies'>('scanner');
  const [movers, setMovers] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);
  const [optionsData, setOptionsData] = useState<{ signals: OptionSignal[], moneyFlowStrength: number, shortTermSignal?: ShortTermSignalScore } | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [macroData, setMacroData] = useState<MacroSnapshot | null>(null);
  const [macroLoading, setMacroLoading] = useState(false);
  const [strategyData, setStrategyData] = useState<CreditSpreadStrategySnapshot | null>(null);
  const [strategyLoading, setStrategyLoading] = useState(false);
  const [strategyError, setStrategyError] = useState<string | null>(null);
  const [selectedStrategyType, setSelectedStrategyType] = useState<CreditSpreadStrategyType>('BEAR_CALL_CREDIT');
  const [selectedStrategySymbol, setSelectedStrategySymbol] = useState<string | null>(null);
  const [showStrategyWatchlist, setShowStrategyWatchlist] = useState(false);

  // History State
  const [viewMode, setViewMode] = useState<'analysis' | 'history'>('analysis');
  const [historyData, setHistoryData] = useState<StockSnapshot[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [newsData, setNewsData] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState<string | null>(null);

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [newsTokenInput, setNewsTokenInput] = useState('');
  const [newsTokenStatus, setNewsTokenStatus] = useState<FinancialJuiceTokenStatus | null>(null);
  const [newsTokenLoading, setNewsTokenLoading] = useState(false);
  const [newsTokenSubmitting, setNewsTokenSubmitting] = useState(false);
  const [newsTokenMessage, setNewsTokenMessage] = useState<string | null>(null);
  const tx = (key: Parameters<typeof translate>[1]) => translate(language, key);

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    const symbol = searchQuery.toUpperCase();
    setIsSearching(true);

    try {
      const { data } = await axios.get(`${API_URL}/value/${symbol}`);

      // Map API response to Stock object
      // Note: The /value endpoint returns a ValueScore object which we enriched
      const stock: Stock = {
        symbol: data.symbol,
        name: data.name || data.symbol,
        price: data.price,
        changePercent: data.changePercent || 0,
        volume: data.volume || 0,
        valueScore: data.score,
        valueMetrics: data.metrics,
        sector: data.sector,
        industry: data.industry,
        thresholds: data.thresholds,
        reasons: data.reasons,
        stockQuality: data.stockQuality
      };

      handleStockClick(stock);
      setSearchQuery(''); // Clear search
    } catch (err) {
      console.error('Search failed', err);
      alert(`${tx('searchNotFound')}: ${symbol}`);
    } finally {
      setIsSearching(false);
    }
  };

  // Load movers on mount or type change
  useEffect(() => {
    fetchMovers();
  }, [moversType]);

  useEffect(() => {
    fetchMacro();
    const interval = setInterval(fetchMacro, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetchNewsTokenStatus();
  }, []);

  useEffect(() => {
    window.localStorage.setItem('stock-scanner-language', language);
  }, [language]);

  useEffect(() => {
    if (dashboardView === 'strategies' && !strategyLoading && (!strategyData || strategyData.strategyType !== selectedStrategyType)) {
      void fetchStrategySnapshot(selectedStrategyType);
    }
  }, [dashboardView, selectedStrategyType, strategyData, strategyLoading]);

  const fetchMovers = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API_URL}/movers`, {
        params: { type: moversType, limit: 20 }
      });
      setMovers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMacro = async () => {
    setMacroLoading(true);
    try {
      const { data } = await axios.get(`${API_URL}/macro`);
      setMacroData(data);
    } catch (err) {
      console.error('[Macro] Failed to load macro snapshot', err);
    } finally {
      setMacroLoading(false);
    }
  };

  const fetchNewsTokenStatus = async () => {
    setNewsTokenLoading(true);
    try {
      const { data } = await axios.get<FinancialJuiceTokenStatus>(`${API_URL}/news/token/status`);
      setNewsTokenStatus(data);
    } catch (err) {
      console.error('[News] Failed to load token status', err);
      setNewsTokenStatus(null);
    } finally {
      setNewsTokenLoading(false);
    }
  };

  const fetchStrategySnapshot = async (strategyType = selectedStrategyType) => {
    setStrategyLoading(true);
    setStrategyError(null);
    try {
      const { data } = await axios.get<CreditSpreadStrategySnapshot>(`${API_URL}/strategies/credit-spreads`, {
        params: { strategyType }
      });
      setStrategyData(data);
      setShowStrategyWatchlist(false);
      setSelectedStrategySymbol(getDefaultSelectedCreditSpreadSymbol(data.candidates, false));
    } catch (err) {
      console.error('[Strategies] Failed to load credit spread snapshot', err);
      setStrategyData(null);
      setStrategyError('Failed to load credit spread strategy snapshot.');
    } finally {
      setStrategyLoading(false);
    }
  };

  const handleNewsTokenSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const token = newsTokenInput.trim();
    if (!token) {
      return;
    }

    setNewsTokenSubmitting(true);
    setNewsTokenMessage(null);
    try {
      await axios.post(`${API_URL}/news/token`, { token });
      setNewsTokenInput('');
      setNewsTokenMessage(tx('tokenUpdated'));
      await fetchNewsTokenStatus();
    } catch (err) {
      console.error('[News] Failed to set token', err);
      setNewsTokenMessage(tx('tokenSetFailed'));
    } finally {
      setNewsTokenSubmitting(false);
    }
  };

  const handleNewsTokenClear = async () => {
    setNewsTokenSubmitting(true);
    setNewsTokenMessage(null);
    try {
      await axios.delete(`${API_URL}/news/token`);
      setNewsTokenMessage(tx('tokenCleared'));
      await fetchNewsTokenStatus();
    } catch (err) {
      console.error('[News] Failed to clear token', err);
      setNewsTokenMessage(tx('tokenClearFailed'));
    } finally {
      setNewsTokenSubmitting(false);
    }
  };

  const handleStockClick = (stock: Stock) => {
    setSelectedStock(stock);
    setOptionsData(null);
    setHistoryData([]); // Reset history data to avoid flashing old data from previous stock
    setNewsData([]);
    setNewsError(null);
    setViewMode('analysis'); // Reset to analysis view

    setOptionsLoading(true);
    setHistoryLoading(true);
    setNewsLoading(true);

    // Fetch current options data
    void (async () => {
      try {
        const { data } = await axios.get(`${API_URL}/options/${stock.symbol}`);
        setOptionsData(data);
      } catch (err) {
        console.error(err);
      } finally {
        setOptionsLoading(false);
      }
    })();

    // Fetch history in background
    void (async () => {
      try {
        const { data } = await axios.get(`${API_URL}/history/${stock.symbol}`);
        setHistoryData(data);
      } catch (err) {
        console.error(err);
      } finally {
        setHistoryLoading(false);
      }
    })();

    // Fetch related news in background
    void (async () => {
      try {
        const { data } = await axios.get(`${API_URL}/news/search/${stock.symbol}`, {
          params: { limit: 20 }
        });
        const items = Array.isArray(data?.items) ? data.items as NewsItem[] : [];
        setNewsData(items);
      } catch (err) {
        console.error('[News] Failed to load symbol news', err);
        setNewsError(tx('newsFailed'));
      } finally {
        setNewsLoading(false);
      }
    })();
  };

  const visibleStrategyCandidates = strategyData
    ? getVisibleCreditSpreadCandidates(strategyData.candidates, showStrategyWatchlist)
    : [];
  const hasActionableStrategies = hasActionableCreditSpreadCandidates(strategyData?.candidates ?? []);
  const selectedStrategyCandidate =
    visibleStrategyCandidates.find((candidate) => candidate.symbol === selectedStrategySymbol)
    ?? visibleStrategyCandidates[0]
    ?? null;

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 font-sans p-4 sm:p-6">
      {dashboardView !== 'strategies' && macroData && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4 text-sm">
          <div id="macro-dxy" className="bg-slate-900/70 border border-slate-700/50 rounded-xl p-4 flex items-center justify-between shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <div>
              <p className="text-xs uppercase text-slate-500">{tx('macroDxy')}</p>
              <p className="text-2xl font-semibold">{macroData.dxy.price.toFixed(2)}</p>
            </div>
            <div className={`text-sm font-bold ${macroData.dxy.trend === 'UP' ? 'text-red-400' : macroData.dxy.trend === 'DOWN' ? 'text-green-400' : 'text-gray-400'}`}>
              {translateMarketLabel(language, macroData.dxy.trend)}
            </div>
          </div>
          <div id="macro-vix" className="bg-slate-900/70 border border-slate-700/50 rounded-xl p-4 flex items-center justify-between shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <div>
              <p className="text-xs uppercase text-slate-500">{tx('macroVix')}</p>
              <p className="text-2xl font-semibold">{macroData.vix.price.toFixed(2)}</p>
            </div>
            <div className={`text-sm font-bold ${macroData.vix.status === 'RISING' ? 'text-red-400' : macroData.vix.status === 'FALLING' ? 'text-green-400' : 'text-gray-400'}`}>
              {translateMarketLabel(language, macroData.vix.status)}
            </div>
          </div>
          <div className="bg-slate-900/70 border border-slate-700/50 rounded-xl p-4 flex flex-col justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <p className="text-xs uppercase text-slate-500">{tx('macroRegime')}</p>
            <p className="text-2xl font-semibold text-white" id="macro-regime">
              {translateMarketLabel(language, macroData.overallRegime)}
            </p>
            {macroLoading && <span className="text-[10px] text-slate-500">{tx('refreshing')}</span>}
          </div>
        </div>
      )}
      <header className="mb-8 flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">
            {tx('appTitle')}
          </h1>
          <p className="text-slate-400 text-sm mt-1">{tx('appSubtitle')}</p>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="relative xl:mx-4">
          <input
            type="text"
            placeholder={tx('searchPlaceholder')}
            className="min-h-11 w-full rounded-full border border-slate-700 bg-slate-900/90 py-2 pl-10 pr-4 text-sm text-slate-100 placeholder:text-slate-600 transition-all focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/20 xl:w-72"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            disabled={isSearching}
          />
          <Search className="absolute left-3 top-3 text-slate-500" size={16} />
          {isSearching && (
            <div className="absolute right-3 top-3 animate-spin rounded-full h-4 w-4 border-2 border-emerald-500 border-t-transparent"></div>
          )}
        </form>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex rounded-xl border border-slate-800 bg-slate-900/80 p-1">
            <button
              onClick={() => setDashboardView('scanner')}
              className={`min-h-10 rounded-lg px-3 py-1.5 text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-emerald-400/30 ${dashboardView === 'scanner' ? 'bg-emerald-500/15 text-emerald-200 shadow' : 'text-slate-400 hover:text-white'}`}
            >
              {tx('scanner')}
            </button>
            <button
              onClick={() => setDashboardView('radar')}
              className={`min-h-10 rounded-lg px-3 py-1.5 text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-emerald-400/30 ${dashboardView === 'radar' ? 'bg-emerald-500/15 text-emerald-200 shadow' : 'text-slate-400 hover:text-white'}`}
            >
              {tx('marketRadar')}
            </button>
            <button
              onClick={() => setDashboardView('strategies')}
              className={`min-h-10 rounded-lg px-3 py-1.5 text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-emerald-400/30 ${dashboardView === 'strategies' ? 'bg-emerald-500/15 text-emerald-200 shadow' : 'text-slate-400 hover:text-white'}`}
            >
              {tx('strategies')}
            </button>
          </div>

          <div className="flex min-h-11 items-center gap-1 rounded-xl border border-slate-800 bg-slate-900/80 p-1 text-sm">
            <Languages size={16} className="ml-2 text-slate-500" aria-hidden="true" />
            {(['en', 'zh'] as const).map((item) => (
              <button
                key={item}
                type="button"
                aria-label={`${tx('languageLabel')}: ${item}`}
                className={`min-h-9 rounded-lg px-3 font-medium transition focus:outline-none focus:ring-2 focus:ring-emerald-400/30 ${language === item ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
                onClick={() => setLanguage(item)}
              >
                {item === 'en' ? 'EN' : '中文'}
              </button>
            ))}
          </div>

          {dashboardView === 'scanner' && (
            <div className="flex gap-2">
              {(['active', 'gainers', 'losers'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setMoversType(type)}
                  className={`min-h-10 rounded-lg px-4 py-2 text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-emerald-400/30 ${moversType === type
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20'
                    : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
                    }`}
                >
                  {tx(type)}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-200">{tx('tokenTitle')}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              <span className={`px-2 py-0.5 rounded border ${newsTokenStatus?.hasToken ? 'border-green-500/40 text-green-400' : 'border-yellow-500/40 text-yellow-300'}`}>
                {newsTokenStatus?.hasToken ? tx('tokenReady') : tx('tokenMissing')}
              </span>
              {newsTokenStatus?.hardExpireAt && (
                <span className="text-slate-400">
                  {tx('tokenHardExpire')}: {new Date(newsTokenStatus.hardExpireAt).toLocaleString()}
                </span>
              )}
              {newsTokenLoading && <span className="text-slate-500">{tx('refreshing')}</span>}
            </div>
            {newsTokenMessage && (
              <p className="mt-1 text-xs text-sky-300">{newsTokenMessage}</p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-2 xl:min-w-[540px]">
            <form onSubmit={handleNewsTokenSubmit} className="flex-1 flex gap-2">
              <input
                type="password"
                placeholder={tx('tokenPlaceholder')}
                className="min-h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/20"
                value={newsTokenInput}
                onChange={(e) => setNewsTokenInput(e.target.value)}
                disabled={newsTokenSubmitting}
              />
              <button
                type="submit"
                className="min-h-11 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/30 disabled:opacity-60"
                disabled={newsTokenSubmitting || !newsTokenInput.trim()}
              >
                {tx('save')}
              </button>
            </form>
            <button
              onClick={() => void fetchNewsTokenStatus()}
              className="min-h-11 rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-slate-100 transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400/30 disabled:opacity-60"
              disabled={newsTokenSubmitting || newsTokenLoading}
            >
              {tx('refresh')}
            </button>
            <button
              onClick={handleNewsTokenClear}
              className="min-h-11 rounded-lg bg-red-600/80 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-500/80 focus:outline-none focus:ring-2 focus:ring-red-400/30 disabled:opacity-60"
              disabled={newsTokenSubmitting}
            >
              {tx('clear')}
            </button>
          </div>
        </div>
      </section>

      {/* Main Content */}
      {dashboardView === 'strategies' ? (
        <div className="space-y-6 animate-in fade-in duration-500">
          {strategyLoading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-400"></div>
            </div>
          ) : strategyError ? (
            <div className="rounded-[28px] border border-red-500/30 bg-red-950/30 p-6">
              <h2 className="text-xl font-semibold text-white">{tx('strategyUnavailable')}</h2>
              <p className="mt-2 text-sm text-red-100/80">{strategyError}</p>
              <button
                type="button"
                className="mt-4 rounded-full bg-white px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-emerald-200"
                onClick={() => void fetchStrategySnapshot(selectedStrategyType)}
              >
                {tx('retrySnapshot')}
              </button>
            </div>
          ) : strategyData ? (
            <>
              <StrategyMacroBar snapshot={strategyData} language={language} />
              <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
                <div className="space-y-4">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-semibold text-white">
                        {selectedStrategyType === 'BEAR_CALL_CREDIT' ? tx('bearCall') : tx('bullPut')} {tx('strategyCandidates')}
                      </h2>
                      <p className="mt-1 text-sm text-gray-400">
                        {hasActionableStrategies && !showStrategyWatchlist
                          ? tx('actionableHelp')
                          : selectedStrategyType === 'BEAR_CALL_CREDIT'
                            ? tx('bearHelp')
                            : tx('bullHelp')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex rounded-full border border-neutral-700 bg-neutral-900 p-1">
                        {(['BEAR_CALL_CREDIT', 'BULL_PUT_CREDIT'] as const).map((strategyType) => (
                          <button
                            key={strategyType}
                            type="button"
                            className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                              selectedStrategyType === strategyType
                                ? strategyType === 'BEAR_CALL_CREDIT'
                                  ? 'bg-red-500/15 text-red-200'
                                  : 'bg-emerald-500/15 text-emerald-200'
                                : 'text-gray-400 hover:text-white'
                            }`}
                            onClick={() => {
                              setSelectedStrategyType(strategyType);
                              setStrategyData(null);
                              setSelectedStrategySymbol(null);
                              setShowStrategyWatchlist(false);
                            }}
                          >
                            {strategyType === 'BEAR_CALL_CREDIT' ? tx('bearCall') : tx('bullPut')}
                          </button>
                        ))}
                      </div>
                      {hasActionableStrategies && (
                        <button
                          type="button"
                          className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                            showStrategyWatchlist
                              ? 'border-amber-400/40 bg-amber-500/10 text-amber-200 hover:border-amber-300/60'
                              : 'border-neutral-700 bg-neutral-900 text-gray-200 hover:border-emerald-400/50 hover:text-white'
                          }`}
                          onClick={() => {
                            const nextShowWatchlist = !showStrategyWatchlist;
                            setShowStrategyWatchlist(nextShowWatchlist);
                            if (strategyData) {
                              setSelectedStrategySymbol(
                                getDefaultSelectedCreditSpreadSymbol(strategyData.candidates, nextShowWatchlist),
                              );
                            }
                          }}
                        >
                          {showStrategyWatchlist ? tx('actionableOnly') : tx('showWatchlist')}
                        </button>
                      )}
                      <button
                        type="button"
                        className="rounded-full border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm font-medium text-gray-200 transition hover:border-emerald-400/50 hover:text-white"
                        onClick={() => void fetchStrategySnapshot(selectedStrategyType)}
                      >
                        {tx('refresh')}
                      </button>
                    </div>
                  </div>

                  {!hasActionableStrategies && strategyData && (
                    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                      {tx('noActionableSetups')}
                    </div>
                  )}

                  <CallCreditCandidateList
                    candidates={visibleStrategyCandidates}
                    selectedSymbol={selectedStrategyCandidate?.symbol ?? null}
                    language={language}
                    onSelect={(candidate) => setSelectedStrategySymbol(candidate.symbol)}
                  />
                </div>

                <div className="space-y-4">
                  <CallCreditDetailPanel candidate={selectedStrategyCandidate} language={language} />

                  <section className="rounded-[28px] border border-neutral-700 bg-neutral-900/85 p-6">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-gray-500">{tx('riskChecklist')}</div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="rounded-2xl bg-black/20 p-4 text-sm text-gray-300">
                        {tx('riskCard1')}
                      </div>
                      <div className="rounded-2xl bg-black/20 p-4 text-sm text-gray-300">
                        {tx('riskCard2')}
                      </div>
                      <div className="rounded-2xl bg-black/20 p-4 text-sm text-gray-300">
                        {tx('riskCard3')}
                      </div>
                      <div className="rounded-2xl bg-black/20 p-4 text-sm text-gray-300">
                        {selectedStrategyType === 'BEAR_CALL_CREDIT'
                          ? tx('riskCardBear')
                          : tx('riskCardBull')}
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-[28px] border border-dashed border-neutral-700 bg-neutral-900/70 p-6 text-sm text-gray-400">
              {tx('noStrategySnapshot')}
            </div>
          )}
        </div>
      ) : dashboardView === 'radar' ? (
        <div className="animate-in fade-in duration-500">
          <h2 className="text-xl font-bold mb-4 text-gray-300">{tx('sectorStrategyTitle')}</h2>
          <SectorTrendRadar apiUrl={API_URL} language={language} />
        </div>
      ) : (
        loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          </div>
        ) : (
          <>
            {macroData && macroData.indices.length > 0 && (
              <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                {macroData.indices.map((idx) => {
                  const scoreId = idx.symbol === '^IXIC' ? 'macro-ns-score' : idx.symbol === '^GSPC' ? 'macro-sp-score' : undefined;
                  return (
                    <div key={idx.symbol} className="bg-neutral-800/40 border border-neutral-700/40 rounded-xl p-4 shadow-inner">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <h3 className="text-lg font-semibold text-white">{idx.label}</h3>
                          <p className="text-xs text-gray-500">{idx.symbol}</p>
                        </div>
                        <span className={`text-[10px] font-semibold px-2 py-1 rounded border ${idx.regime.includes('BULLISH') ? 'border-green-500/40 text-green-400' : idx.regime.includes('BEARISH') ? 'border-red-500/40 text-red-400' : 'border-yellow-500/30 text-yellow-300'}`}>
                          {translateMarketLabel(language, idx.regime)}
                        </span>
                      </div>
                      <div className="flex items-end justify-between">
                        <div>
                          <p className="text-2xl font-bold text-white">{idx.price.toFixed(2)}</p>
                          <p className={`text-sm ${idx.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {idx.changePercent >= 0 ? '+' : ''}{idx.changePercent.toFixed(2)}%
                          </p>
                        </div>
                        <div className="text-sm text-gray-400" id={scoreId}>
                          {tx('scoreLabel')}: {idx.score.toFixed(1)}/6
                        </div>
                      </div>
                      <div className="mt-4 flex items-center gap-4">
                        <div className="flex-1">
                          <MoneyFlowGauge value={idx.mfi} small />
                        </div>
                        <div className="text-xs text-gray-500">
                          MFI
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <SectorStats stocks={movers} language={language} />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {movers.map(stock => (
                <div
                  key={stock.symbol}
                  onClick={() => handleStockClick(stock)}
                  className="group relative cursor-pointer overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/70 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur transition-all hover:-translate-y-0.5 hover:border-emerald-500/40 hover:bg-slate-800/70 focus-within:border-emerald-500/40"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="text-xl font-bold text-white group-hover:text-blue-400 transition-colors">{stock.symbol}</h3>
                      <p className="text-xs text-gray-500 truncate max-w-[150px]">{stock.name}</p>
                      {stock.industry && (
                        <p className="text-[10px] text-gray-600 truncate max-w-[150px] mt-0.5" title={stock.industry}>
                          {translateIndustryName(language, stock.industry)}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <div className={`text-right ${stock.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        <div className="text-lg font-mono font-semibold">${stock.price.toFixed(2)}</div>
                        <div className="text-xs">{stock.changePercent > 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%</div>
                      </div>
                      {stock.sector && (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded border truncate max-w-[120px] ${getSectorColorClass(stock.sector)}`} title={stock.sector}>
                          {translateSectorName(language, stock.sector)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Footer Row: Score | MFI Gauge | Vol */}
                  <div className="mt-4 flex items-end gap-3 h-8">
                    {/* Score */}
                    <div className="shrink-0 flex items-center">
                      <div className={`
                                    px-2 py-0.5 rounded text-xs font-bold h-fit
                                    ${stock.stockQuality && stock.stockQuality.score >= 75 ? 'bg-green-500/20 text-green-400' :
                          stock.stockQuality && stock.stockQuality.score >= 55 ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-red-500/20 text-red-400'}
                                 `}>
                        {tx('quality')}: {stock.stockQuality?.score ?? 'N/A'}
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center">
                      <div className={`
                                    px-2 py-0.5 rounded text-xs font-bold h-fit
                                    ${stock.shortTermSignal && stock.shortTermSignal.score >= 70 ? 'bg-cyan-500/20 text-cyan-300' :
                          stock.shortTermSignal && stock.shortTermSignal.score >= 45 ? 'bg-sky-500/20 text-sky-300' :
                            'bg-neutral-700/60 text-neutral-400'}
                                 `}>
                        {tx('signal')}: {stock.shortTermSignal?.score ?? 'N/A'}
                      </div>
                    </div>

                    {/* MFI Gauge (Middle) */}
                    <div className="flex-1 min-w-0 pb-0.5">
                      {stock.moneyFlowStrength !== undefined && (
                        <MoneyFlowGauge value={stock.moneyFlowStrength ?? 0} small />
                      )}
                    </div>

                    {/* Vol */}
                    <div className="shrink-0 text-xs text-neutral-500 pb-0.5">
                      {tx('volume')}: {(stock.volume / 1000000).toFixed(1)}M
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )
      )}

      {/* Detail Modal */}
      {selectedStock && (
        <StockDetailModal
          selectedStock={selectedStock}
          language={language}
          onClose={() => setSelectedStock(null)}
          viewMode={viewMode}
          setViewMode={setViewMode}
          optionsLoading={optionsLoading}
          optionsData={optionsData}
          historyLoading={historyLoading}
          historyData={historyData}
          newsLoading={newsLoading}
          newsData={newsData}
          newsError={newsError}
        />
      )}
    </div>
  );
}

export default App;
