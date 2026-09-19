import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const siteUrl = 'https://paablobs.github.io/nimvo/'
const publicTitle = 'Nimvo · Finanzas personales locales y cifradas'
const publicDescription =
  'Organiza ingresos, gastos y balances mensuales en un archivo local cifrado. Nimvo funciona en tu navegador, sin cuentas ni servidores.'

const privateTitles: Record<string, string> = {
  '/crear': 'Crear archivo · Nimvo',
  '/abrir': 'Abrir archivo · Nimvo',
  '/boveda': 'Bóveda · Nimvo',
  '/boveda/historial': 'Historial · Nimvo',
}

function setMeta(selector: string, content: string) {
  document.querySelector<HTMLMetaElement>(selector)?.setAttribute('content', content)
}

function SeoMetadata() {
  const { pathname } = useLocation()

  useEffect(() => {
    const isPublicPage = pathname === '/'
    const title = isPublicPage ? publicTitle : (privateTitles[pathname] ?? 'Página no encontrada · Nimvo')

    document.title = title
    setMeta('meta[name="description"]', isPublicPage ? publicDescription : 'Aplicación local de Nimvo.')
    setMeta('meta[name="robots"]', isPublicPage ? 'index, follow' : 'noindex, nofollow')

    if (isPublicPage) {
      document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.setAttribute('href', siteUrl)
      setMeta('meta[property="og:title"]', publicTitle)
      setMeta('meta[property="og:description"]', publicDescription)
      setMeta('meta[property="og:url"]', siteUrl)
      setMeta('meta[name="twitter:title"]', publicTitle)
      setMeta('meta[name="twitter:description"]', publicDescription)
    }
  }, [pathname])

  return null
}

export default SeoMetadata
