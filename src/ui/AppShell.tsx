import { NavLink, Outlet } from 'react-router-dom'
import { UserMenu } from './UserMenu'

export function AppShell() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-brand">
          <span className="brand-mark">Ирбис</span>
          <nav className="topnav">
            <NavLink to="/search" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
              Поиск
            </NavLink>
          </nav>
        </div>
        <UserMenu />
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
