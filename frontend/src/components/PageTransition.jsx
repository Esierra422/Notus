import { Outlet } from 'react-router-dom'
import '../styles/transitions.css'

/**
 * Wraps content with smooth enter animation.
 * No key on wrapper to avoid remount flash; Outlet handles route switching.
 * When used as a layout route, renders Outlet; when used with children (e.g. in AppShell), renders children.
 */
export function PageTransition({ children }) {
  return (
    <div className="page-transition">
      {children ?? <Outlet />}
    </div>
  )
}
