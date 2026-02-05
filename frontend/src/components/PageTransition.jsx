import { Outlet, useLocation } from 'react-router-dom'
import '../styles/transitions.css'

/**
 * Wraps route content with smooth enter animation.
 * Key on location.pathname ensures animation plays on every navigation.
 */
export function PageTransition() {
  const location = useLocation()
  return (
    <div key={location.pathname} className="page-transition">
      <Outlet />
    </div>
  )
}
