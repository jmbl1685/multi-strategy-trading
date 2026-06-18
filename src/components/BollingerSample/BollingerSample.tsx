import { useMemo } from 'react'
import { useI18n } from '../../context/I18nContext'
import '../SampleChart/SampleChart.scss'

interface Bar {
    open: number
    high: number
    low: number
    close: number
}

// Deterministic RNG so the sample looks identical every render.
const mulberry32 = (seed: number) => () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const PERIOD = 20
const W = 640
const P_TOP = 22
const P_BOT = 300
const H = 320
const PAD_L = 14
const PAD_R = 70
const GOLD = '#f0b429'

// A range that drifts sideways, stretches sharply BELOW the lower band (the
// oversold extreme), then reclaims it and reverts up toward the middle band.
const buildBars = (): Bar[] => {
    const rnd = mulberry32(5)
    const wick = mulberry32(7)
    const closes: number[] = []
    let p = 100
    for (let i = 0; i < 22; i++) {
        p += (rnd() - 0.5) * 1.1
        closes.push(p)
    }
    for (let i = 0; i < 6; i++) {
        p += -1.7 + (rnd() - 0.5) * 0.6
        closes.push(p)
    }
    for (let i = 0; i < 7; i++) {
        p += 0.95 + (rnd() - 0.5) * 0.5
        closes.push(p)
    }
    return closes.map((c, i) => {
        const open = i > 0 ? closes[i - 1] : c
        const high = Math.max(open, c) + wick() * 0.4
        const low = Math.min(open, c) - wick() * 0.4
        return { open, high, low, close: c }
    })
}

export const BollingerSample = () => {
    const { t } = useI18n()

    const model = useMemo(() => {
        const bars = buildBars()
        const closes = bars.map((b) => b.close)
        const n = bars.length

        // Bollinger bands per bar (from PERIOD-1 onward).
        const mid: number[] = []
        const upper: number[] = []
        const lower: number[] = []
        for (let i = 0; i < n; i++) {
            if (i < PERIOD - 1) {
                mid.push(NaN)
                upper.push(NaN)
                lower.push(NaN)
                continue
            }
            const win = closes.slice(i - PERIOD + 1, i + 1)
            const m = win.reduce((a, b) => a + b, 0) / PERIOD
            const sd = Math.sqrt(win.reduce((a, b) => a + (b - m) ** 2, 0) / PERIOD)
            mid.push(m)
            upper.push(m + 2 * sd)
            lower.push(m - 2 * sd)
        }

        // Pierce = lowest low in the dip; entry = the bar that reclaims the band.
        let pierceIdx = PERIOD
        for (let i = PERIOD; i < n; i++) if (bars[i].low < bars[pierceIdx].low) pierceIdx = i
        let entryIdx = pierceIdx
        for (let i = pierceIdx; i < n; i++) {
            if (Number.isFinite(lower[i]) && closes[i] > lower[i]) {
                entryIdx = i
                break
            }
        }
        const entry = closes[entryIdx]
        const stop = bars[pierceIdx].low * 0.995
        const target = mid[n - 1] // revert to the mean
        const current = closes[n - 1]
        const rr = entry - stop > 0 ? (target - entry) / (entry - stop) : 0

        const lows = bars.map((b) => b.low)
        const rawMin = Math.min(stop, ...lows)
        const rawMax = Math.max(...upper.filter(Number.isFinite), target)
        const span = rawMax - rawMin || 1
        return {
            bars,
            mid,
            upper,
            lower,
            n,
            pierceIdx,
            entryIdx,
            entry,
            stop,
            target,
            current,
            rr,
            pMin: rawMin - span * 0.08,
            pMax: rawMax + span * 0.06
        }
    }, [])

    const { bars, mid, upper, lower, n, pierceIdx, entryIdx, entry, target, current, rr, pMin, pMax } = model
    const cw = (W - PAD_L - PAD_R) / n
    const cx = (i: number) => PAD_L + (i + 0.5) * cw
    const pY = (v: number) => P_TOP + ((pMax - v) / (pMax - pMin)) * (P_BOT - P_TOP)
    const body = Math.max(1.4, cw * 0.6)
    const labelX = W - PAD_R + 6
    const tradeX = cx(entryIdx)

    const path = (arr: number[]) =>
        arr
            .map((v, i) => (Number.isFinite(v) ? `${cx(i).toFixed(1)},${pY(v).toFixed(1)}` : null))
            .filter(Boolean)
            .join(' ')

    // Shaded band area (upper forward, lower back).
    const fi = PERIOD - 1
    const areaTop = upper.slice(fi).map((v, i) => `${cx(fi + i).toFixed(1)},${pY(v).toFixed(1)}`)
    const areaBot = lower
        .slice(fi)
        .map((v, i) => `${cx(fi + i).toFixed(1)},${pY(v).toFixed(1)}`)
        .reverse()
    const bandArea = `M${areaTop.join(' L')} L${areaBot.join(' L')} Z`

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
        <svg className='sample' viewBox={`0 0 ${W} ${H}`} role='img' aria-label='Bollinger Bands example chart'>
            <rect x='1' y={P_TOP - 8} width={W - 2} height={P_BOT - P_TOP + 16} rx='8' className='sample__panel' />

            <path d={bandArea} fill='var(--accent)' opacity='0.07' />
            <polyline points={path(upper)} fill='none' stroke='var(--short)' strokeWidth='1.2' opacity='0.7' strokeDasharray='3 2' />
            <polyline points={path(mid)} fill='none' stroke='var(--text-dim)' strokeWidth='1.3' />
            <polyline points={path(lower)} fill='none' stroke='var(--long)' strokeWidth='1.2' opacity='0.7' strokeDasharray='3 2' />
            <text x={cx(fi)} y={pY(upper[fi]) - 5} className='sample__legend' fill='var(--text-dim)'>
                BB 20 · 2σ
            </text>

            {/* target / entry levels */}
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

            {/* current price guide */}
            <line x1={PAD_L} x2={W - PAD_R} y1={pY(current)} y2={pY(current)} stroke='var(--text-dim)' strokeWidth='1' strokeDasharray='2 3' opacity='0.7' />
            <text x={labelX} y={pY(current) - 1.5} className='sample__tag' fill='var(--text)'>
                {t('card.now')}
            </text>
            <text x={labelX} y={pY(current) + 8.5} className='sample__price' fill='var(--text)'>
                {current.toFixed(2)}
            </text>

            {/* pierce marker + entry */}
            <circle cx={cx(pierceIdx)} cy={pY(bars[pierceIdx].low)} r='3' fill='none' stroke='var(--long)' strokeWidth='1.6' />
            <circle cx={cx(entryIdx)} cy={pY(entry)} r='3.6' fill={GOLD} stroke='var(--surface)' strokeWidth='1.6' />
            <text x={(cx(entryIdx) + (W - PAD_R)) / 2} y={(pY(target) + pY(entry)) / 2 + 3} className='sample__rr' fill='var(--long)' textAnchor='middle'>
                R:R {rr.toFixed(1)}
            </text>
            <text x={cx(pierceIdx)} y={pY(bars[pierceIdx].low) + 16} className='sample__note' fill='var(--long)' textAnchor='middle'>
                {t('card.entry')}
            </text>
        </svg>
    )
}
