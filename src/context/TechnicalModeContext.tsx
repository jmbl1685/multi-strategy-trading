import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Store } from '../utils/store'

interface TechnicalModeContextValue {
    /** When true, cards show the full indicator readout (RSI/MACD/EMA/Smart Money). */
    technical: boolean
    toggle: () => void
}

const TechnicalModeContext = createContext<TechnicalModeContextValue | null>(null)

const STORAGE_KEY = 'v-bounce-technical'

const getInitial = (): boolean => Store.getString(STORAGE_KEY) !== 'off'

export const TechnicalModeProvider = ({ children }: { children: ReactNode }) => {
    const [technical, setTechnical] = useState<boolean>(getInitial)

    useEffect(() => {
        Store.setString(STORAGE_KEY, technical ? 'on' : 'off')
    }, [technical])

    const toggle = () => setTechnical((v) => !v)

    return (
        <TechnicalModeContext.Provider value={{ technical, toggle }}>
            {children}
        </TechnicalModeContext.Provider>
    )
}

export const useTechnicalMode = (): TechnicalModeContextValue => {
    const ctx = useContext(TechnicalModeContext)
    if (!ctx) throw new Error('useTechnicalMode must be used within TechnicalModeProvider')
    return ctx
}
