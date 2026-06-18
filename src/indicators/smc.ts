import type { Candle, Indicators, SignalReason } from '../types'
import type { StrategyParams } from './params'
import type { StrategyResult } from '../strategies/types'
import { planFromAnchor, waitResult } from './plan'

const SWING = 8 // fallback stop anchor when no order block is found

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

/**
 * Smart-Money Concepts — trade a break of structure with the order block as the
 * line in the sand. A bullish BOS with price holding above its order block is a
 * LONG (stop below the block); the bearish mirror is a SHORT. Conviction scales
 * with the volume behind the break.
 */
export const smcResult = (ind: Indicators, candles: Candle[], params: StrategyParams): StrategyResult => {
    if (candles.length < 30) return waitResult('Not enough data for Smart-Money')
    const { bias, breakOfStructure, orderBlock, volumeRatio } = ind.smartMoney
    const price = ind.price

    if (!breakOfStructure) return waitResult('No break of structure yet')

    if (bias === 'bullish') {
        if (orderBlock !== null && price < orderBlock) return waitResult('Bullish BOS but price lost the order block')
        const anchor = orderBlock ?? Math.min(...candles.slice(-SWING).map((c) => c.low))
        const plan = planFromAnchor(ind, 'LONG', anchor, params.stopCushionAtr, orderBlock !== null ? 'order block' : 'swing low')
        const reasons: SignalReason[] = [
            { label: 'Bullish break of structure — higher high taken', direction: 'bull', weight: 3 },
            { label: orderBlock !== null ? 'Holding above the demand order block' : 'Stop below the recent swing', direction: 'bull', weight: 2 }
        ]
        if (volumeRatio >= 1.3) reasons.push({ label: `Volume-backed move (×${volumeRatio.toFixed(1)})`, direction: 'bull', weight: 2 })
        const confidence = clamp(58 + clamp((volumeRatio - 1) * 18, 0, 18) + (price > ind.ema55 ? 8 : 0), 0, 92)
        return { kind: 'LONG', confidence: Math.round(confidence), reasons, pattern: 'SMC bullish BOS', fake: false, ...plan }
    }

    if (bias === 'bearish') {
        if (orderBlock !== null && price > orderBlock) return waitResult('Bearish BOS but price reclaimed the order block')
        const anchor = orderBlock ?? Math.max(...candles.slice(-SWING).map((c) => c.high))
        const plan = planFromAnchor(ind, 'SHORT', anchor, params.stopCushionAtr, orderBlock !== null ? 'order block' : 'swing high')
        const reasons: SignalReason[] = [
            { label: 'Bearish break of structure — lower low taken', direction: 'bear', weight: 3 },
            { label: orderBlock !== null ? 'Holding below the supply order block' : 'Stop above the recent swing', direction: 'bear', weight: 2 }
        ]
        if (volumeRatio >= 1.3) reasons.push({ label: `Volume-backed move (×${volumeRatio.toFixed(1)})`, direction: 'bear', weight: 2 })
        const confidence = clamp(58 + clamp((volumeRatio - 1) * 18, 0, 18) + (price < ind.ema55 ? 8 : 0), 0, 92)
        return { kind: 'SHORT', confidence: Math.round(confidence), reasons, pattern: 'SMC bearish BOS', fake: false, ...plan }
    }

    return waitResult('Break of structure without a clear bias')
}
