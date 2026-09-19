import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useI18n } from '../i18n/useI18n.ts'

const siteUrl = 'https://paablobs.github.io/nimvo/'
function setMeta(selector: string, content: string) {
  document.querySelector<HTMLMetaElement>(selector)?.setAttribute('content', content)
}

function setStructuredData(locale: 'en' | 'es', description: string) {
  const script = document.querySelector<HTMLScriptElement>('script[type="application/ld+json"]')
  if (!script) return
  try {
    const data = JSON.parse(script.textContent ?? '{}') as Record<string, unknown>
    data.description = description
    data.inLanguage = locale === 'en' ? 'en' : 'es-AR'
    data.operatingSystem = locale === 'en' ? 'Any system with a modern web browser' : 'Cualquier sistema con un navegador web moderno'
    data.browserRequirements = locale === 'en' ? 'Requires JavaScript and a modern Chromium or Firefox browser' : 'Requiere JavaScript y un navegador Chromium o Firefox moderno'
    data.featureList = locale === 'en'
      ? ['Monthly income and expense tracking', 'Encrypted local file', 'No accounts or servers', 'Monthly history comparison']
      : ['Registro mensual de ingresos y gastos', 'Archivo local cifrado', 'Sin cuentas ni servidores', 'Comparación del historial mensual']
    script.textContent = JSON.stringify(data)
  } catch {
    // Keep the static JSON-LD when a host page provides malformed data.
  }
}

function SeoMetadata() {
  const { pathname } = useLocation()
  const { locale, t } = useI18n()

  useEffect(() => {
    const isPublicPage = pathname === '/'
    const pageNames: Record<string, string> = { '/crear': t('createFile'), '/abrir': t('openFile'), '/boveda': t('vault'), '/boveda/historial': t('history') }
    const publicTitle = locale === 'en' ? 'Nimvo · Local, encrypted personal finance' : 'Nimvo · Finanzas personales locales y cifradas'
    const publicDescription = locale === 'en' ? 'Organize income, expenses, and monthly balances in one encrypted local file. Nimvo runs in your browser without accounts or servers.' : 'Organiza ingresos, gastos y balances mensuales en un archivo local cifrado. Nimvo funciona en tu navegador, sin cuentas ni servidores.'
    const imageAlt = locale === 'en' ? 'Nimvo, your finances in an encrypted local file' : 'Nimvo, tus finanzas en un archivo local cifrado'
    const title = isPublicPage ? publicTitle : `${pageNames[pathname] ?? t('notFound')} · Nimvo`

    document.title = title
    setMeta('meta[name="description"]', isPublicPage ? publicDescription : (locale === 'en' ? 'Nimvo local application.' : 'Aplicación local de Nimvo.'))
    setMeta('meta[name="robots"]', isPublicPage ? 'index, follow' : 'noindex, nofollow')

    if (isPublicPage) {
      document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.setAttribute('href', siteUrl)
      setMeta('meta[property="og:title"]', publicTitle)
      setMeta('meta[property="og:description"]', publicDescription)
      setMeta('meta[property="og:url"]', siteUrl)
      setMeta('meta[name="twitter:title"]', publicTitle)
      setMeta('meta[name="twitter:description"]', publicDescription)
      setMeta('meta[property="og:locale"]', locale === 'en' ? 'en_US' : 'es_AR')
      setMeta('meta[property="og:image:alt"]', imageAlt)
      setMeta('meta[name="twitter:image:alt"]', imageAlt)
    }
    setStructuredData(locale, isPublicPage ? publicDescription : (locale === 'en' ? 'Nimvo local application.' : 'Aplicación local de Nimvo.'))
    document.documentElement.lang = locale === 'en' ? 'en' : 'es-AR'
  }, [pathname, locale, t])

  return null
}

export default SeoMetadata
