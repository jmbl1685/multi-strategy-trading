// App-managed TP/SL for REAL futures positions.
//
// Some Binance accounts reject native conditional orders (TAKE_PROFIT_MARKET /
// STOP_MARKET) on /fapi/v1/order with -4120 ("use the Algo Order API endpoints
// instead"). As a reliable fallback we store the desired exit levels locally and
// market-close the position (which IS accepted) once the mark price hits them.
//
// Caveat: this only runs while the app is open — surfaced clearly in the UI.

import { Store } from '../utils/store'

export interface LocalTpSl {
    tp: number | null
    sl: number | null
}

type Db = Record<string, LocalTpSl>

const KEY = 'v-bounce-real-tpsl'
const listeners = new Set<() => void>()

const read = (): Db => Store.get<Db>(KEY, {})

const write = (s: Db) => {
    Store.set(KEY, s)
    listeners.forEach((fn) => fn())
}

export const subscribeTpSl = (fn: () => void): (() => void) => {
    listeners.add(fn)
    return () => {
        listeners.delete(fn)
    }
}

export const getLocalTpSl = (symbol: string): LocalTpSl => read()[symbol] ?? { tp: null, sl: null }

export const localTpSlSymbols = (): string[] => Object.keys(read())

export const setLocalTpSl = (symbol: string, tp: number | null, sl: number | null): void => {
    const s = read()
    if (tp === null && sl === null) delete s[symbol]
    else s[symbol] = { tp, sl }
    write(s)
}

export const clearLocalTpSl = (symbol: string): void => setLocalTpSl(symbol, null, null)
