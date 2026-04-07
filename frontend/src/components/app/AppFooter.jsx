import { Link } from 'react-router-dom'
import './AppFooter.css'

const FOOTER_COLUMNS = [
  {
    title: 'Product',
    links: [
      { to: '/app', label: 'Dashboard' },
      { to: '/app/settings', label: 'Settings' },
      { to: '/app/profile', label: 'Profile' },
      { to: '/app/features', label: 'Features' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { to: '/app/how-it-works', label: 'How it works' },
      { to: '/app/help', label: 'Help Center' },
      { to: '/app/blog', label: 'Blog' },
      { to: '/app/community', label: 'Community' },
    ],
  },
  {
    title: 'Company',
    links: [
      { to: '/app/about', label: 'About' },
      { to: '/app/careers', label: 'Careers' },
      { to: '/app/contact', label: 'Contact' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { to: '/app/privacy', label: 'Privacy' },
      { to: '/app/terms', label: 'Terms' },
      { to: '/app/security', label: 'Security' },
      { to: '/app/cookies', label: 'Cookies' },
    ],
  },
]

export function AppFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="app-footer">
      <div className="app-footer-main">
        <div className="app-footer-brand">
          <Link to="/app" className="app-footer-logo">Notus</Link>
          <p className="app-footer-tagline">Team collaboration, simplified.</p>
        </div>
        <div className="app-footer-columns">
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.title} className="app-footer-col">
              <h4 className="app-footer-col-title">{col.title}</h4>
              <ul className="app-footer-col-links">
                {col.links.map((link) => (
                  <li key={link.label}>
                    {link.to ? (
                      <Link to={link.to}>{link.label}</Link>
                    ) : (
                      <a href={link.href}>{link.label}</a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="app-footer-bottom">
        <span className="app-footer-copyright">
          &copy; {year} Notus. All rights reserved.
        </span>
      </div>
    </footer>
  )
}
