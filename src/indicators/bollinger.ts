import type { Candle, Indicators, SignalReason } from '../types'
import type { StrategyParams } from './params'
import type { StrategyResult } from '../strategies/types'

// Classic Bollinger Bands: a 20-period SMA with ±2σ envelopes.
const PERIOD = 20
const MULT = 2
// The band pierce must be recent (within the last couple of bars) — a stretch
// that already snapped back is not a live setup.
const MAX_BARS_SINCE = 2

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

const wait = (note: string): StrategyResult => ({
    kind: 'WAIT',
    confidence: 0,
    reasons: [{ label: note, direction: 'neutral', weight: 0 }],
    pattern: 'No setup',
    fake: false,
    entry: null,
    stopLoss: null,
    takeProfit: null,
    riskReward: null,
    planBasis: null
})

/**
 * Bollinger Bands mean-reversion. Price stretching beyond a band is a volatility
 * extreme; once it closes back inside, fade it toward the mean (the middle SMA):
 *   LONG  — a recent low pierced the lower band and price has reclaimed it.
 *   SHORT — a recent high pierced the upper band and price has reclaimed it.
 * A strong trend (price walking the band) is rejected — that's continuation, not
 * reversion. Stop sits beyond the pierce extreme; target is the middle band.
 */
export const bollingerResult = (ind: Indicators, candles: Candle[], params: StrategyParams): StrategyResult => {
    if (candles.length < PERIOD + 2) return wait('Not enough data for Bollinger Bands')

    const closes = candles.map((c) => c.close)
    const win = closes.slice(-PERIOD)
    const mid = win.reduce((a, b) => a + b, 0) / PERIOD
    const variance = win.reduce((a, b) => a + (b - mid) ** 2, 0) / PERIOD
    const sd = Math.sqrt(variance)
    if (!(sd > 0)) return wait('Bands are flat')

    const upper = mid + MULT * sd
    const lower = mid - MULT * sd
    const price = ind.price
    const atr = ind.atr > 0 && Number.isFinite(ind.atr) ? ind.atr : price * 0.004

    // Did the last few bars stretch beyond a band?
    const recent = candles.slice(-(MAX_BARS_SINCE + 1))
    const pierceLow = Math.min(...recent.map((c) => c.low))
    const pierceHigh = Math.max(...recent.map((c) => c.high))

    const longSetup = pierceLow <= lower && price > lower // dipped below, back inside
    const shortSetup = pierceHigh >= upper && price < upper

    // Don't fade a strong trend — in trends price rides the band (continuation).
    const strongDown = ind.ema10Slope <= -params.fakeSlope && price < ind.ema55
    const strongUp = ind.ema10Slope >= params.fakeSlope && price > ind.ema55

    if (longSetup && !strongDown) {
        const entry = price
        const stopLoss = Math.min(pierceLow, lower) - params.stopCushionAtr * atr
        const target = mid
        const risk = entry - stopLoss
        const reward = target - entry
        const riskReward = risk > 0 ? reward / risk : null
        const depth = (lower - pierceLow) / sd

        let confidence = 55 + clamp(depth * 22, 0, 18)
        const reasons: SignalReason[] = [
            { label: 'Price pierced the lower Bollinger band (oversold stretch)', direction: 'bull', weight: 3 },
            { label: 'Reclaimed the band — reverting toward the mean (SMA 20)', direction: 'bull', weight: 2 }
        ]
        if (ind.rsi <= params.rsiOversold) {
            confidence += 10
            reasons.push({ label: `RSI oversold (${ind.rsi.toFixed(0)})`, direction: 'bull', weight: 2 })
        }
        if (ind.trend === 'range') {
            confidence += 5
            reasons.push({ label: 'Ranging market — mean-reversion favoured', direction: 'bull', weight: 1 })
        }
        return {
            kind: 'LONG',
            confidence: clamp(Math.round(confidence), 0, 95),
            reasons,
            pattern: 'BB reversion (lower band)',
            fake: false,
            entry,
            stopLoss,
            takeProfit: target,
            riskReward,
            planBasis: 'Stop @ band low · Target @ SMA 20'
        }
    }

    if (shortSetup && !strongUp) {
        const entry = price
        const stopLoss = Math.max(pierceHigh, upper) + params.stopCushionAtr * atr
        const target = mid
        const risk = stopLoss - entry
        const reward = entry - target
        const riskReward = risk > 0 ? reward / risk : null
        const depth = (pierceHigh - upper) / sd

        let confidence = 55 + clamp(depth * 22, 0, 18)
        const reasons: SignalReason[] = [
            { label: 'Price pierced the upper Bollinger band (overbought stretch)', direction: 'bear', weight: 3 },
            { label: 'Reclaimed the band — reverting toward the mean (SMA 20)', direction: 'bear', weight: 2 }
        ]
        if (ind.rsi >= params.rsiOverbought) {
            confidence += 10
            reasons.push({ label: `RSI overbought (${ind.rsi.toFixed(0)})`, direction: 'bear', weight: 2 })
        }
        if (ind.trend === 'range') {
            confidence += 5
            reasons.push({ label: 'Ranging market — mean-reversion favoured', direction: 'bear', weight: 1 })
        }
        return {
            kind: 'SHORT',
            confidence: clamp(Math.round(confidence), 0, 95),
            reasons,
            pattern: 'BB reversion (upper band)',
            fake: false,
            entry,
            stopLoss,
            takeProfit: target,
            riskReward,
            planBasis: 'Stop @ band high · Target @ SMA 20'
        }
    }

    // Setups that exist but are blocked by trend power — surface why.
    if (longSetup && strongDown) return wait('Below lower band, but the downtrend still has power')
    if (shortSetup && strongUp) return wait('Above upper band, but the uptrend still has power')
    return wait('Price inside the Bollinger bands')
}
