---
name: storage
description: Persist anything to the browser — read or write localStorage. Use whenever adding or changing persisted state (a setting, flag, cached object, watchlist, etc.). Enforces the rule "never call localStorage directly — go through the Store wrapper".
---

# Browser storage — always use `Store`

The app has **one** place that touches `localStorage`: the static [`Store`](src/utils/store.ts)
class (`src/utils/store.ts`). Everything else must go through it — never call
`localStorage.getItem/setItem/removeItem` directly in any other file.

Why: `Store` wraps every read/write in try/catch (quota, privacy mode, bad JSON) so a
storage failure can never throw into the UI, and it keeps serialization consistent.

## The API (all static — call `Store.x(...)`)

- `Store.get<T>(key, fallback)` — parse a JSON value (objects/arrays); returns `fallback` if missing/invalid.
- `Store.set(key, value)` — JSON-serialize and store. **Upsert** (it both adds and updates — there is no separate `add`).
- `Store.getString(key)` — raw string, or `null`. Use for plain flags: `'on'/'off'`, `'true'`, a theme name, an interval.
- `Store.setString(key, value)` — write a raw string.
- `Store.update<T>(key, updater, fallback)` — read-modify-write a JSON value in one call.
- `Store.remove(key)` — delete a key.
- `Store.has(key)` — existence check.

## Rules

1. **Never** import or call `localStorage` outside `src/utils/store.ts`. Import `Store` instead:
   `import { Store } from '../utils/store'` (adjust the relative depth).
2. **Match the value's shape to the method.** Objects/arrays → `get`/`set` (JSON). Plain
   string flags → `getString`/`setString`. Don't JSON-wrap a value that was stored as a raw
   string (it changes the on-disk format and breaks existing reads).
3. **Keep keys stable.** All existing keys are the literal `v-bounce-*` strings, kept as
   module-level `const KEY = 'v-bounce-…'`. `Store` does **not** add a prefix — pass the full
   key. Renaming a key silently drops users' saved data, so don't unless you intend a reset.
4. Prefer the one-liner forms the codebase uses:
   `const read = () => Store.get<Map>(KEY, {})` / `Store.set(KEY, value)` — no manual
   `try/JSON.parse/catch` boilerplate.

## Typical patterns

```ts
// JSON object/array store (e.g. paper state, history, settings map)
const read = (): Db => Store.get<Db>(KEY, {})
const write = (db: Db) => Store.set(KEY, db)

// Plain flag
const dark = Store.getString(THEME_KEY) === 'dark'
Store.setString(THEME_KEY, theme)

// Read-modify-write
Store.update<Db>(KEY, (db) => ({ ...db, [id]: value }), {})

// Clear
Store.remove(KEY)
```

## Verify

After adding storage, run `pnpm build`, and grep to confirm the rule holds — this should return
ONLY `src/utils/store.ts`:

```
rg "localStorage\.(get|set|remove)Item" src
```
