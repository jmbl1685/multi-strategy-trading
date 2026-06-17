import type { Candle, Interval } from '../types'
import type { BinanceSource } from './binanceSource'

// Binance WebSocket API (request/response), distinct from the market-data
// streams. It can return historical klines over a socket, so we use it to SEED
// indicators without a REST call — the path Binance recommends to dodge IP bans.
//
//   → { id, method: 'klines', params: { symbol, interval, limit } }
//   ← { id, status: 200, result: [[openTime, o, h, l, c, v, closeTime, …], …] }

const REQUEST_TIMEOUT_MS = 4000
// If a WS-API host can't connect/answer (e.g. it's tarpitted too), skip it for a
// while so we don't pay the connect timeout on every call before falling to REST.
const HOST_BACKOFF_MS = 60_000

interface Pending {
    resolve: (candles: Candle[]) => void
    reject: (err: unknown) => void
    timer: number
}

interface Conn {
    ws: WebSocket
    ready: Promise<void>
    pending: Map<string, Pending>
}

const conns = new Map<string, Conn>()
const downUntil = new Map<string, number>()
let seq = 0

const toCandle = (k: (string | number)[]): Candle => ({
    openTime: Number(k[0]),
    open: parseFloat(k[1] as string),
    high: parseFloat(k[2] as string),
    low: parseFloat(k[3] as string),
    close: parseFloat(k[4] as string),
    volume: parseFloat(k[5] as string),
    closed: true
})

const connect = (base: string): Conn => {
    const existing = conns.get(base)
    if (existing && existing.ws.readyState <= WebSocket.OPEN) return existing

    const ws = new WebSocket(base)
    const pending = new Map<string, Pending>()
    const conn: Conn = { ws, pending, ready: Promise.resolve() }

    conn.ready = new Promise<void>((resolve, reject) => {
        ws.addEventListener('open', () => resolve(), { once: true })
        ws.addEventListener('error', () => reject(new Error('WS API connect failed')), { once: true })
    })

    ws.addEventListener('message', (ev) => {
        let msg: { id?: string | number; status?: number; result?: unknown; error?: { msg?: string } }
        try {
            msg = JSON.parse(ev.data as string)
        } catch {
            return
        }
        if (msg.id == null) return
        const p = pending.get(String(msg.id))
        if (!p) return
        pending.delete(String(msg.id))
        window.clearTimeout(p.timer)
        if (msg.status === 200 && Array.isArray(msg.result)) {
            p.resolve((msg.result as (string | number)[][]).map(toCandle))
        } else {
            p.reject(new Error(msg.error?.msg ?? `WS API status ${msg.status}`))
        }
    })

    const fail = () => {
        conns.delete(base)
        for (const p of pending.values()) {
            window.clearTimeout(p.timer)
            p.reject(new Error('WS API closed'))
        }
        pending.clear()
    }
    ws.addEventListener('close', fail, { once: true })

    conns.set(base, conn)
    return conn
}

/** Fetch historical klines over the Binance WebSocket API. Throws on any failure
 *  (host blocked, timeout, error status) so the caller can fall back to REST. */
export const fetchKlinesWs = async (
    symbol: string,
    interval: Interval,
    limit: number,
    source: BinanceSource
): Promise<Candle[]> => {
    const base = source.wsApiBase
    if (Date.now() < (downUntil.get(base) ?? 0)) {
        throw new Error('WS API recently unavailable')
    }

    try {
        const conn = connect(base)
        await Promise.race([
            conn.ready,
            new Promise<never>((_, rej) => setTimeout(() => rej(new Error('WS API open timeout')), REQUEST_TIMEOUT_MS))
        ])

        const id = `k${++seq}`
        const candles = await new Promise<Candle[]>((resolve, reject) => {
            const timer = window.setTimeout(() => {
                conn.pending.delete(id)
                reject(new Error('WS API klines timeout'))
            }, REQUEST_TIMEOUT_MS)
            conn.pending.set(id, { resolve, reject, timer })
            try {
                conn.ws.send(JSON.stringify({ id, method: 'klines', params: { symbol, interval, limit } }))
            } catch (e) {
                conn.pending.delete(id)
                window.clearTimeout(timer)
                reject(e)
            }
        })
        downUntil.delete(base) // it works — clear any backoff
        return candles
    } catch (err) {
        downUntil.set(base, Date.now() + HOST_BACKOFF_MS)
        throw err
    }
}
