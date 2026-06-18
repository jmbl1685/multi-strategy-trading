import { useMemo } from 'react'
import { useI18n } from '../../context/I18nContext'
import { mulberry32, toBars, Candles, type Bar } from '../SampleChart/sampleKit'
import '../SampleChart/SampleChart.scss'

const W = 640
const P_TOP = 22
const P_BOT = 300
const H = 320
const PAD_L = 14
const PAD_R = 70
const GOLD = '#f0b429'
const ATR_P = 10
const MULT = 3

const build = (): Bar[] => {
    const rnd = mulberry32(6)
    const closes: number[] = []
    let p = 104
    for (let i = 0; i < 12; i++) {
        p += (rnd() - 0.5) * 1
        closes.push(p)
    }
    for (let i = 0; i < 14; i++) {
        p += -1.1 + (rnd() - 0.5) * 0.9
        closes.push(p)
    }
    for (let i = 0; i < 16; i++) {
        p += 1.05 + (rnd() - 0.5) * 0.8
        closes.push(p)
    }
    return toBars(closes, 7)
}

// Supertrend line + direction per bar.
const supertrend = (bars: Bar[]) => {
    const n = bars.length
    const hl2 = bars.map((b) => (b.high + b.low) / 2)
    const tr = new Array<number>(n).fill(0)
    for (let i = 1; i < n; i++) {
        const c = bars[i]
        const p = bars[i - 1]
        tr[i] = Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close))
    }
    const atr = new Array<number>(n).fill(NaN)
    let seed = 0
    for (let i = 1; i <= ATR_P; i++) seed += tr[i]
    atr[ATR_P] = seed / ATR_P
    for (let i = ATR_P + 1; i < n; i++) atr[i] = (atr[i - 1] * (ATR_P - 1) + tr[i]) / ATR_P

    const upper = new Array<number>(n).fill(NaN)
    const lower = new Array<number>(n).fill(NaN)
    const line = new Array<number>(n).fill(NaN)
    const dir = new Array<number>(n).fill(1)
    for (let i = ATR_P; i < n; i++) {
        const ub = hl2[i] + MULT * atr[i]
        const lb = hl2[i] - MULT * atr[i]
        if (i === ATR_P) {
            upper[i] = ub
            lower[i] = lb
            dir[i] = bars[i].close > ub ? 1 : -1
            line[i] = dir[i] === 1 ? lb : ub
            continue
        }
        upper[i] = ub < upper[i - 1] || bars[i - 1].close > upper[i - 1] ? ub : upper[i - 1]
        lower[i] = lb > lower[i - 1] || bars[i - 1].close < lower[i - 1] ? lb : lower[i - 1]
        const wasDown = line[i - 1] === upper[i - 1]
        dir[i] = wasDown ? (bars[i].close > upper[i] ? 1 : -1) : bars[i].close < lower[i] ? -1 : 1
        line[i] = dir[i] === 1 ? lower[i] : upper[i]
    }
    return { line, dir }
}

export const SupertrendSample = () => {
    const { t } = useI18n()
    const model = useMemo(() => {
        const bars = build()
        const { line, dir } = supertrend(bars)
        const n = bars.length
        // Flip up = first bar where dir goes 1 after being -1.
        let flip = n - 1
        for (let i = ATR_P + 1; i < n; i++) if (dir[i] === 1 && dir[i - 1] === -1) flip = i
        const entry = bars[flip].close
        const stop = line[flip]
        const highMax = Math.max(...bars.map((b) => b.high))
        const lowMin = Math.min(...bars.map((b) => b.low))
        const target = highMax + (highMax - lowMin) * 0.08
        const current = bars[n - 1].close
        const rr = entry - stop > 0 ? (target - entry) / (entry - stop) : 0
        const rawMin = Math.min(lowMin, ...line.filter(Number.isFinite))
        const rawMax = Math.max(target, highMax, ...line.filter(Number.isFinite))
        const span = rawMax - rawMin || 1
        return { bars, line, dir, n, flip, entry, target, current, rr, pMin: rawMin - span * 0.06, pMax: rawMax + span * 0.06 }
    }, [])

    const { bars, line, dir, n, flip, entry, target, current, rr, pMin, pMax } = model
    const cw = (W - PAD_L - PAD_R) / n
    const cx = (i: number) => PAD_L + (i + 0.5) * cw
    const pY = (v: number) => P_TOP + ((pMax - v) / (pMax - pMin)) * (P_BOT - P_TOP)
    const body = Math.max(1.4, cw * 0.6)
    const labelX = W - PAD_R + 6
    const tradeX = cx(flip)

    // Split the Supertrend line into colored segments by direction.
    const segs: { pts: string; color: string }[] = []
    let cur: string[] = []
    let curDir = NaN
    for (let i = 0; i < n; i++) {
        if (!Number.isFinite(line[i])) continue
        if (dir[i] !== curDir && cur.length) {
            segs.push({ pts: cur.join(' '), color: curDir === 1 ? 'var(--long)' : 'var(--short)' })
            cur = [cur[cur.length - 1]]
        }
        curDir = dir[i]
        cur.push(`${cx(i).toFixed(1)},${pY(line[i]).toFixed(1)}`)
    }
    if (cur.length) segs.push({ pts: cur.join(' '), color: curDir === 1 ? 'var(--long)' : 'var(--short)' })

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
        <svg className='sample' viewBox={`0 0 ${W} ${H}`} role='img' aria-label='Supertrend example chart'>
            <rect x='1' y={P_TOP - 8} width={W - 2} height={P_BOT - P_TOP + 16} rx='8' className='sample__panel' />
            <rect x={cx(flip)} y={pY(target)} width={W - PAD_R - cx(flip)} height={pY(entry) - pY(target)} fill='var(--long)' opacity='0.1' />

            <Line v={target} color='var(--long)' label={t('card.target')} />
            <Line v={entry} color='var(--accent)' label={t('card.entry')} />

            <Candles bars={bars} cx={cx} pY={pY} body={body} />

            {segs.map((s, i) => (
                <polyline key={i} points={s.pts} fill='none' stroke={s.color} strokeWidth='1.8' opacity='0.95' />
            ))}
            <text x={cx(2)} y={P_TOP + 6} className='sample__legend' fill='var(--long)'>
                Supertrend
            </text>

            <line x1={PAD_L} x2={W - PAD_R} y1={pY(current)} y2={pY(current)} stroke='var(--text-dim)' strokeWidth='1' strokeDasharray='2 3' opacity='0.7' />
            <text x={labelX} y={pY(current) - 1.5} className='sample__tag' fill='var(--text)'>
                {t('card.now')}
            </text>
            <text x={labelX} y={pY(current) + 8.5} className='sample__price' fill='var(--text)'>
                {current.toFixed(2)}
            </text>

            <circle cx={cx(flip)} cy={pY(entry)} r='3.6' fill={GOLD} stroke='var(--surface)' strokeWidth='1.6' />
            <text x={(cx(flip) + (W - PAD_R)) / 2} y={(pY(target) + pY(entry)) / 2 + 3} className='sample__rr' fill='var(--long)' textAnchor='middle'>
                R:R {rr.toFixed(1)}
            </text>
        </svg>
    )
}
