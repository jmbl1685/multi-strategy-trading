import type { Indicators, SignalKind } from '../types'
import type { StrategyResult } from '../strategies/types'

export interface Plan {
    entry: number | null
    stopLoss: number | null
    takeProfit: number | null
    riskReward: number | null
    planBasis: string | null
}

export const EMPTY_PLAN: Plan = {
    entry: null,
    stopLoss: null,
    takeProfit: null,
    riskReward: null,
    planBasis: null
}

/** A WAIT result carrying a one-line reason — shared by the strategies. */
export const waitResult = (note: string): StrategyResult => ({
    kind: 'WAIT',
    confidence: 0,
    reasons: [{ label: note, direction: 'neutral', weight: 0 }],
    pattern: 'No setup',
    fake: false,
    ...EMPTY_PLAN
})

export const usableAtr = (ind: Indicators): number => {
    if (ind.atr > 0 && Number.isFinite(ind.atr)) return ind.atr
    if (ind.support !== null && ind.resistance !== null) return ind.resistance - ind.support
    return ind.price * 0.004
}

/**
 * A dynamic trade plan anchored to an invalidation price. The stop sits just
 * beyond `anchor` (the price that kills the setup); the target is the first real
 * structure that clears 1R, else the EMA the price reverts toward, else an ATR
 * projection. No fixed percentages, no canned reward:risk. `anchorLabel` names
 * the stop in the plan note (e.g. "V-low", "swing low").
 */
export const planFromAnchor = (
    ind: Indicators,
    kind: SignalKind,
    anchor: number | null,
    cushionAtr: number,
    anchorLabel: string
): Plan => {
    if (kind === 'WAIT') return EMPTY_PLAN

    const price = ind.price
    const atr = usableAtr(ind)
    const cushion = cushionAtr * atr
    const long = kind === 'LONG'

    const entry = price
    const stopLoss = long
        ? Math.min(anchor ?? price - 1.5 * atr, price - 0.5 * atr) - cushion
        : Math.max(anchor ?? price + 1.5 * atr, price + 0.5 * atr) + cushion

    const risk = Math.abs(entry - stopLoss)
    const dir = long ? 1 : -1

    // Structural targets on the far side of the trade.
    const pool = ind.levels
        .map((l) => l.price)
        .filter((p) => dir * (p - price) > 0)
        .sort((a, b) => dir * (a - b))

    let takeProfit: number | null = null
    let basis = ''
    for (const lvl of pool) {
        if (dir * (lvl - entry) >= risk) {
            takeProfit = lvl
            basis = long ? 'resistance' : 'support'
            break
        }
    }
    // Mean-reversion fallback: the EMA the price is reverting toward.
    if (takeProfit === null) {
        const ema = dir * (ind.ema22 - price) > 0 ? ind.ema22 : dir * (ind.ema10 - price) > 0 ? ind.ema10 : null
        if (ema !== null) {
            takeProfit = ema
            basis = 'EMA reclaim'
        }
    }
    if (takeProfit === null) {
        takeProfit = entry + dir * 2 * atr
        basis = 'ATR projection'
    }

    const reward = Math.abs(takeProfit - entry)
    const riskReward = risk > 0 ? reward / risk : null
    const planBasis = `Stop @ ${anchorLabel} · Target @ ${basis}`

    return { entry, stopLoss, takeProfit, riskReward, planBasis }
}
