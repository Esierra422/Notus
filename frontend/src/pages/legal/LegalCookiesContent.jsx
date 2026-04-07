import { Link } from 'react-router-dom'
import { NOTUS_CONTACT_EMAIL } from '../AppCompanyPages'

const COOKIE_DETAIL_ROWS = [
  {
    category: 'Strictly necessary',
    examples: 'Session tokens, authentication cookies, CSRF protections, load-balancing flags',
    storage: 'HTTP cookies, localStorage, sessionStorage (as implemented)',
    duration: 'Session or up to 12 months for persistent login where offered',
    controller: 'Notus',
  },
  {
    category: 'Functional / preferences',
    examples: 'UI density, reduced motion, selected organization, dismissed banners',
    storage: 'localStorage or cookies',
    duration: 'Typically up to 12 months unless cleared by the user',
    controller: 'Notus',
  },
  {
    category: 'Security and diagnostics',
    examples: 'Device trust signals, captcha tokens, fraud prevention telemetry',
    storage: 'Cookies or first-party storage',
    duration: 'Session to 30 days depending on provider',
    controller: 'Notus / security vendors',
  },
  {
    category: 'Analytics (optional)',
    examples: 'Aggregated usage metrics, feature funnels, performance timings',
    storage: 'Cookies or SDK local storage if enabled',
    duration: 'As configured; often 13–24 months if used',
    controller: 'Notus / analytics subprocessors',
  },
  {
    category: 'Third-party SDKs (meetings)',
    examples: 'Real-time communications client identifiers required by media SDKs',
    storage: 'Browser storage as required by the SDK',
    duration: 'Defined by the communications vendor policy',
    controller: 'Communications subprocessor',
  },
]

/**
 * Cookie Policy body (in-app). Detailed categories for consent and procurement workflows.
 */
export function LegalCookiePolicySections() {
  return (
    <>
      <section className="app-legal-block" aria-labelledby="ck-intro">
        <h2 id="ck-intro">1. Introduction</h2>
        <p>
          This Cookie Policy explains how Notus (&quot;Notus,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;)
          uses cookies and similar technologies when you visit our websites, use our web application, or interact with
          online services that link to this policy (collectively, the &quot;Sites&quot;). It should be read together
          with our <Link to="/app/privacy">Privacy Policy</Link>, which describes how we process personal data more
          broadly.
        </p>
        <p>
          Depending on your location, you may be entitled to specific choices about non-essential cookies. Where
          required, we will obtain consent before setting optional cookies or provide a preference center. Essential
          cookies necessary to provide the service you request may be used without consent under applicable law.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="ck-what">
        <h2 id="ck-what">2. What are cookies and similar technologies?</h2>
        <p>
          <strong>Cookies</strong> are small text files placed on your device when you visit a site. They often include
          an identifier, expiration date, and attributes that tell the browser when to send the cookie back.{' '}
          <strong>First-party cookies</strong> are set by Notus; <strong>third-party cookies</strong> are set by
          another domain (for example, an embedded analytics or communications provider).
        </p>
        <p>
          We also use functionally similar technologies, including <strong>local storage</strong> and{' '}
          <strong>session storage</strong> in your browser, <strong>session tokens</strong> in memory during active use,
          <strong>pixels</strong> or <strong>tags</strong> in emails or pages to measure opens or clicks where enabled,
          and <strong>software development kits (SDKs)</strong> inside the application that store identifiers required
          for real-time features.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="ck-why">
        <h2 id="ck-why">3. Why we use these technologies</h2>
        <p>We use cookies and similar technologies for the following purposes:</p>
        <ul>
          <li>
            <strong>Authentication and session continuity:</strong> to keep you signed in securely, rotate sessions, and
            prevent cross-site request forgery.
          </li>
          <li>
            <strong>Preferences:</strong> to remember settings such as language, time zone presentation, and UI
            options.
          </li>
          <li>
            <strong>Security:</strong> to detect bots, brute-force attempts, and anomalous access patterns.
          </li>
          <li>
            <strong>Performance and reliability:</strong> to route traffic, balance load, and diagnose errors.
          </li>
          <li>
            <strong>Product improvement:</strong> where permitted, to understand feature usage in aggregate and improve
            the Sites.
          </li>
          <li>
            <strong>Integrations:</strong> to enable calendar connections, identity providers, or media features that
            rely on vendor SDKs.
          </li>
        </ul>
      </section>

      <section className="app-legal-block" aria-labelledby="ck-table">
        <h2 id="ck-table">4. Categories and representative details</h2>
        <p>
          The table below summarizes typical categories. Exact names, durations, and providers may evolve with
          product updates. For a current list tailored to your workspace, contact{' '}
          <a href={`mailto:${NOTUS_CONTACT_EMAIL}`}>{NOTUS_CONTACT_EMAIL}</a>.
        </p>
        <div className="app-legal-table-wrap">
          <table className="app-legal-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Typical examples</th>
                <th>Storage mechanism</th>
                <th>Max duration (indicative)</th>
                <th>Controller</th>
              </tr>
            </thead>
            <tbody>
              {COOKIE_DETAIL_ROWS.map((row) => (
                <tr key={row.category}>
                  <td>{row.category}</td>
                  <td>{row.examples}</td>
                  <td>{row.storage}</td>
                  <td>{row.duration}</td>
                  <td>{row.controller}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="app-legal-block" aria-labelledby="ck-consent">
        <h2 id="ck-consent">5. Consent and preference management</h2>
        <p>
          Where local law requires consent for non-essential cookies, we present a consent mechanism (for example, a
          banner or settings panel) that allows you to accept, reject, or customize categories. You may change your
          choices later through in-product settings where available or by clearing storage as described below.
        </p>
        <p>
          If your Organization deploys Notus to its workforce, the Organization may configure policies regarding
          analytics or optional tracking. Administrative settings do not override browser controls that block cookies
          entirely, though blocking strictly necessary storage may prevent sign-in.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="ck-browser">
        <h2 id="ck-browser">6. Browser and device controls</h2>
        <p>
          Most browsers let you refuse or delete cookies through settings. You can also use private browsing modes to
          limit persistence. Instructions vary by browser; refer to the help documentation for Chrome, Safari,
          Firefox, Edge, or your mobile operating system.
        </p>
        <p>
          Note that blocking or deleting strictly necessary cookies or storage may prevent you from logging in,
          maintaining a stable session, or using real-time features that depend on client-side identifiers.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="ck-dnt">
        <h2 id="ck-dnt">7. Global Privacy Control and Do Not Track</h2>
        <p>
          Some browsers transmit a &quot;Do Not Track&quot; signal or support the Global Privacy Control (GPC). Where
          required by applicable law, we treat qualifying GPC signals as opt-out requests for certain types of
          processing. DNT lacks a uniform standard; we handle it consistent with regulatory guidance in your region.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="ck-third">
        <h2 id="ck-third">8. Third-party technologies</h2>
        <p>
          When you use features that rely on third parties (for example, identity providers, calendar hosts, or
          real-time communications), those parties may set or read their own cookies or storage subject to their
          policies. Notus does not control third-party technologies and encourages you to review their notices.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="ck-retention">
        <h2 id="ck-retention">9. Retention</h2>
        <p>
          Session cookies expire when you close the browser unless otherwise noted. Persistent cookies and stored
          identifiers remain for the duration necessary to fulfill their purpose or until you delete them, subject to
          maximum lifetimes described in vendor documentation and our internal schedules.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="ck-updates">
        <h2 id="ck-updates">10. Updates to this Cookie Policy</h2>
        <p>
          We may update this Cookie Policy when we introduce new technologies or change practices. We will revise the
          effective date and, where required, seek renewed consent. Continued use after the effective date constitutes
          acceptance of non-material changes where permitted by law.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="ck-contact">
        <h2 id="ck-contact">11. Contact</h2>
        <p>
          Questions about cookies or this policy: <a href={`mailto:${NOTUS_CONTACT_EMAIL}`}>{NOTUS_CONTACT_EMAIL}</a> or{' '}
          <Link to="/app/contact">Contact</Link>. For operational help clearing site data, see the{' '}
          <Link to="/app/help">Help Center</Link>.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="ck-eea">
        <h2 id="ck-eea">12. EEA, UK, and Switzerland users</h2>
        <p>
          If you are located in the European Economic Area, United Kingdom, or Switzerland, our use of non-essential
          cookies and similar technologies that involve personal data is based on consent where required, or on another
          lawful basis described in the Privacy Policy. You may withdraw consent at any time without affecting the
          lawfulness of processing based on consent before withdrawal.
        </p>
      </section>

      <section className="app-legal-block" aria-labelledby="ck-mobile">
        <h2 id="ck-mobile">13. Mobile and desktop clients</h2>
        <p>
          If Notus offers native applications, similar identifiers may be stored in app sandboxes or secure enclaves.
          Those identifiers are governed by this policy to the extent they operate like cookies; platform-specific
          settings (for example, OS-level advertising identifiers) are controlled through device settings.
        </p>
      </section>
    </>
  )
}
