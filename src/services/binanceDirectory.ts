import { SOURCE_CHAIN } from './binanceSource'

export interface MarketInfo {
    symbol: string
    base: string
    decimals: number
    /** Decimals allowed for the order quantity (base asset). */
    qtyPrecision: number
    /** Minimum order notional in USDT. */
    minNotional: number
    lastPrice: number
    changePct: number
    quoteVolume: number
}

interface RawSymbol {
    symbol: string
    baseAsset: string
    quoteAsset: string
    status: string
    contractType?: string
    pricePrecision?: number
    quantityPrecision?: number
    filters?: { filterType: string; tickSize?: string; stepSize?: string; notional?: string; minNotional?: string }[]
}

interface RawTicker {
    symbol: string
    lastPrice: string
    priceChangePercent: string
    quoteVolume: string
}

const tickToDecimals = (tickSize: string): number => {
    const t = tickSize.replace(/0+$/, '')
    const dot = t.indexOf('.')
    return dot === -1 ? 0 : t.length - dot - 1
}

// Stablecoins and fiat-pegged tokens — excluded from the directory. A V-bounce
// needs a volatile underlying, and these clutter the list (and aren't real
// USDT-M perps anyway). Matched against the symbol's base asset.
const EXCLUDED_BASES = new Set([
    'USDC', 'USDT', 'BUSD', 'FDUSD', 'TUSD', 'DAI', 'USDP', 'USDD', 'USD1',
    'PYUSD', 'USDE', 'GUSD', 'LUSD', 'FRAX', 'AEUR', 'EUR', 'EURI', 'GBP',
    'XUSD', 'USTC', 'USD'
])

let cache: MarketInfo[] | null = null
let inflight: Promise<MarketInfo[]> | null = null

// Cap any single source's fetch so a tarpitted/geo-restricted endpoint can't
// hang the dropdown — we abort and fall through to the next source instead.
const SOURCE_TIMEOUT_MS = 6000

const fetchWithTimeout = async (url: string): Promise<Response> => {
    const ctrl = new AbortController()
    const timer = window.setTimeout(() => ctrl.abort(), SOURCE_TIMEOUT_MS)
    try {
        return await fetch(url, { signal: ctrl.signal })
    } finally {
        window.clearTimeout(timer)
    }
}

const load = async (): Promise<MarketInfo[]> => {
    // The directory always comes from Futures first (regardless of which source
    // happens to deliver live price frames — futures' market-data WS is
    // geo-restricted in some regions, but its REST exchangeInfo is not). Spot is
    // only a last-resort fallback if futures REST is entirely unreachable.
    for (const source of SOURCE_CHAIN) {
        try {
            const [infoRes, tickRes] = await Promise.all([
                fetchWithTimeout(`${source.restBase}/exchangeInfo`),
                fetchWithTimeout(`${source.restBase}/ticker/24hr`)
            ])
            if (!infoRes.ok || !tickRes.ok) continue

            const info: { symbols?: RawSymbol[] } = await infoRes.json()
            const ticks: RawTicker[] = await tickRes.json()
            const tickMap = new Map(ticks.map((t) => [t.symbol, t]))

            const list: MarketInfo[] = []
            for (const s of info.symbols ?? []) {
                if (s.status !== 'TRADING') continue
                // Futures: perpetuals only. Spot: no contractType, so accept.
                if (s.contractType && s.contractType !== 'PERPETUAL') continue
                if (s.quoteAsset !== 'USDT') continue
                if (EXCLUDED_BASES.has(s.baseAsset)) continue

                const t = tickMap.get(s.symbol)
                const priceFilter = s.filters?.find((f) => f.filterType === 'PRICE_FILTER')
                const lotFilter = s.filters?.find((f) => f.filterType === 'LOT_SIZE')
                const notionalFilter = s.filters?.find((f) => f.filterType === 'MIN_NOTIONAL')
                const qtyPrecision =
                    s.quantityPrecision ?? (lotFilter?.stepSize ? tickToDecimals(lotFilter.stepSize) : 3)
                list.push({
                    symbol: s.symbol,
                    base: s.baseAsset,
                    decimals: priceFilter?.tickSize ? tickToDecimals(priceFilter.tickSize) : s.pricePrecision ?? 2,
                    qtyPrecision,
                    minNotional: parseFloat(notionalFilter?.notional ?? notionalFilter?.minNotional ?? '5'),
                    lastPrice: t ? parseFloat(t.lastPrice) : NaN,
                    changePct: t ? parseFloat(t.priceChangePercent) : 0,
                    quoteVolume: t ? parseFloat(t.quoteVolume) : 0
                })
            }

            if (list.length) {
                list.sort((a, b) => b.quoteVolume - a.quoteVolume)
                return list
            }
        } catch {
            /* try the next source */
        }
    }
    return []
}

/** Fetch the tradable market directory once; memoised for the session. */
export const fetchDirectory = async (): Promise<MarketInfo[]> => {
    if (cache) return cache
    if (!inflight) inflight = load().then((l) => (cache = l))
    return inflight
}

/** Look up a symbol in the cached directory (after fetchDirectory has run). */
export const getMarket = async (symbol: string): Promise<MarketInfo | undefined> => {
    const dir = await fetchDirectory()
    return dir.find((m) => m.symbol === symbol)
}

export type DirSort = 'vol' | 'gainers' | 'losers'

/** Filter the directory by query (prefix matches first), then sort. */
export const searchDirectory = (
    dir: MarketInfo[],
    query: string,
    sort: DirSort = 'vol',
    limit = 200
): MarketInfo[] => {
    const q = query.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')

    let matches: MarketInfo[]
    if (!q) {
        matches = dir
    } else {
        const prefix: MarketInfo[] = []
        const contains: MarketInfo[] = []
        for (const m of dir) {
            if (m.base.startsWith(q) || m.symbol.startsWith(q)) prefix.push(m)
            else if (m.symbol.includes(q)) contains.push(m)
        }
        matches = [...prefix, ...contains]
    }

    if (sort === 'gainers') matches = [...matches].sort((a, b) => b.changePct - a.changePct)
    else if (sort === 'losers') matches = [...matches].sort((a, b) => a.changePct - b.changePct)
    // 'vol' keeps the volume-ordered (and prefix-ranked when searching) order.

    return matches.slice(0, limit)
}
