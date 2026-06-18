import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import { getActiveStrategy, setActiveStrategy } from '../strategies/registry'
import type { StrategyKind } from '../strategies/types'

interface ActiveStrategyValue {
    strategy: StrategyKind
    setStrategy: (id: StrategyKind) => void
}

const ActiveStrategyContext = createContext<ActiveStrategyValue | null>(null)

export const ActiveStrategyProvider = ({ children }: { children: ReactNode }) => {
    const [strategy, setStrategyState] = useState<StrategyKind>(getActiveStrategy)

    const setStrategy = (id: StrategyKind) => {
        // Updates the registry cache + localStorage (what buildSignal reads), then
        // the React state so every card recomputes its signal in place — no reload.
        setActiveStrategy(id)
        setStrategyState(id)
    }

    return (
        <ActiveStrategyContext.Provider value={{ strategy, setStrategy }}>
            {children}
        </ActiveStrategyContext.Provider>
    )
}

export const useActiveStrategy = (): ActiveStrategyValue => {
    const ctx = useContext(ActiveStrategyContext)
    if (!ctx) throw new Error('useActiveStrategy must be used within ActiveStrategyProvider')
    return ctx
}
