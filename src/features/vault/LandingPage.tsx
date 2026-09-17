import { Link } from 'react-router-dom'

function LandingPage() {
  return (
    <section className="landing page-section">
      <div className="landing-copy">
        <p className="eyebrow">Moneo / archivo local</p>
        <h1>Tu dinero, en una hoja clara.</h1>
        <p className="lede">
          Moneo es una herramienta de finanzas personales que empieza por lo
          esencial: un archivo que vive en tu dispositivo.
        </p>
        <div className="action-row">
          <Link className="button button-primary" to="/crear">
            Crear archivo
          </Link>
          <Link className="button button-secondary" to="/abrir">
            Abrir archivo
          </Link>
        </div>
        <p className="local-note">
          Tus datos se guardarán localmente. La exportación permitirá llevarte
          una copia cifrada cuando la guardes.
        </p>
      </div>
      <aside className="landing-aside" aria-label="Estado de la versión">
        <span className="aside-label">Versión actual</span>
        <strong>Moneo V1</strong>
        <p>Registra meses, deudas y gastos, y conserva tu historial en un archivo local cifrado.</p>
      </aside>
    </section>
  )
}

export default LandingPage
