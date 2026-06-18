import { useMemo } from 'react'
import { emaSeries } from '../../indicators/ema'
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

// Uptrend (EMAs stacked) → a pullback that tags the 22-EMA → the resumption up.
const build = (): Bar[] => {
    const rnd = mulberry32(15)
    const closes: number[] = []
    let p = 95
    for (let i = 0; i < 30; i++) {
        p += 0.42 + (rnd() - 0.5) * 0.7
        closes.push(p)
    }
    for (let i = 0; i < 5; i++) {
        p += -0.95 + (rnd() - 0.5) * 0.4
        closes.push(p)
    }
    for (let i = 0; i < 10; i++) {
        p += 0.7 + (rnd() - 0.5) * 0.5
        closes.push(p)
    }
    return toBars(closes, 4)
}

export const EmaPullbackSample = () => {
    const { t } = useI18n()
    const model = useMemo(() => {
        const bars = build()
        const closes = bars.map((b) => b.close)
        const n = bars.length
        const e10 = emaSeries(closes, 10)
        const e22 = emaSeries(closes, 22)
        const e55 = emaSeries(closes, 55)

        // Pullback low = lowest low in the dip; entry = the reclaim bar after it.
        const dipFrom = 30
        let dipIdx = dipFrom
        for (let i = dipFrom; i < dipFrom + 6 && i < n; i++) if (bars[i].low < bars[dipIdx].low) dipIdx = i
        let entryIdx = dipIdx
        for (let i = dipIdx; i < n; i++) {
            if (closes[i] > e10[i]) {
                entryIdx = i
                break
            }
        }
        const entry = closes[entryIdx]
        const stop = bars[dipIdx].low * 0.995
        const highMax = Math.max(...bars.map((b) => b.high))
        const lowMin = Math.min(...bars.map((b) => b.low))
        const target = highMax + (highMax - lowMin) * 0.08
        const current = closes[n - 1]
        const rr = entry - stop > 0 ? (target - entry) / (entry - stop) : 0
        const rawMin = Math.min(stop, lowMin, ...e55.filter(Number.isFinite))
        const rawMax = Math.max(target, highMax)
        const span = rawMax - rawMin || 1
        return { bars, e10, e22, e55, n, dipIdx, entryIdx, entry, target, current, rr, pMin: rawMin - span * 0.06, pMax: rawMax + span * 0.06 }
    }, [])

    const { bars, e10, e22, e55, n, dipIdx, entryIdx, entry, target, current, rr, pMin, pMax } = model
    const cw = (W - PAD_L - PAD_R) / n
    const cx = (i: number) => PAD_L + (i + 0.5) * cw
    const pY = (v: number) => P_TOP + ((pMax - v) / (pMax - pMin)) * (P_BOT - P_TOP)
    const body = Math.max(1.4, cw * 0.6)
    const labelX = W - PAD_R + 6
    const tradeX = cx(entryIdx)

    const path = (arr: number[]) =>
        arr.map((v, i) => (Number.isFinite(v) ? `${cx(i).toFixed(1)},${pY(v).toFixed(1)}` : null)).filter(Boolean).join(' ')

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
        <svg className='sample' viewBox={`0 0 ${W} ${H}`} role='img' aria-label='EMA pullback example chart'>
            <rect x='1' y={P_TOP - 8} width={W - 2} height={P_BOT - P_TOP + 16} rx='8' className='sample__panel' />
            <rect x={cx(entryIdx)} y={pY(target)} width={W - PAD_R - cx(entryIdx)} height={pY(entry) - pY(target)} fill='var(--long)' opacity='0.1' />

            <Line v={target} color='var(--long)' label={t('card.target')} />
            <Line v={entry} color='var(--accent)' label={t('card.entry')} />

            <Candles bars={bars} cx={cx} pY={pY} body={body} />

            <polyline points={path(e55)} fill='none' stroke='var(--text-dim)' strokeWidth='1.4' />
            <polyline points={path(e22)} fill='none' stroke='var(--accent)' strokeWidth='1.5' />
            <polyline points={path(e10)} fill='none' stroke='var(--cyan)' strokeWidth='1.5' />
            <text x={cx(2)} y={pY(e10[10] ?? bars[10].close) - 6} className='sample__legend' fill='var(--cyan)'>
                EMA 10 · 22 · 55
            </text>

            <line x1={PAD_L} x2={W - PAD_R} y1={pY(current)} y2={pY(current)} stroke='var(--text-dim)' strokeWidth='1' strokeDasharray='2 3' opacity='0.7' />
            <text x={labelX} y={pY(current) - 1.5} className='sample__tag' fill='var(--text)'>
                {t('card.now')}
            </text>
            <text x={labelX} y={pY(current) + 8.5} className='sample__price' fill='var(--text)'>
                {current.toFixed(2)}
            </text>

            {/* pullback marker + entry */}
            <circle cx={cx(dipIdx)} cy={pY(bars[dipIdx].low)} r='3' fill='none' stroke='var(--accent)' strokeWidth='1.6' />
            <circle cx={cx(entryIdx)} cy={pY(entry)} r='3.6' fill={GOLD} stroke='var(--surface)' strokeWidth='1.6' />
            <text x={(cx(entryIdx) + (W - PAD_R)) / 2} y={(pY(target) + pY(entry)) / 2 + 3} className='sample__rr' fill='var(--long)' textAnchor='middle'>
                R:R {rr.toFixed(1)}
            </text>
        </svg>
    )
}
