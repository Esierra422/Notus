import { Link } from 'react-router-dom'
import { Button } from '../ui/Button'
import './AuthStepEmail.css'

export function AuthChoiceStep({
  title,
  subtitle,
  googleLabel,
  emailLabel,
  onGoogle,
  onEmail,
  error,
  footerLink,
  googleLoading = false,
}) {
  return (
    <div className="auth-step-entry">
      <h2 className="auth-step-title">{title}</h2>
      <p className="auth-step-subtitle">{subtitle}</p>
      {error && <p className="auth-error">{error}</p>}
      <div className="auth-step-actions">
        <Button variant="outline" size="lg" className="auth-step-btn" onClick={onGoogle} disabled={googleLoading}>
          {googleLoading ? 'Redirecting to Google…' : googleLabel}
        </Button>
        {googleLoading && (
          <p className="auth-step-google-hint">You’ll be taken to Google to sign in, then brought back here.</p>
        )}
        <Button variant="outline" size="lg" className="auth-step-btn" onClick={onEmail}>
          {emailLabel}
        </Button>
      </div>
      {footerLink && (
        <p className="auth-step-footer">
          <Link to={footerLink.to}>{footerLink.label}</Link>
        </p>
      )}
    </div>
  )
}
