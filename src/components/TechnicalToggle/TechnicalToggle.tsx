import { useTechnicalMode } from '../../context/TechnicalModeContext'
import { useI18n } from '../../context/I18nContext'
import './TechnicalToggle.scss'

export const TechnicalToggle = () => {
    const { technical, toggle } = useTechnicalMode()
    const { t } = useI18n()
    const label = technical ? t('tech.on') : t('tech.off')

    return (
        <button
            className='tech-toggle'
            onClick={toggle}
            aria-label={label}
            aria-pressed={technical}
            title={label}
        >
            <span className={`tech-toggle__track ${technical ? 'is-on' : ''}`}>
                <span className='tech-toggle__thumb'>{technical ? '📊' : '👁'}</span>
            </span>
        </button>
    )
}
