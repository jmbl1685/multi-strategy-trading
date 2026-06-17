import type { Candle, Interval } from '../types'
import type { BinanceSource } from './binanceSource'
import { FUTURES_SOURCE, SOURCE_CHAIN, getPreferredSource, orderedSources } from './binanceSource'
import { restBlocked, restCooldownMs, noteRestOk, noteRestFail, noteRestBannedUntil, parseBanUntil, throttled } from './binanceCooldown'
import { fetchKlinesWs } from './binanceWsApi'

type RawKline = [
    number, // open time
    string, // open
    string, // high
    string, // low
    string, // close
    string, // volume
    number, // close time
    string, // quote asset volume
    number, // trades
    string, // taker buy base
    string, // taker buy quote
    string // ignore
]

const toCandle = (k: RawKline): Candle => ({
    openTime: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
    closed: true
})

/** Fetch historical klines from the given source to seed the indicator series. */
export const fetchKlines = async (
    symbol: string,
    interval: Interval,
    limit = 300,
    source: BinanceSource = FUTURES_SOURCE
): Promise<Candle[]> => {
    if (restBlocked()) {
        throw new Error(`Binance cooling down — retry in ${Math.ceil(restCooldownMs() / 1000)}s`)
    }
    const url = `${source.restBase}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
    return throttled(async () => {
        // Re-check after waiting in the throttle queue — the ban may have landed.
        if (restBlocked()) {
            throw new Error(`Binance cooling down — retry in ${Math.ceil(restCooldownMs() / 1000)}s`)
        }
        try {
            const res = await fetch(url)
            if (!res.ok) {
                // fapi sends CORS headers, so we can read the ban body and honor
                // the exact unban time; otherwise fall back to the blind streak.
                const body = await res.json().catch(() => null)
                const until = parseBanUntil(body?.msg)
                if (until) noteRestBannedUntil(until)
                else if (res.status === 418 || res.status === 429) noteRestFail()
                throw new Error(body?.msg ?? `Binance ${source.id} REST error ${res.status} for ${symbol}`)
            }
            const data: RawKline[] = await res.json()
            noteRestOk()
            return data.map(toCandle)
        } catch (err) {
            // A CORS-masked ban (spot host) surfaces as TypeError ("Failed to fetch").
            if (err instanceof TypeError) noteRestFail()
            throw err
        }
    })
}

/**
 * Klines for one source, preferring the WebSocket API (no REST weight, dodges IP
 * bans) and falling back to REST only if the WS API is blocked/unavailable.
 */
export const fetchKlinesVia = async (
    symbol: string,
    interval: Interval,
    limit: number,
    source: BinanceSource = FUTURES_SOURCE
): Promise<Candle[]> => {
    try {
        return await fetchKlinesWs(symbol, interval, limit, source)
    } catch {
        return await fetchKlines(symbol, interval, limit, source)
    }
}

/** Fetch klines walking the source chain, so futures-only symbols still resolve. */
export const fetchKlinesResilient = async (
    symbol: string,
    interval: Interval,
    limit = 1000
): Promise<Candle[]> => {
    const sources = orderedSources(getPreferredSource())
    let lastError: unknown = null
    for (const source of sources) {
        try {
            return await fetchKlines(symbol, interval, limit, source)
        } catch (err) {
            lastError = err
        }
    }
    throw lastError ?? new Error(`No source served ${symbol}`)
}

/** True if the symbol is tradable on at least one supported source. */
export const symbolExists = async (symbol: string): Promise<boolean> => {
    const checks = SOURCE_CHAIN.map(async (source) => {
        try {
            const res = await fetch(`${source.restBase}/ticker/price?symbol=${symbol}`)
            return res.ok
        } catch {
            return false
        }
    })
    const results = await Promise.all(checks)
    return results.some(Boolean)
}
