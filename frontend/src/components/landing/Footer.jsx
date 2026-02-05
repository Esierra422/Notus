import { Link } from 'react-router-dom'
import './Footer.css'

const FOOTER_COLUMNS = [
  {
    title: 'Product',
    links: [
      { href: '#features', label: 'Features' },
      { href: '#how-it-works', label: 'How it works' },
      { to: '/signup', label: 'Sign up' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { href: '#', label: 'Help Center' },
      { href: '#', label: 'Blog' },
      { href: '#', label: 'Community' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '#', label: 'About' },
      { href: '#', label: 'Careers' },
      { href: '#', label: 'Contact' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { href: '#', label: 'Privacy' },
      { href: '#', label: 'Terms' },
      { href: '#', label: 'Security' },
      { href: '#', label: 'Cookies' },
    ],
  },
]

export function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="footer">
      <div className="footer-main">
        <div className="footer-brand">
          <Link to="/" className="footer-logo">Notus</Link>
          <p className="footer-tagline">Team collaboration, simplified.</p>
        </div>
        <div className="footer-columns">
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.title} className="footer-col">
              <h4 className="footer-col-title">{col.title}</h4>
              <ul className="footer-col-links">
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
      <div className="footer-bottom">
        <span className="footer-copyright">
          &copy; {year} Notus. All rights reserved.
        </span>
      </div>
    </footer>
  )
}
