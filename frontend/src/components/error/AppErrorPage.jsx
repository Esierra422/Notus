import { Link } from 'react-router-dom'
import { Button } from '../ui/Button'
import './AppErrorPage.css'

export function AppErrorPage({
  title = 'Something went wrong',
  message = 'An unexpected issue occurred. Refresh the page or return to the dashboard.',
  showHome = true,
}) {
  return (
    <main className="app-main app-error-main">
      <section className="app-error-card">
        <h1 className="app-error-title">{title}</h1>
        <p className="app-error-message">{message}</p>
        <div className="app-error-actions">
          <Button type="button" variant="primary" onClick={() => window.location.reload()}>
            Refresh page
          </Button>
          {showHome ? (
            <Button as={Link} to="/app" variant="outline">
              Return to Dashboard
            </Button>
          ) : null}
        </div>
      </section>
    </main>
  )
}
