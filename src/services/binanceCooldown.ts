// Circuit breaker + throttle for Binance REST.
//
// When the IP is rate-limited Binance replies 429, then bans with 418 and a
// body like { code: -1003, msg: "... banned until <epoch-ms> ..." }. The futures
// host (fapi) sends CORS headers so we CAN read that body and honor the exact
// unban time; the spot host often doesn't, so those failures arrive as opaque
// TypeErrors and we fall back to a consecutive-failure heuristic.
//
// Two independent deadlines:
//   • banUntil      — an exact ban time parsed from a response; a later success
//                     must NOT clear it (Binance bans are IP-wide, so one source
//                     succeeding doesn't mean the ban lifted on another).
//   • heuristicUntil — set after several blind failures when we can't read a time.

const TRIP_AFTER = 4
const COOLDOWN_MS = 90_000

let failures = 0
let heuristicUntil = 0
let banUntil = 0

const deadline = () => Math.max(heuristicUntil, banUntil)

/** True while we're backing off — callers must skip the request entirely. */
export const restBlocked = (): boolean => Date.now() < deadline()

/** Milliseconds left on the current cooldown (0 when not blocked). */
export const restCooldownMs = (): number => Math.max(0, deadline() - Date.now())

/** Successful request — clears the blind-failure streak only (never an exact ban). */
export const noteRestOk = (): void => {
    failures = 0
    heuristicUntil = 0
}

/** Opaque failure with no readable time — trips the breaker past the threshold. */
export const noteRestFail = (): void => {
    failures += 1
    if (failures >= TRIP_AFTER) heuristicUntil = Date.now() + COOLDOWN_MS
}

/** Exact unban time from a Binance ban message — honored until it actually lifts. */
export const noteRestBannedUntil = (ts: number): void => {
    if (Number.isFinite(ts) && ts > Date.now()) banUntil = Math.max(banUntil, ts)
}

/** Pull the unban timestamp out of a Binance ban message, if present. */
export const parseBanUntil = (msg: string | undefined): number | null => {
    const m = msg?.match(/banned until (\d+)/i)
    return m ? Number(m[1]) : null
}

// --- Throttle ----------------------------------------------------------------
// Serialize Binance REST calls with a minimum gap so a page full of cards can't
// fire a burst that trips the limit in the first place.

const MIN_GAP_MS = 220
let lastAt = 0
let chain: Promise<unknown> = Promise.resolve()

/** Queue a Binance REST call so calls are spaced at least MIN_GAP_MS apart. */
export const throttled = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = async (): Promise<T> => {
        const wait = MIN_GAP_MS - (Date.now() - lastAt)
        if (wait > 0) await new Promise((r) => setTimeout(r, wait))
        lastAt = Date.now()
        return fn()
    }
    const result = chain.then(run, run)
    chain = result.catch(() => {})
    return result
}
