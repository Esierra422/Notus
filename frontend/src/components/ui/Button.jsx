import { Link } from 'react-router-dom'
import './Button.css'

export function Button({ children, to, href, variant = 'primary', size = 'md', className = '', ...props }) {
  const baseClass = `btn btn-${variant} ${size === 'lg' ? 'btn-lg' : ''} ${className}`.trim()

  if (to) return <Link to={to} className={baseClass} {...props}>{children}</Link>
  if (href) return <a href={href} className={baseClass} {...props}>{children}</a>
  return <button type="button" className={baseClass} {...props}>{children}</button>
}
