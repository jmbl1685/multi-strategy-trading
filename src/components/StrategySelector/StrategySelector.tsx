import { useState } from 'react'
import { useI18n } from '../../context/I18nContext'
import { useActiveStrategy } from '../../context/ActiveStrategyContext'
import { STRATEGIES } from '../../strategies/registry'
import type { StrategyKind } from '../../strategies/types'
import { StrategyInfoModal } from '../StrategyInfoModal/StrategyInfoModal'
import { Store } from '../../utils/store'
import './StrategySelector.scss'

const SEEN_KEY = 'v-bounce-strategy-seen'

export const StrategySelector = () => {
    const { t } = useI18n()
    const { strategy: active, setStrategy } = useActiveStrategy()
    const [open, setOpen] = useState(false)
    const [info, setInfo] = useState<StrategyKind | null>(null)
    // Pulse the selector once, until the user has opened it — a discoverability nudge.
    const [seen, setSeen] = useState(() => Store.getString(SEEN_KEY) === 'true')

    const toggle = () => {
        if (!seen) {
            setSeen(true)
            Store.setString(SEEN_KEY, 'true')
        }
        setOpen((o) => !o)
    }

    const choose = (id: StrategyKind) => {
        setOpen(false)
        if (id === active) return
        // Switch in place — cards recompute their signals live, no reload.
        setStrategy(id)
    }

    return (
        <div className='strat-select'>
            <button
                className={`strat-select__btn ${!seen ? 'is-pulse' : ''}`}
                onClick={toggle}
                aria-expanded={open}
                title={t('strategy.choose')}
            >
                <span className='strat-select__label'>{t('strategy.label')}</span>
                <b>{t(`strategy.${active}.name`)}</b>
                <span className='strat-select__chev' aria-hidden>
                    ▾
                </span>
            </button>

            {open && (
                <>
                    <div className='strat-select__overlay' onClick={() => setOpen(false)} />
                    <div className='strat-select__menu'>
                        {STRATEGIES.map((s) => (
                            <div
                                key={s.id}
                                className={`strat-select__item ${s.id === active ? 'is-active' : ''} ${s.available ? '' : 'is-soon'}`}
                            >
                                <button
                                    className='strat-select__pick'
                                    disabled={!s.available}
                                    onClick={() => s.available && choose(s.id)}
                                >
                                    <span className='strat-select__name'>
                                        {t(`strategy.${s.id}.name`)}
                                        {s.id === active && <i className='strat-select__dot' aria-hidden />}
                                        {!s.available && <span className='strat-select__soon'>{t('strategy.comingSoon')}</span>}
                                    </span>
                                    <span className='strat-select__tag'>{t(`strategy.${s.id}.tagline`)}</span>
                                </button>
                                <button
                                    className='strat-select__info'
                                    onClick={() => setInfo(s.id)}
                                    aria-label={t('strategy.explain')}
                                    title={t('strategy.explain')}
                                >
                                    ⓘ
                                </button>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {info && <StrategyInfoModal id={info} onClose={() => setInfo(null)} />}
        </div>
    )
}
