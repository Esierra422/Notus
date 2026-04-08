import { Link } from 'react-router-dom'

/**
 * Lightweight top bar for /login and /signup: home brand + link to the other auth route.
 * Avoids the full marketing Nav (which broke layout when stacked in a row flex auth page).
 */
export function AuthMinimalHeader({ alternateTo, alternateLabel }) {
  return (
    <header className="auth-minimal-header" role="banner">
      <div className="auth-minimal-header-inner">
        <Link to="/" className="auth-minimal-brand">
          Notus
        </Link>
        {alternateTo && alternateLabel ? (
          <Link to={alternateTo} className="auth-minimal-alt-link">
            {alternateLabel}
          </Link>
        ) : (
          <span className="auth-minimal-alt-placeholder" aria-hidden />
        )}
      </div>
    </header>
  )
}
