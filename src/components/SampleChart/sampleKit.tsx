import type { ReactNode } from 'react'

export interface Bar {
    open: number
    high: number
    low: number
    close: number
}

// Deterministic RNG so every sample looks identical across renders.
export const mulberry32 = (seed: number) => () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** Turn a close series into candles with small deterministic wicks. */
export const toBars = (closes: number[], seed = 7): Bar[] => {
    const wick = mulberry32(seed)
    return closes.map((c, i) => {
        const open = i > 0 ? closes[i - 1] : c
        const high = Math.max(open, c) + wick() * 0.4
        const low = Math.min(open, c) - wick() * 0.4
        return { open, high, low, close: c }
    })
}

interface CandlesProps {
    bars: Bar[]
    cx: (i: number) => number
    pY: (v: number) => number
    body: number
}

export const Candles = ({ bars, cx, pY, body }: CandlesProps): ReactNode => (
    <>
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
    </>
)
