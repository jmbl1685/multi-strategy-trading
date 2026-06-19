import { useState } from 'react'
import { useI18n } from '../../context/I18nContext'
import { useActiveStrategy } from '../../context/ActiveStrategyContext'
import { StrategyInfoModal } from '../StrategyInfoModal/StrategyInfoModal'
import { Store } from '../../utils/store'
import './HowItWorks.scss'

const STORAGE_KEY = 'v-bounce-howitworks-open'
const HISTORY_BARS = 1000

export const HowItWorks = () => {
    const { t } = useI18n()
    const { strategy } = useActiveStrategy()
    const [open, setOpen] = useState(() => Store.getString(STORAGE_KEY) !== 'false')
    const [showExample, setShowExample] = useState(false)

    const toggle = () => {
        setOpen((o) => {
            Store.setString(STORAGE_KEY, String(!o))
            return !o
        })
    }

    return (
        <section className={`how ${open ? 'is-open' : ''}`}>
            <button className='how__head' onClick={toggle} aria-expanded={open}>
                <span className='how__title'>
                    <span className='how__icon'>ℹ️</span>
                    {t('how.title')}
                    <span className='how__subtitle'>{t('how.subtitle')}</span>
                </span>
                <span className='how__chevron' aria-hidden>
                    ▾
                </span>
            </button>
            {open && (
                <div className='how__body'>
                    <h4 className='how__section'>{t(`strategy.${strategy}.name`)}</h4>
                    <p dangerouslySetInnerHTML={{ __html: t(`strategy.${strategy}.intro`) }} />
                    <button className='how__example' onClick={() => setShowExample(true)}>
                        📈 {t('how.example')}
                    </button>

                    <h4 className='how__section'>{t('how.btTitle')}</h4>
                    <p dangerouslySetInnerHTML={{ __html: t('bt.explain1', { bars: HISTORY_BARS }) }} />
                    <p dangerouslySetInnerHTML={{ __html: t('bt.explain2') }} />
                </div>
            )}

            {showExample && <StrategyInfoModal id={strategy} onClose={() => setShowExample(false)} />}
        </section>
    )
}
