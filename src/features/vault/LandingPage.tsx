import { Link } from 'react-router-dom'
import { useI18n } from '../../i18n/useI18n.ts'

function LandingPage() {
  const { t } = useI18n()
  return (
    <section className="landing page-section">
      <div className="landing-copy">
      <p className="eyebrow">{t('localFile')}</p>
        <h1>{t('landingTitle')}</h1>
        <p className="lede">{t('landingLead')}</p>
        <div className="action-row">
          <Link className="button button-primary" to="/crear">
            {t('createFileAction')}
          </Link>
          <Link className="button button-secondary" to="/abrir">
            {t('openFileAction')}
          </Link>
        </div>
        <p className="local-note">
          {t('localDataNote')}
        </p>
      </div>
      <aside className="landing-aside" aria-label={t('currentVersion')}>
        <span className="aside-label">{t('currentVersion')}</span>
        <strong>Nimvo V2</strong>
        <p>{t('versionDescription')}</p>
      </aside>
    </section>
  )
}

export default LandingPage
