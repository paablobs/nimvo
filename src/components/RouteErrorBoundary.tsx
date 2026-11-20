import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../i18n/useI18n.ts'

function RouteLoadError() {
  const { t } = useI18n()
  return <section className="page-section compact-section" role="alert">
    <h1>{t('pageLoadErrorTitle')}</h1>
    <p>{t('pageLoadError')}</p>
    <Link className="button button-secondary" to="/boveda">{t('backToVault')}</Link>
  </section>
}

/**
 * Contains failures while loading a lazy route (for example a chunk that no
 * longer exists after a deploy) so the rest of the app, and the unsaved vault
 * held in memory, stays mounted.
 */
export default class RouteErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() { return { failed: true } }

  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Route failed to load', error, info.componentStack) }

  render() { return this.state.failed ? <RouteLoadError /> : this.props.children }
}
