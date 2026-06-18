import type { Interval, SignalKind } from '../../types'
import { getHorizon } from '../../utils/horizon'
import { useI18n } from '../../context/I18nContext'
import './HorizonTag.scss'

interface HorizonTagProps {
    interval: Interval
    signal: SignalKind
}

export const HorizonTag = ({ interval, signal }: HorizonTagProps) => {
    const { t } = useI18n()
    const horizon = getHorizon(interval)

    const active = signal === 'LONG' || signal === 'SHORT'
    const holdLabel = active ? t('horizon.expectedHold') : t('horizon.setupHorizon')

    return (
        <div className='horizon-tag'>
            <div className='horizon-tag__row'>
                <span className={`horizon-tag__style horizon-tag__style--${horizon.style.toLowerCase()}`}>
                    ⏱ {t(`horizon.${horizon.style.toLowerCase()}`)}
                </span>
                <span className='horizon-tag__hold'>
                    {holdLabel} <b>≈ {horizon.hold}</b>
                </span>
            </div>
        </div>
    )
}
