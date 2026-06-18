import type { Candle, Indicators, SignalReason } from '../types'
import type { StrategyParams } from './params'
import type { StrategyResult } from '../strategies/types'
import { planFromAnchor, waitResult } from './plan'

const ATR_PERIOD = 10
const MULT = 3
const MAX_FLIP_AGO = 2 // only act on a recent flip, not mid-trend

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

interface ST {
    dir: 1 | -1
    line: number
    flipAgo: number
}

/** Supertrend line + direction, with how many bars ago it last flipped. */
const supertrend = (candles: Candle[]): ST | null => {
    const n = candles.length
    if (n < ATR_PERIOD + 3) return null
    const hl2 = candles.map((c) => (c.high + c.low) / 2)

    const tr = new Array<number>(n).fill(0)
    for (let i = 1; i < n; i++) {
        const c = candles[i]
        const p = candles[i - 1]
        tr[i] = Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close))
    }
    const atr = new Array<number>(n).fill(NaN)
    let seed = 0
    for (let i = 1; i <= ATR_PERIOD; i++) seed += tr[i]
    atr[ATR_PERIOD] = seed / ATR_PERIOD
    for (let i = ATR_PERIOD + 1; i < n; i++) atr[i] = (atr[i - 1] * (ATR_PERIOD - 1) + tr[i]) / ATR_PERIOD

    const upper = new Array<number>(n).fill(NaN)
    const lower = new Array<number>(n).fill(NaN)
    const st = new Array<number>(n).fill(NaN)
    const dir = new Array<1 | -1>(n).fill(1)

    for (let i = ATR_PERIOD; i < n; i++) {
        const ub = hl2[i] + MULT * atr[i]
        const lb = hl2[i] - MULT * atr[i]
        if (i === ATR_PERIOD) {
            upper[i] = ub
            lower[i] = lb
            dir[i] = candles[i].close > ub ? 1 : -1
            st[i] = dir[i] === 1 ? lb : ub
            continue
        }
        upper[i] = ub < upper[i - 1] || candles[i - 1].close > upper[i - 1] ? ub : upper[i - 1]
        lower[i] = lb > lower[i - 1] || candles[i - 1].close < lower[i - 1] ? lb : lower[i - 1]
        // Flip when price crosses the active band.
        const wasDown = st[i - 1] === upper[i - 1]
        dir[i] = wasDown ? (candles[i].close > upper[i] ? 1 : -1) : candles[i].close < lower[i] ? -1 : 1
        st[i] = dir[i] === 1 ? lower[i] : upper[i]
    }

    const last = n - 1
    let k = last
    while (k > ATR_PERIOD && dir[k - 1] === dir[last]) k--
    return { dir: dir[last], line: st[last], flipAgo: last - k }
}

/**
 * Supertrend — an ATR band that flips with the trend. Take the flip:
 *   LONG when price flips above the line, SHORT when it flips below, with the
 * line itself as the (trailing) stop. Acts only on a fresh flip so it enters the
 * trend early rather than chasing one that's been running for many bars.
 */
export const supertrendResult = (ind: Indicators, candles: Candle[], params: StrategyParams): StrategyResult => {
    const st = supertrend(candles)
    if (!st) return waitResult('Not enough data for Supertrend')
    const fresh = st.flipAgo <= MAX_FLIP_AGO

    if (st.dir === 1 && fresh) {
        const plan = planFromAnchor(ind, 'LONG', st.line, params.stopCushionAtr, 'Supertrend line')
        const reasons: SignalReason[] = [
            { label: 'Supertrend flipped up — trend turned bullish', direction: 'bull', weight: 3 },
            { label: 'Trailing stop sits on the Supertrend line', direction: 'bull', weight: 1 }
        ]
        if (ind.price > ind.ema55) reasons.push({ label: 'Price above the 55-EMA — aligned with the trend', direction: 'bull', weight: 2 })
        const confidence = clamp(60 + (ind.price > ind.ema55 ? 12 : 0) + clamp(ind.ema10Slope * 30, 0, 12), 0, 92)
        return { kind: 'LONG', confidence: Math.round(confidence), reasons, pattern: 'Supertrend flip up', fake: false, ...plan }
    }
    if (st.dir === -1 && fresh) {
        const plan = planFromAnchor(ind, 'SHORT', st.line, params.stopCushionAtr, 'Supertrend line')
        const reasons: SignalReason[] = [
            { label: 'Supertrend flipped down — trend turned bearish', direction: 'bear', weight: 3 },
            { label: 'Trailing stop sits on the Supertrend line', direction: 'bear', weight: 1 }
        ]
        if (ind.price < ind.ema55) reasons.push({ label: 'Price below the 55-EMA — aligned with the trend', direction: 'bear', weight: 2 })
        const confidence = clamp(60 + (ind.price < ind.ema55 ? 12 : 0) + clamp(-ind.ema10Slope * 30, 0, 12), 0, 92)
        return { kind: 'SHORT', confidence: Math.round(confidence), reasons, pattern: 'Supertrend flip down', fake: false, ...plan }
    }

    return waitResult(st.dir === 1 ? 'Uptrend already running — past the flip' : 'Downtrend already running — past the flip')
}
