import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Button } from '../ui/Button'
import { MenuIcon, XIcon } from '../ui/Icons'
import './Nav.css'

export function Nav() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { pathname } = useLocation()
  const onPath = (p) => pathname === p

  return (
    <nav className="nav">
      <div className="nav-inner">
        <Link to="/" className="nav-logo" onClick={() => setMobileOpen(false)}>Notus</Link>
        <div className="nav-links nav-links--desktop">
          <Link to="/features" className={`nav-link ${onPath('/features') ? 'nav-link--active' : ''}`}>Features</Link>
          <Link to="/how-it-works" className={`nav-link ${onPath('/how-it-works') ? 'nav-link--active' : ''}`}>How It Works</Link>
        </div>
        <div className="nav-actions nav-actions--desktop">
          <Button to="/login" variant="ghost">Log in</Button>
          <Button to="/signup" variant="primary">Sign up</Button>
        </div>
        <button
          type="button"
          className="nav-mobile-toggle"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <XIcon size={24} /> : <MenuIcon size={24} />}
        </button>
      </div>
      <div className={`nav-mobile ${mobileOpen ? 'nav-mobile--open' : ''}`}>
        <Link to="/features" className="nav-mobile-link" onClick={() => setMobileOpen(false)}>Features</Link>
        <Link to="/how-it-works" className="nav-mobile-link" onClick={() => setMobileOpen(false)}>How It Works</Link>
        <Link to="/login" className="nav-mobile-link" onClick={() => setMobileOpen(false)}>Log in</Link>
        <Link to="/signup" className="nav-mobile-link nav-mobile-link--primary" onClick={() => setMobileOpen(false)}>Sign up</Link>
      </div>
    </nav>
  )
}
