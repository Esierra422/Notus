import { Link } from 'react-router-dom'
import { ArrowLeftIcon } from '../components/ui/Icons'
import '../styles/variables.css'
import './AppLayout.css'
import './AppLegalPages.css'
import { LegalPrivacyPolicySections } from './legal/LegalPrivacyContent'
import { LegalTermsOfServiceSections } from './legal/LegalTermsContent'
import { LegalSecurityPolicySections } from './legal/LegalSecurityContent'
import { LegalCookiePolicySections } from './legal/LegalCookiesContent'

const EFFECTIVE_DATE = 'April 7, 2026'

function LegalBack() {
  return (
    <div className="app-co-back">
      <Link to="/app" className="page-back-btn">
        <ArrowLeftIcon size={18} /> Back
      </Link>
    </div>
  )
}

function LegalNav() {
  return (
    <nav className="app-legal-pill-row" aria-label="Legal documents">
      <Link className="app-legal-pill" to="/app/privacy">
        Privacy
      </Link>
      <Link className="app-legal-pill" to="/app/terms">
        Terms
      </Link>
      <Link className="app-legal-pill" to="/app/security">
        Security
      </Link>
      <Link className="app-legal-pill" to="/app/cookies">
        Cookies
      </Link>
    </nav>
  )
}

export function AppPrivacyPage() {
  return (
    <main className="app-main app-co-main app-legal-main">
      <LegalBack />
      <header className="app-co-hero">
        <p className="app-co-kicker">Legal</p>
        <h1 className="app-co-title">Privacy Policy</h1>
        <p className="app-co-subtitle">
          How Notus collects, uses, discloses, retains, and protects personal data when you use our product, websites,
          and related services, and the choices and rights available to you under applicable law.
        </p>
        <p className="app-legal-meta">
          <strong>Effective date:</strong> {EFFECTIVE_DATE}. <strong>Applies to:</strong> the Notus web application,
          marketing websites and pages that link to this policy, APIs, and other online services we operate that
          reference this Privacy Policy.
        </p>
      </header>

      <div className="app-legal-prose">
        <LegalPrivacyPolicySections />
      </div>

      <LegalNav />
    </main>
  )
}

export function AppTermsPage() {
  return (
    <main className="app-main app-co-main app-legal-main">
      <LegalBack />
      <header className="app-co-hero">
        <p className="app-co-kicker">Legal</p>
        <h1 className="app-co-title">Terms of Service</h1>
        <p className="app-co-subtitle">
          The legally binding terms that govern access to and use of Notus, including acceptable use, intellectual
          property, fees, confidentiality, warranties, liability, and dispute resolution. If your organization has a
          Master Agreement with Notus, that agreement may supersede or supplement these Terms as stated therein.
        </p>
        <p className="app-legal-meta">
          <strong>Effective date:</strong> {EFFECTIVE_DATE}.
        </p>
      </header>

      <div className="app-legal-prose">
        <LegalTermsOfServiceSections />
      </div>

      <LegalNav />
    </main>
  )
}

export function AppSecurityPage() {
  return (
    <main className="app-main app-co-main app-legal-main">
      <LegalBack />
      <header className="app-co-hero">
        <p className="app-co-kicker">Trust</p>
        <h1 className="app-co-title">Security</h1>
        <p className="app-co-subtitle">
          An in-depth overview of Notus security practices: governance, access control, encryption, logging, incident
          response, vendor management, and shared responsibility. Contractual security commitments, if any, are set
          forth in your Order, Master Agreement, or Data Processing Addendum.
        </p>
        <p className="app-legal-meta">
          <strong>Last updated:</strong> {EFFECTIVE_DATE}.
        </p>
      </header>

      <div className="app-legal-prose">
        <LegalSecurityPolicySections />
      </div>

      <LegalNav />
    </main>
  )
}

export function AppCookiesPage() {
  return (
    <main className="app-main app-co-main app-legal-main">
      <LegalBack />
      <header className="app-co-hero">
        <p className="app-co-kicker">Legal</p>
        <h1 className="app-co-title">Cookie Policy</h1>
        <p className="app-co-subtitle">
          How Notus and, where applicable, our service providers use cookies, local storage, pixels, and similar
          technologies; the purposes and durations of each category; and how you can control preferences in your
          browser or through in-product settings.
        </p>
        <p className="app-legal-meta">
          <strong>Effective date:</strong> {EFFECTIVE_DATE}.
        </p>
      </header>

      <div className="app-legal-prose">
        <LegalCookiePolicySections />
      </div>

      <LegalNav />
    </main>
  )
}
