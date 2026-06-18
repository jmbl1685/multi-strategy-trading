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
const CHANNEL = 20

// A range that compresses, then a clean breakout above the channel high.
const build = (): Bar[] => {
    const rnd = mulberry32(21)
    const closes: number[] = []
    let p = 100
    for (let i = 0; i < 26; i++) {
        p += (rnd() - 0.5) * 1.8
        p = Math.max(98, Math.min(102, p))
        closes.push(p)
    }
    for (let i = 0; i < 10; i++) {
        p += 0.85 + (rnd() - 0.5) * 0.5
        closes.push(p)
    }
    return toBars(closes, 9)
}

export const DonchianSample = () => {
    const { t } = useI18n()
    const model = useMemo(() => {
        const bars = build()
        const n = bars.length
        const upper = new Array<number>(n).fill(NaN)
        const lower = new Array<number>(n).fill(NaN)
        for (let i = CHANNEL - 1; i < n; i++) {
            const win = bars.slice(i - CHANNEL + 1, i + 1)
            upper[i] = Math.max(...win.map((b) => b.high))
            lower[i] = Math.min(...win.map((b) => b.low))
        }
        // Breakout = first bar that closes above the prior bar's channel high.
        let entryIdx = n - 1
        for (let i = CHANNEL; i < n; i++) {
            if (Number.isFinite(upper[i - 1]) && bars[i].close > upper[i - 1]) {
                entryIdx = i
                break
            }
        }
        const entry = bars[entryIdx].close
        const stop = Math.min(...bars.slice(entryIdx - 10, entryIdx + 1).map((b) => b.low)) * 0.997
        const highMax = Math.max(...bars.map((b) => b.high))
        const lowMin = Math.min(...bars.map((b) => b.low))
        const target = highMax + (highMax - lowMin) * 0.12
        const current = bars[n - 1].close
        const rr = entry - stop > 0 ? (target - entry) / (entry - stop) : 0
        const rawMin = Math.min(stop, lowMin)
        const rawMax = Math.max(target, highMax)
        const span = rawMax - rawMin || 1
        return { bars, upper, lower, n, entryIdx, entry, target, current, rr, pMin: rawMin - span * 0.06, pMax: rawMax + span * 0.06 }
    }, [])

    const { bars, upper, lower, n, entryIdx, entry, target, current, rr, pMin, pMax } = model
    const cw = (W - PAD_L - PAD_R) / n
    const cx = (i: number) => PAD_L + (i + 0.5) * cw
    const pY = (v: number) => P_TOP + ((pMax - v) / (pMax - pMin)) * (P_BOT - P_TOP)
    const body = Math.max(1.4, cw * 0.6)
    const labelX = W - PAD_R + 6
    const tradeX = cx(entryIdx)

    const fi = CHANNEL - 1
    const path = (arr: number[]) =>
        arr.map((v, i) => (Number.isFinite(v) ? `${cx(i).toFixed(1)},${pY(v).toFixed(1)}` : null)).filter(Boolean).join(' ')
    const areaTop = upper.slice(fi).map((v, i) => `${cx(fi + i).toFixed(1)},${pY(v).toFixed(1)}`)
    const areaBot = lower.slice(fi).map((v, i) => `${cx(fi + i).toFixed(1)},${pY(v).toFixed(1)}`).reverse()
    const channelArea = `M${areaTop.join(' L')} L${areaBot.join(' L')} Z`

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
        <svg className='sample' viewBox={`0 0 ${W} ${H}`} role='img' aria-label='Donchian breakout example chart'>
            <rect x='1' y={P_TOP - 8} width={W - 2} height={P_BOT - P_TOP + 16} rx='8' className='sample__panel' />

            <path d={channelArea} fill='var(--text-dim)' opacity='0.06' />
            <polyline points={path(upper)} fill='none' stroke='var(--text-dim)' strokeWidth='1.3' />
            <polyline points={path(lower)} fill='none' stroke='var(--text-dim)' strokeWidth='1.3' />
            <text x={cx(fi)} y={pY(upper[fi]) - 5} className='sample__legend' fill='var(--text-dim)'>
                Donchian 20
            </text>

            <Line v={target} color='var(--long)' label={t('card.target')} />
            <Line v={entry} color='var(--accent)' label={t('card.entry')} />

            <Candles bars={bars} cx={cx} pY={pY} body={body} />

            <line x1={PAD_L} x2={W - PAD_R} y1={pY(current)} y2={pY(current)} stroke='var(--text-dim)' strokeWidth='1' strokeDasharray='2 3' opacity='0.7' />
            <text x={labelX} y={pY(current) - 1.5} className='sample__tag' fill='var(--text)'>
                {t('card.now')}
            </text>
            <text x={labelX} y={pY(current) + 8.5} className='sample__price' fill='var(--text)'>
                {current.toFixed(2)}
            </text>

            <circle cx={cx(entryIdx)} cy={pY(entry)} r='3.6' fill={GOLD} stroke='var(--surface)' strokeWidth='1.6' />
            <text x={(cx(entryIdx) + (W - PAD_R)) / 2} y={(pY(target) + pY(entry)) / 2 + 3} className='sample__rr' fill='var(--long)' textAnchor='middle'>
                R:R {rr.toFixed(1)}
            </text>
        </svg>
    )
}
