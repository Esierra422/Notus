import { Outlet } from 'react-router-dom'
import '../styles/transitions.css'

/** Enter animation; children or <Outlet /> — no wrapper key to avoid remount flicker */
export function PageTransition({ children }) {
  return (
    <div className="page-transition">
      {children ?? <Outlet />}
    </div>
  )
}
