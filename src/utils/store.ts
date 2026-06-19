/**
 * The single place the app touches persistent browser storage — a static
 * wrapper around localStorage. Every read/write is try/caught (quota, privacy
 * mode, serialization) so a storage failure never throws into the UI.
 *
 * Keys are passed in full (the app keeps its existing `v-bounce-*` keys, so
 * nothing changes on disk). Use the JSON methods for objects/arrays and the
 * string methods for plain flags ('on'/'off', 'true', a theme name, …) — matching
 * how each value was already stored.
 *
 * Note: `set` is an upsert — it both adds a new key and updates an existing one.
 */
export class Store {
    private constructor() {}

    /** Raw string value, or null if missing/unavailable. */
    static getString(key: string): string | null {
        try {
            return localStorage.getItem(key)
        } catch {
            return null
        }
    }

    /** Write a raw string value (add or update). */
    static setString(key: string, value: string): void {
        try {
            localStorage.setItem(key, value)
        } catch {
            /* ignore quota / privacy-mode errors */
        }
    }

    /** Parse a JSON value, returning `fallback` when missing or invalid. */
    static get<T>(key: string, fallback: T): T {
        try {
            const raw = localStorage.getItem(key)
            return raw == null ? fallback : (JSON.parse(raw) as T)
        } catch {
            return fallback
        }
    }

    /** Serialize and store a JSON value (add or update). */
    static set(key: string, value: unknown): void {
        try {
            localStorage.setItem(key, JSON.stringify(value))
        } catch {
            /* ignore quota / serialization errors */
        }
    }

    /** Read-modify-write a JSON value in one call. */
    static update<T>(key: string, updater: (prev: T) => T, fallback: T): void {
        Store.set(key, updater(Store.get(key, fallback)))
    }

    /** Remove a key. */
    static remove(key: string): void {
        try {
            localStorage.removeItem(key)
        } catch {
            /* ignore */
        }
    }

    /** True when the key exists. */
    static has(key: string): boolean {
        return Store.getString(key) !== null
    }
}
