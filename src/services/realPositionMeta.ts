// App-side context for REAL futures positions that Binance doesn't track:
// the timeframe the position was opened from and when we placed it. Recorded
// locally (keyed by symbol) when the order goes through, so the positions panel
// can show "opened … ago · 15m" the same way demo positions do.
//
// Positions opened before this existed — or outside the app — simply have no
// entry here, and the panel shows no meta for them.

export interface PositionMeta {
    interval: string
    openedAt: number
}

type Store = Record<string, PositionMeta>

const KEY = 'v-bounce-real-posmeta'
const listeners = new Set<() => void>()

const read = (): Store => {
    try {
        const raw = localStorage.getItem(KEY)
        return raw ? (JSON.parse(raw) as Store) : {}
    } catch {
        return {}
    }
}

const write = (s: Store) => {
    try {
        localStorage.setItem(KEY, JSON.stringify(s))
    } catch {
        /* ignore quota / serialization errors */
    }
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

export const setPositionMeta = (symbol: string, interval: string, openedAt: number): void => {
    const s = read()
    s[symbol] = { interval, openedAt }
    write(s)
}

export const clearPositionMeta = (symbol: string): void => {
    const s = read()
    if (symbol in s) {
        delete s[symbol]
        write(s)
    }
}
