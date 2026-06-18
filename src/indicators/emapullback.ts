import type { Candle, Indicators, SignalReason } from '../types'
import type { StrategyParams } from './params'
import type { StrategyResult } from '../strategies/types'
import { planFromAnchor, waitResult } from './plan'

const PULLBACK_BARS = 4 // window in which the dip to the EMA must have happened
const SWING = 5 // bars for the stop swing anchor

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

/**
 * EMA pullback — buy the dip in a trend. With the EMAs stacked (10 > 22 > 55 and
 * price above the 55), a pullback that tags the 22-EMA and then resumes is a
 * LONG; the mirror is a SHORT. Trend-continuation, not reversal.
 */
export const emaPullbackResult = (ind: Indicators, candles: Candle[], params: StrategyParams): StrategyResult => {
    if (candles.length < 60) return waitResult('Not enough data for EMA pullback')
    const { ema10, ema22, ema55, rsi, price } = ind
    const atr = ind.atr > 0 && Number.isFinite(ind.atr) ? ind.atr : price * 0.004
    const tol = 0.45 * atr

    const recent = candles.slice(-PULLBACK_BARS)
    const upTrend = ema10 > ema22 && ema22 > ema55 && price > ema55
    const downTrend = ema10 < ema22 && ema22 < ema55 && price < ema55

    if (upTrend) {
        const dip = Math.min(...recent.map((c) => c.low))
        const tagged = dip <= ema22 + tol // pulled back to/through the 22-EMA
        const resuming = price > ema10 && rsi >= 40 && rsi <= 68
        if (tagged && resuming) {
            const swingLow = Math.min(...candles.slice(-SWING).map((c) => c.low))
            const plan = planFromAnchor(ind, 'LONG', Math.min(swingLow, dip), params.stopCushionAtr, 'pullback low')
            const reasons: SignalReason[] = [
                { label: 'Uptrend — EMAs stacked 10 > 22 > 55, price above the 55', direction: 'bull', weight: 3 },
                { label: 'Pullback tagged the 22-EMA and is resuming up', direction: 'bull', weight: 3 },
                { label: `Reclaimed the 10-EMA (RSI ${rsi.toFixed(0)})`, direction: 'bull', weight: 2 }
            ]
            const confidence = clamp(58 + clamp(ind.ema10Slope * 30, 0, 16) + clamp((rsi - 40) * 0.4, 0, 8), 0, 92)
            return { kind: 'LONG', confidence: Math.round(confidence), reasons, pattern: 'EMA pullback (long)', fake: false, ...plan }
        }
        return waitResult('Uptrend — waiting for a pullback to the 22-EMA')
    }

    if (downTrend) {
        const pop = Math.max(...recent.map((c) => c.high))
        const tagged = pop >= ema22 - tol
        const resuming = price < ema10 && rsi <= 60 && rsi >= 32
        if (tagged && resuming) {
            const swingHigh = Math.max(...candles.slice(-SWING).map((c) => c.high))
            const plan = planFromAnchor(ind, 'SHORT', Math.max(swingHigh, pop), params.stopCushionAtr, 'pullback high')
            const reasons: SignalReason[] = [
                { label: 'Downtrend — EMAs stacked 10 < 22 < 55, price below the 55', direction: 'bear', weight: 3 },
                { label: 'Pullback tagged the 22-EMA and is rolling over', direction: 'bear', weight: 3 },
                { label: `Lost the 10-EMA (RSI ${rsi.toFixed(0)})`, direction: 'bear', weight: 2 }
            ]
            const confidence = clamp(58 + clamp(-ind.ema10Slope * 30, 0, 16) + clamp((60 - rsi) * 0.4, 0, 8), 0, 92)
            return { kind: 'SHORT', confidence: Math.round(confidence), reasons, pattern: 'EMA pullback (short)', fake: false, ...plan }
        }
        return waitResult('Downtrend — waiting for a pullback to the 22-EMA')
    }

    return waitResult('No clean EMA trend (10/22/55 not stacked)')
}
