import type { Candle, Indicators, SignalReason } from '../types'
import type { StrategyParams } from './params'
import type { StrategyResult } from '../strategies/types'
import { dmi } from './adx'
import { planFromAnchor, EMPTY_PLAN } from './plan'

// Squeeze Momentum (LazyBear) + DMI/ADX parameters, on the active timeframe.
const PERIOD = 20
const MULT_BB = 2 // Bollinger deviation
const MULT_KC = 1.5 // Keltner range multiple
const ADX_MIN = 18 // below this the trend is too weak to trade
const SWING = 10 // bars for the stop swing anchor
// Freshness: the momentum flip must be within the last 2 bars (checked via m1/m2).

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

const wait = (note: string): StrategyResult => ({
    kind: 'WAIT',
    confidence: 0,
    reasons: [{ label: note, direction: 'neutral', weight: 0 }],
    pattern: 'No setup',
    fake: false,
    ...EMPTY_PLAN
})

const sma = (arr: number[], start: number, len: number): number => {
    let s = 0
    for (let i = start; i < start + len; i++) s += arr[i]
    return s / len
}

/** Linear-regression value at the most recent point (Pine linreg(src, n, 0)). */
const linregEnd = (y: number[]): number => {
    const n = y.length
    let sx = 0,
        sy = 0,
        sxx = 0,
        sxy = 0
    for (let i = 0; i < n; i++) {
        sx += i
        sy += y[i]
        sxx += i * i
        sxy += i * y[i]
    }
    const denom = n * sxx - sx * sx
    const slope = denom !== 0 ? (n * sxy - sx * sy) / denom : 0
    const intercept = (sy - slope * sx) / n
    return intercept + slope * (n - 1)
}

/** LazyBear squeeze momentum value using candles up to index `e`. */
const momentumAt = (closes: number[], highs: number[], lows: number[], e: number, n: number): number => {
    if (e - 2 * n + 2 < 0) return NaN
    const d: number[] = []
    for (let k = 0; k < n; k++) {
        const j = e - n + 1 + k
        let hh = -Infinity
        let ll = Infinity
        for (let m = j - n + 1; m <= j; m++) {
            if (highs[m] > hh) hh = highs[m]
            if (lows[m] < ll) ll = lows[m]
        }
        const mid = ((hh + ll) / 2 + sma(closes, j - n + 1, n)) / 2
        d.push(closes[j] - mid)
    }
    return linregEnd(d)
}

/**
 * TradingLatino (Jaime Merino) — a mechanical reading of the published method:
 * the 55-EMA is the trend backbone, the DMI (+DI/−DI) gives direction with a
 * rising ADX for conviction, and the LazyBear Squeeze Momentum is the trigger.
 *   LONG  — price ≥ EMA55, +DI > −DI, ADX strong, and momentum flips up (out of
 *           any squeeze) within the last couple of bars.
 *   SHORT — the mirror. While the squeeze is on (compressed) it waits for the
 *           release. Stop sits beyond the recent swing; target is next structure.
 */
export const tradingLatinoResult = (ind: Indicators, candles: Candle[], params: StrategyParams): StrategyResult => {
    if (candles.length < PERIOD * 2 + 5) return wait('Not enough data for TradingLatino')
    if (!Number.isFinite(ind.ema55)) return wait('EMA55 not ready')

    const closes = candles.map((c) => c.close)
    const highs = candles.map((c) => c.high)
    const lows = candles.map((c) => c.low)
    const price = ind.price
    const ema55 = ind.ema55

    // Bollinger vs Keltner → squeeze state.
    const win = closes.slice(-PERIOD)
    const basis = win.reduce((a, b) => a + b, 0) / PERIOD
    const variance = win.reduce((a, b) => a + (b - basis) ** 2, 0) / PERIOD
    const sd = Math.sqrt(variance)
    const upperBB = basis + MULT_BB * sd
    const lowerBB = basis - MULT_BB * sd
    const trs: number[] = []
    for (let i = candles.length - PERIOD; i < candles.length; i++) {
        const c = candles[i]
        const p = candles[i - 1]
        trs.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)))
    }
    const rangeMa = trs.reduce((a, b) => a + b, 0) / PERIOD
    const upperKC = basis + rangeMa * MULT_KC
    const lowerKC = basis - rangeMa * MULT_KC
    const squeezeOn = lowerBB > lowerKC && upperBB < upperKC
    const squeezeOff = lowerBB < lowerKC && upperBB > upperKC

    if (squeezeOn) return wait('Squeeze on — volatility compressed, waiting for the release')

    // Squeeze momentum, current + recent bars for a fresh zero-cross.
    const last = candles.length - 1
    const m0 = momentumAt(closes, highs, lows, last, PERIOD)
    const m1 = momentumAt(closes, highs, lows, last - 1, PERIOD)
    const m2 = momentumAt(closes, highs, lows, last - 2, PERIOD)
    if (!Number.isFinite(m0) || !Number.isFinite(m1)) return wait('Momentum not ready')

    const d = dmi(candles)
    if (!Number.isFinite(d.adx)) return wait('ADX not ready')
    const adxRising = d.adx >= d.adxPrev
    const atr = ind.atr > 0 && Number.isFinite(ind.atr) ? ind.atr : price * 0.004

    const freshUp = m0 > 0 && m0 > m1 && (m1 <= 0 || m2 <= 0)
    const freshDown = m0 < 0 && m0 < m1 && (m1 >= 0 || m2 >= 0)

    const longSetup = price >= ema55 && d.diPlus > d.diMinus && d.adx >= ADX_MIN && freshUp
    const shortSetup = price <= ema55 && d.diMinus > d.diPlus && d.adx >= ADX_MIN && freshDown

    if (longSetup) {
        const swingLow = Math.min(...lows.slice(-SWING))
        const plan = planFromAnchor(ind, 'LONG', swingLow, params.stopCushionAtr, 'swing low')
        let confidence = 55 + clamp((d.adx - ADX_MIN) * 0.7, 0, 18) + clamp((d.diPlus - d.diMinus) * 0.4, 0, 8)
        const reasons: SignalReason[] = [
            { label: 'Price above the 55-EMA — bullish backbone', direction: 'bull', weight: 3 },
            { label: `DMI bullish (+DI ${d.diPlus.toFixed(0)} > −DI ${d.diMinus.toFixed(0)})`, direction: 'bull', weight: 3 },
            { label: 'Squeeze momentum flipped up (fresh impulse)', direction: 'bull', weight: 2 }
        ]
        if (adxRising) {
            confidence += 6
            reasons.push({ label: `ADX rising (${d.adx.toFixed(0)}) — trend gaining strength`, direction: 'bull', weight: 2 })
        }
        if (squeezeOff) {
            confidence += 6
            reasons.push({ label: 'Squeeze fired — volatility expanding', direction: 'bull', weight: 2 })
        }
        return {
            kind: 'LONG',
            confidence: clamp(Math.round(confidence), 0, 95),
            reasons,
            pattern: 'Squeeze + DMI long',
            fake: false,
            ...plan,
            planBasis: plan.planBasis ?? `Stop @ swing low (ATR ${atr.toFixed(4)})`
        }
    }

    if (shortSetup) {
        const swingHigh = Math.max(...highs.slice(-SWING))
        const plan = planFromAnchor(ind, 'SHORT', swingHigh, params.stopCushionAtr, 'swing high')
        let confidence = 55 + clamp((d.adx - ADX_MIN) * 0.7, 0, 18) + clamp((d.diMinus - d.diPlus) * 0.4, 0, 8)
        const reasons: SignalReason[] = [
            { label: 'Price below the 55-EMA — bearish backbone', direction: 'bear', weight: 3 },
            { label: `DMI bearish (−DI ${d.diMinus.toFixed(0)} > +DI ${d.diPlus.toFixed(0)})`, direction: 'bear', weight: 3 },
            { label: 'Squeeze momentum flipped down (fresh impulse)', direction: 'bear', weight: 2 }
        ]
        if (adxRising) {
            confidence += 6
            reasons.push({ label: `ADX rising (${d.adx.toFixed(0)}) — trend gaining strength`, direction: 'bear', weight: 2 })
        }
        if (squeezeOff) {
            confidence += 6
            reasons.push({ label: 'Squeeze fired — volatility expanding', direction: 'bear', weight: 2 })
        }
        return {
            kind: 'SHORT',
            confidence: clamp(Math.round(confidence), 0, 95),
            reasons,
            pattern: 'Squeeze + DMI short',
            fake: false,
            ...plan
        }
    }

    // Explain the nearest miss.
    if (d.adx < ADX_MIN) return wait(`Trend too weak (ADX ${d.adx.toFixed(0)} < ${ADX_MIN})`)
    if (price >= ema55 && d.diPlus <= d.diMinus) return wait('Above EMA55 but DMI not bullish yet')
    if (price <= ema55 && d.diMinus <= d.diPlus) return wait('Below EMA55 but DMI not bearish yet')
    return wait('No fresh squeeze-momentum flip')
}
