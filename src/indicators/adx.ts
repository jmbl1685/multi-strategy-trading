import type { Candle } from '../types'

export interface Dmi {
    /** +DI — strength of upward directional movement. */
    diPlus: number
    /** −DI — strength of downward directional movement. */
    diMinus: number
    /** ADX — overall trend strength (direction-agnostic). */
    adx: number
    /** ADX a few bars ago, to tell whether the trend is strengthening. */
    adxPrev: number
}

const EMPTY: Dmi = { diPlus: NaN, diMinus: NaN, adx: NaN, adxPrev: NaN }

/**
 * Wilder's Directional Movement (DMI) + ADX. TradingLatino reads +DI vs −DI for
 * direction and a rising ADX for trend conviction. Computed with Wilder (RMA)
 * smoothing, matching the standard TradingView DMI.
 */
export const dmi = (candles: Candle[], period = 14, prevLookback = 3): Dmi => {
    if (candles.length <= period * 2) return EMPTY

    const tr: number[] = []
    const plusDM: number[] = []
    const minusDM: number[] = []
    for (let i = 1; i < candles.length; i++) {
        const c = candles[i]
        const p = candles[i - 1]
        const up = c.high - p.high
        const down = p.low - c.low
        plusDM.push(up > down && up > 0 ? up : 0)
        minusDM.push(down > up && down > 0 ? down : 0)
        tr.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)))
    }

    // Wilder-smoothed running sums, seeded with the first `period` total.
    const seed = (arr: number[]) => arr.slice(0, period).reduce((a, b) => a + b, 0)
    let trS = seed(tr)
    let plusS = seed(plusDM)
    let minusS = seed(minusDM)

    const dxSeries: number[] = []
    const pushDx = () => {
        const pdi = trS > 0 ? (100 * plusS) / trS : 0
        const mdi = trS > 0 ? (100 * minusS) / trS : 0
        const denom = pdi + mdi
        dxSeries.push(denom > 0 ? (100 * Math.abs(pdi - mdi)) / denom : 0)
        return { pdi, mdi }
    }

    let last = pushDx()
    for (let i = period; i < tr.length; i++) {
        trS = trS - trS / period + tr[i]
        plusS = plusS - plusS / period + plusDM[i]
        minusS = minusS - minusS / period + minusDM[i]
        last = pushDx()
    }

    // ADX = Wilder average of DX. Seed with the SMA of the first `period` DX.
    if (dxSeries.length < period + 1) return EMPTY
    let adx = dxSeries.slice(0, period).reduce((a, b) => a + b, 0) / period
    const adxSeries: number[] = [adx]
    for (let i = period; i < dxSeries.length; i++) {
        adx = (adx * (period - 1) + dxSeries[i]) / period
        adxSeries.push(adx)
    }

    const prevIdx = Math.max(0, adxSeries.length - 1 - prevLookback)
    return {
        diPlus: last.pdi,
        diMinus: last.mdi,
        adx: adxSeries[adxSeries.length - 1],
        adxPrev: adxSeries[prevIdx]
    }
}
