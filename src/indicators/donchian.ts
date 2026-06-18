import type { Candle, Indicators, SignalReason } from '../types'
import type { StrategyParams } from './params'
import type { StrategyResult } from '../strategies/types'
import { planFromAnchor, waitResult } from './plan'

const CHANNEL = 20 // breakout lookback (Turtle entry)
const EXIT = 10 // opposite N/2 channel = the stop anchor

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

/**
 * Donchian / Turtle breakout — momentum. A close above the prior 20-bar high is
 * a LONG (a fresh range expansion); a close below the prior 20-bar low is a
 * SHORT. The stop trails to the opposite 10-bar channel.
 */
export const donchianResult = (ind: Indicators, candles: Candle[], params: StrategyParams): StrategyResult => {
    const n = candles.length
    if (n < CHANNEL + 3) return waitResult('Not enough data for Donchian breakout')

    const prior = candles.slice(n - 1 - CHANNEL, n - 1) // the CHANNEL bars before now
    const priorHigh = Math.max(...prior.map((c) => c.high))
    const priorLow = Math.min(...prior.map((c) => c.low))
    const prevClose = candles[n - 2].close
    const price = ind.price

    // Fresh = it broke on this bar (the prior close was still inside the channel).
    const brokeUp = price > priorHigh && prevClose <= priorHigh
    const brokeDown = price < priorLow && prevClose >= priorLow

    if (brokeUp) {
        const exitLow = Math.min(...candles.slice(-EXIT).map((c) => c.low))
        const plan = planFromAnchor(ind, 'LONG', exitLow, params.stopCushionAtr, '10-bar channel')
        const reasons: SignalReason[] = [
            { label: `Broke above the ${CHANNEL}-bar high — range expansion`, direction: 'bull', weight: 3 },
            { label: `Stop trails the ${EXIT}-bar channel low`, direction: 'bull', weight: 1 }
        ]
        if (ind.price > ind.ema55) reasons.push({ label: 'Above the 55-EMA — with the trend', direction: 'bull', weight: 2 })
        const confidence = clamp(58 + (ind.price > ind.ema55 ? 12 : 0) + clamp(ind.smartMoney.volumeRatio * 6, 0, 12), 0, 92)
        return { kind: 'LONG', confidence: Math.round(confidence), reasons, pattern: 'Donchian breakout up', fake: false, ...plan }
    }

    if (brokeDown) {
        const exitHigh = Math.max(...candles.slice(-EXIT).map((c) => c.high))
        const plan = planFromAnchor(ind, 'SHORT', exitHigh, params.stopCushionAtr, '10-bar channel')
        const reasons: SignalReason[] = [
            { label: `Broke below the ${CHANNEL}-bar low — range expansion`, direction: 'bear', weight: 3 },
            { label: `Stop trails the ${EXIT}-bar channel high`, direction: 'bear', weight: 1 }
        ]
        if (ind.price < ind.ema55) reasons.push({ label: 'Below the 55-EMA — with the trend', direction: 'bear', weight: 2 })
        const confidence = clamp(58 + (ind.price < ind.ema55 ? 12 : 0) + clamp(ind.smartMoney.volumeRatio * 6, 0, 12), 0, 92)
        return { kind: 'SHORT', confidence: Math.round(confidence), reasons, pattern: 'Donchian breakout down', fake: false, ...plan }
    }

    return waitResult('Price inside the Donchian channel — no breakout')
}
