import { useMemo } from 'react'
import { emaSeries } from '../../indicators/ema'
import { useI18n } from '../../context/I18nContext'
import '../SampleChart/SampleChart.scss'

interface Bar {
    open: number
    high: number
    low: number
    close: number
}

const mulberry32 = (seed: number) => () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const W = 640
const P_TOP = 22
const P_BOT = 250
const Q_TOP = 276
const Q_BOT = 372
const H = 392
const PAD_L = 14
const PAD_R = 70
const GOLD = '#f0b429'
const SMA = 20

// Gentle uptrend (EMA55 rising below) → a tight squeeze (range) → the breakout
// up: momentum flips green and price holds above the 55-EMA.
const buildBars = (): Bar[] => {
    const rnd = mulberry32(11)
    const wick = mulberry32(4)
    const closes: number[] = []
    let p = 95
    for (let i = 0; i < 34; i++) {
        p += 0.16 + (rnd() - 0.5) * 0.9
        closes.push(p)
    }
    for (let i = 0; i < 12; i++) {
        p += (rnd() - 0.5) * 0.5
        closes.push(p)
    }
    for (let i = 0; i < 12; i++) {
        p += 0.62 + (rnd() - 0.5) * 0.4
        closes.push(p)
    }
    return closes.map((c, i) => {
        const open = i > 0 ? closes[i - 1] : c
        const high = Math.max(open, c) + wick() * 0.35
        const low = Math.min(open, c) - wick() * 0.35
        return { open, high, low, close: c }
    })
}

export const TradingLatinoSample = () => {
    const { t } = useI18n()

    const model = useMemo(() => {
        const bars = buildBars()
        const closes = bars.map((b) => b.close)
        const n = bars.length
        const ema55 = emaSeries(closes, 55)

        // Squeeze-momentum proxy: close vs its SMA20 (≈ LazyBear histogram).
        const mom: number[] = closes.map((c, i) => {
            if (i < SMA - 1) return NaN
            const m = closes.slice(i - SMA + 1, i + 1).reduce((a, b) => a + b, 0) / SMA
            return c - m
        })

        // Breakout = first bar of the final leg where momentum turns positive.
        const breakStart = 46
        let entryIdx = breakStart
        for (let i = breakStart; i < n; i++) {
            if (Number.isFinite(mom[i]) && mom[i] > 0) {
                entryIdx = i
                break
            }
        }
        const entry = closes[entryIdx]
        const swingLow = Math.min(...bars.slice(entryIdx - 14, entryIdx + 1).map((b) => b.low))
        const stop = swingLow * 0.99
        const highMax = Math.max(...bars.map((b) => b.high))
        const lowMin = Math.min(...bars.map((b) => b.low))
        const target = highMax + (highMax - lowMin) * 0.1
        const current = closes[n - 1]
        const rr = entry - stop > 0 ? (target - entry) / (entry - stop) : 0

        const rawMin = Math.min(stop, lowMin, ...ema55.filter(Number.isFinite))
        const rawMax = Math.max(target, highMax)
        const span = rawMax - rawMin || 1
        const mAmp = Math.max(...mom.filter(Number.isFinite).map((v) => Math.abs(v)), 1e-6)
        return {
            bars,
            ema55,
            mom,
            n,
            entryIdx,
            entry,
            target,
            current,
            rr,
            pMin: rawMin - span * 0.06,
            pMax: rawMax + span * 0.06,
            mAmp
        }
    }, [])

    const { bars, ema55, mom, n, entryIdx, entry, target, current, rr, pMin, pMax, mAmp } = model
    const cw = (W - PAD_L - PAD_R) / n
    const cx = (i: number) => PAD_L + (i + 0.5) * cw
    const pY = (v: number) => P_TOP + ((pMax - v) / (pMax - pMin)) * (P_BOT - P_TOP)
    const qMid = (Q_TOP + Q_BOT) / 2
    const qY = (v: number) => qMid - (v / mAmp) * ((Q_BOT - Q_TOP) / 2) * 0.8
    const body = Math.max(1.4, cw * 0.6)
    const labelX = W - PAD_R + 6
    const tradeX = cx(entryIdx)

    const emaPath = ema55
        .map((v, i) => (Number.isFinite(v) ? `${cx(i).toFixed(1)},${pY(v).toFixed(1)}` : null))
        .filter(Boolean)
        .join(' ')

    const Line = ({ v, color, label }: { v: number; color: string; label: string }) => (
        <g>
            <line x1={tradeX} x2={W - PAD_R} y1={pY(v)} y2={pY(v)} stroke={color} strokeWidth='1' strokeDasharray='4 3' opacity='0.9' />
            <text x={labelX} y={pY(v) - 2} className='sample__tag' fill={color}>
                {label}
            </text>
            <text x={labelX} y={pY(v) + 9} className='sample__price' fill={color}>
                {v.toFixed(2)}
            </text>
        </g>
    )

    return (
        <svg className='sample' viewBox={`0 0 ${W} ${H}`} role='img' aria-label='TradingLatino example chart'>
            <rect x='1' y={P_TOP - 8} width={W - 2} height={P_BOT - P_TOP + 16} rx='8' className='sample__panel' />
            <rect x='1' y={Q_TOP - 8} width={W - 2} height={Q_BOT - Q_TOP + 16} rx='8' className='sample__panel' />

            {/* captured move zone entry → target */}
            <rect x={cx(entryIdx)} y={pY(target)} width={W - PAD_R - cx(entryIdx)} height={pY(entry) - pY(target)} fill='var(--long)' opacity='0.1' />

            <Line v={target} color='var(--long)' label={t('card.target')} />
            <Line v={entry} color='var(--accent)' label={t('card.entry')} />

            {/* candles */}
            {bars.map((b, i) => {
                const up = b.close >= b.open
                const color = up ? 'var(--long)' : 'var(--short)'
                return (
                    <g key={i}>
                        <line x1={cx(i)} x2={cx(i)} y1={pY(b.high)} y2={pY(b.low)} stroke={color} strokeWidth='1' opacity='0.7' />
                        <rect
                            x={cx(i) - body / 2}
                            y={Math.min(pY(b.open), pY(b.close))}
                            width={body}
                            height={Math.max(1, Math.abs(pY(b.close) - pY(b.open)))}
                            fill={color}
                            opacity={up ? 0.9 : 0.8}
                        />
                    </g>
                )
            })}

            {/* EMA55 */}
            <polyline points={emaPath} fill='none' stroke='var(--cyan)' strokeWidth='1.6' />
            <text x={cx(2)} y={pY(ema55[34] ?? bars[34].close) + 14} className='sample__legend' fill='var(--cyan)'>
                EMA55
            </text>

            {/* current price guide */}
            <line x1={PAD_L} x2={W - PAD_R} y1={pY(current)} y2={pY(current)} stroke='var(--text-dim)' strokeWidth='1' strokeDasharray='2 3' opacity='0.7' />
            <text x={labelX} y={pY(current) - 1.5} className='sample__tag' fill='var(--text)'>
                {t('card.now')}
            </text>
            <text x={labelX} y={pY(current) + 8.5} className='sample__price' fill='var(--text)'>
                {current.toFixed(2)}
            </text>

            {/* entry marker + R:R */}
            <circle cx={cx(entryIdx)} cy={pY(entry)} r='3.6' fill={GOLD} stroke='var(--surface)' strokeWidth='1.6' />
            <text x={(cx(entryIdx) + (W - PAD_R)) / 2} y={(pY(target) + pY(entry)) / 2 + 3} className='sample__rr' fill='var(--long)' textAnchor='middle'>
                R:R {rr.toFixed(1)}
            </text>

            {/* squeeze momentum histogram */}
            <line x1={PAD_L} x2={W - PAD_R} y1={qMid} y2={qMid} stroke='var(--text-faint)' strokeWidth='0.75' opacity='0.5' />
            {mom.map((v, i) =>
                Number.isFinite(v) ? (
                    <rect
                        key={i}
                        x={cx(i) - body / 2}
                        y={Math.min(qMid, qY(v))}
                        width={body}
                        height={Math.max(0.8, Math.abs(qY(v) - qMid))}
                        fill={v >= 0 ? 'var(--long)' : 'var(--short)'}
                        opacity='0.75'
                    />
                ) : null
            )}
            <text x={cx(2)} y={Q_TOP + 4} className='sample__legend' fill='#38bdf8'>
                Squeeze momentum
            </text>
        </svg>
    )
}
