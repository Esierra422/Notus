import { Link } from 'react-router-dom'
import { Button } from '../ui/Button'
import './Nav.css'

export function Nav() {
  return (
    <nav className="nav">
      <Link to="/" className="nav-logo">Notus</Link>
      <div className="nav-links">
        <a href="#features">Features</a>
        <a href="#how-it-works">How it works</a>
        <a href="#pricing">Pricing</a>
      </div>
      <div className="nav-actions">
        <Button to="/login" variant="ghost">Log in</Button>
        <Button to="/signup" variant="primary">Sign up</Button>
      </div>
    </nav>
  )
}
