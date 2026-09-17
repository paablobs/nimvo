import { Link, NavLink, Outlet } from 'react-router-dom'

import ThemeToggle from './ThemeToggle.tsx'

function Layout() {
  return (
    <div className="app-shell">
      <header className="site-header">
        <Link className="wordmark" to="/" aria-label="Moneo, inicio">
          moneo
        </Link>
        <nav aria-label="Navegación principal">
          <NavLink className="nav-link" to="/crear">
            Crear archivo
          </NavLink>
          <NavLink className="nav-link" to="/abrir">
            Abrir archivo
          </NavLink>
          <NavLink className="nav-link" to="/boveda">
            Bóveda
          </NavLink>
          <ThemeToggle />
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
      <footer className="site-footer">
        <span>Moneo · Fase 2</span>
        <span>Datos locales, bajo tu control</span>
      </footer>
    </div>
  )
}

export default Layout
