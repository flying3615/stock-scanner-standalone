import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance();
import { timeout } from '../util.js';

const EARNINGS_TIMEOUT_MS = 5000;

/**
 * Get days until earnings announcement for a symbol.
 * Uses Yahoo Finance quoteSummary API to fetch calendar events.
 * @param symbol Stock ticker symbol
 * @returns Days until earnings, or null if not available
 */
export async function getDaysToEarnings(
    symbol: string
): Promise<number | null> {
    try {
        const summary = await timeout(
            EARNINGS_TIMEOUT_MS,
            yahooFinance.quoteSummary(symbol, {
                modules: ['calendarEvents'],
            })
        );

        const earningsDateRaw =
            summary?.calendarEvents?.earnings?.earningsDate;

        // earningsDate can be a Date, Date[], or undefined
        const earningsDate = Array.isArray(earningsDateRaw)
            ? earningsDateRaw[0]
            : earningsDateRaw;

        if (!earningsDate) {
            return null;
        }

        const earningsDateObj =
            earningsDate instanceof Date ? earningsDate : new Date(earningsDate);

        if (isNaN(earningsDateObj.getTime())) {
            return null;
        }

        const now = new Date();
        const diffMs = earningsDateObj.getTime() - now.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        // Return null if earnings date is in the past
        return diffDays >= 0 ? diffDays : null;
    } catch (error) {
        // Silently fail and return null for earnings lookup failures
        return null;
    }
}

/**
 * Check if a symbol is near earnings (within specified days).
 * @param symbol Stock ticker symbol  
 * @param withinDays Days threshold (default 7)
 * @returns true if earnings is within the specified number of days
 */
export async function isNearEarnings(
    symbol: string,
    withinDays: number = 7
): Promise<boolean> {
    const days = await getDaysToEarnings(symbol);
    return days !== null && days <= withinDays;
}
