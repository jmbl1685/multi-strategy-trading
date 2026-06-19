// App-side context for REAL futures positions that Binance doesn't track:
// the timeframe the position was opened from and when we placed it. Recorded
// locally (keyed by symbol) when the order goes through, so the positions panel
// can show "opened … ago · 15m" the same way demo positions do.
//
// Positions opened before this existed — or outside the app — simply have no
// entry here, and the panel shows no meta for them.

import { Store } from '../utils/store'

export interface PositionMeta {
    interval: string
    openedAt: number
    /** Active strategy id when the position was opened (e.g. 'vbounce'). */
    strategy?: string
}

type Db = Record<string, PositionMeta>

const KEY = 'v-bounce-real-posmeta'
const listeners = new Set<() => void>()

const read = (): Db => Store.get<Db>(KEY, {})

const write = (s: Db) => {
    Store.set(KEY, s)
    listeners.forEach((fn) => fn())
}

export const subscribePositionMeta = (fn: () => void): (() => void) => {
    listeners.add(fn)
    return () => {
        listeners.delete(fn)
    }
}

export const getPositionMeta = (symbol: string): PositionMeta | null => read()[symbol] ?? null

export const positionMetaSymbols = (): string[] => Object.keys(read())

export const setPositionMeta = (symbol: string, interval: string, openedAt: number, strategy?: string): void => {
    const s = read()
    s[symbol] = { interval, openedAt, strategy }
    write(s)
}

export const clearPositionMeta = (symbol: string): void => {
    const s = read()
    if (symbol in s) {
        delete s[symbol]
        write(s)
    }
}
