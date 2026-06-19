import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Store } from '../utils/store'

// A display-only currency overlay. The user names a currency (e.g. COP) and a
// rate (1 USDT = `rate` units of it); when active, money amounts in the panel
// are shown converted, with that code instead of USDT. Trade values (prices,
// margin sent to Binance) are NOT converted — only what's displayed.

interface DisplayCurrencyValue {
    active: boolean
    code: string
    rate: number
    /** Unit label to show — the code when active, else 'USDT'. */
    unit: string
    /** Convert a USDT amount to the display unit. */
    conv: (usdt: number) => number
    setActive: (on: boolean) => void
    setCode: (code: string) => void
    setRate: (rate: number) => void
}

const DisplayCurrencyContext = createContext<DisplayCurrencyValue | null>(null)

const CODE_KEY = 'v-bounce-ccy-code'
const RATE_KEY = 'v-bounce-ccy-rate'
const ACTIVE_KEY = 'v-bounce-ccy-active'

export const DisplayCurrencyProvider = ({ children }: { children: ReactNode }) => {
    const [code, setCodeRaw] = useState<string>(() => Store.getString(CODE_KEY) ?? '')
    const [rate, setRate] = useState<number>(() => Number(Store.getString(RATE_KEY)) || 0)
    const [active, setActive] = useState<boolean>(() => Store.getString(ACTIVE_KEY) === 'on')

    useEffect(() => Store.setString(CODE_KEY, code), [code])
    useEffect(() => Store.setString(RATE_KEY, String(rate)), [rate])
    useEffect(() => Store.setString(ACTIVE_KEY, active ? 'on' : 'off'), [active])

    const setCode = (c: string) => setCodeRaw(c.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5))

    // Only honour the overlay when it's fully configured.
    const usable = active && code !== '' && rate > 0
    const unit = usable ? code : 'USDT'
    const conv = (usdt: number) => (usable ? usdt * rate : usdt)

    return (
        <DisplayCurrencyContext.Provider value={{ active, code, rate, unit, conv, setActive, setCode, setRate }}>
            {children}
        </DisplayCurrencyContext.Provider>
    )
}

export const useDisplayCurrency = (): DisplayCurrencyValue => {
    const ctx = useContext(DisplayCurrencyContext)
    if (!ctx) throw new Error('useDisplayCurrency must be used within DisplayCurrencyProvider')
    return ctx
}
