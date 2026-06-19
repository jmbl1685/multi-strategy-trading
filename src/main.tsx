import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from './context/ThemeContext'
import { TechnicalModeProvider } from './context/TechnicalModeContext'
import { DisplayCurrencyProvider } from './context/DisplayCurrencyContext'
import { ActiveStrategyProvider } from './context/ActiveStrategyContext'
import { StrategyProvider } from './context/StrategyContext'
import { I18nProvider } from './context/I18nContext'
import { PaperTradingProvider } from './context/PaperTradingContext'
import { TradingModeProvider } from './context/TradingModeContext'
import { NotificationsProvider } from './context/NotificationsContext'
import { ToastProvider } from './context/ToastContext'
import { Analytics } from '@vercel/analytics/react'
import { App } from './App'
import { initCursors } from './utils/cursors'
import './global.scss'

initCursors()

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <I18nProvider>
            <ThemeProvider>
                <TechnicalModeProvider>
                    <DisplayCurrencyProvider>
                        <ActiveStrategyProvider>
                            <StrategyProvider>
                                <PaperTradingProvider>
                                    <TradingModeProvider>
                                        <NotificationsProvider>
                                            <ToastProvider>
                                                <App />
                                                <Analytics />
                                            </ToastProvider>
                                        </NotificationsProvider>
                                    </TradingModeProvider>
                                </PaperTradingProvider>
                            </StrategyProvider>
                        </ActiveStrategyProvider>
                    </DisplayCurrencyProvider>
                </TechnicalModeProvider>
            </ThemeProvider>
        </I18nProvider>
    </StrictMode>
)
