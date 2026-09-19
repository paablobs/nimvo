import { Link, NavLink, Outlet } from 'react-router-dom'

import ThemeToggle from './ThemeToggle.tsx'

function Layout() {
  return (
    <div className="app-shell">
      <header className="site-header">
        <Link className="wordmark" to="/" aria-label="Nimvo, inicio">
          nimvo
        </Link>
        <nav aria-label="Navegación principal">
          <NavLink className="nav-link" to="/crear">
            Crear archivo
          </NavLink>
          <NavLink className="nav-link" to="/abrir">
            Abrir archivo
          </NavLink>
          <NavLink className="nav-link" to="/boveda" end>
            Bóveda
          </NavLink>
          <NavLink className="nav-link" to="/boveda/historial">
            Historial
          </NavLink>
          <ThemeToggle />
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
      <footer className="site-footer">
        <span>Nimvo · V1</span>
        <span>Datos locales, bajo tu control</span>
      </footer>
    </div>
  )
}

export default Layout
