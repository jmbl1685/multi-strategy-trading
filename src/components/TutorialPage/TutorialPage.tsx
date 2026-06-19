import { createPortal } from 'react-dom'
import { useI18n } from '../../context/I18nContext'
import { LanguageToggle } from '../LanguageToggle/LanguageToggle'
import './TutorialPage.scss'

interface TutorialPageProps {
    onClose: () => void
}

type Tone = 'long' | 'short' | 'risk'
interface Section {
    key: string
    icon: string
    tone?: Tone
    ex?: boolean
    table?: boolean
}

const SECTIONS: Section[] = [
    { key: 'futures', icon: '🔮' },
    { key: 'long', icon: '🟢', tone: 'long', ex: true },
    { key: 'short', icon: '🔴', tone: 'short', ex: true },
    { key: 'coverage', icon: '🛡️', ex: true },
    { key: 'leverage', icon: '⚙️', table: true },
    { key: 'margin', icon: '💵', ex: true },
    { key: 'liquidation', icon: '⚠️', tone: 'short', ex: true },
    { key: 'tp', icon: '🎯', tone: 'long', ex: true },
    { key: 'sl', icon: '🛑', tone: 'short', ex: true },
    { key: 'rr', icon: '⚖️', ex: true },
    { key: 'funding', icon: '🔄' },
    { key: 'risk', icon: '🚨', tone: 'risk' }
]

const LEV_ROWS = [
    { lev: '1×', controls: '$100', up: '+$2', down: '−$2' },
    { lev: '5×', controls: '$500', up: '+$10', down: '−$10' },
    { lev: '10×', controls: '$1,000', up: '+$20', down: '−$20' },
    { lev: '20×', controls: '$2,000', up: '+$40', down: '−$40' },
    { lev: '50×', controls: '$5,000', up: '+$100', down: '−$100' }
]

export const TutorialPage = ({ onClose }: TutorialPageProps) => {
    const { t } = useI18n()

    return createPortal(
        <div className='tutpage' role='dialog' aria-modal='true'>
            <header className='tutpage__bar'>
                <button className='tutpage__back' onClick={onClose}>
                    {t('tut.back')}
                </button>
                <LanguageToggle />
            </header>

            <div className='tutpage__content'>
                <h1 className='tutpage__title'>🎓 {t('tut.title')}</h1>
                <p className='tutpage__sub'>{t('tut.subtitle')}</p>

                {SECTIONS.map((s) => (
                    <section key={s.key} className={`tutpage__sec ${s.tone ? `tutpage__sec--${s.tone}` : ''}`}>
                        <h2 className='tutpage__sec-title'>
                            <span className='tutpage__ico' aria-hidden>
                                {s.icon}
                            </span>
                            {t(`tut.${s.key}.t`)}
                        </h2>
                        <p className='tutpage__body' dangerouslySetInnerHTML={{ __html: t(`tut.${s.key}.b`) }} />

                        {s.table && (
                            <table className='tutpage__table'>
                                <thead>
                                    <tr>
                                        <th>{t('tut.tbl.lev')}</th>
                                        <th>{t('tut.tbl.controls')}</th>
                                        <th>{t('tut.tbl.up')}</th>
                                        <th>{t('tut.tbl.down')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {LEV_ROWS.map((r) => (
                                        <tr key={r.lev}>
                                            <td className='tutpage__lev'>{r.lev}</td>
                                            <td>{r.controls}</td>
                                            <td className='is-up'>{r.up}</td>
                                            <td className='is-down'>{r.down}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}

                        {s.ex && (
                            <div className='tutpage__ex'>
                                <span className='tutpage__ex-label'>{t('tut.exLabel')}</span>
                                <p dangerouslySetInnerHTML={{ __html: t(`tut.${s.key}.ex`) }} />
                            </div>
                        )}
                    </section>
                ))}

                <p className='tutpage__note'>{t('tut.note')}</p>
                <button className='tutpage__got' onClick={onClose}>
                    {t('tut.got')}
                </button>
            </div>
        </div>,
        document.body
    )
}
