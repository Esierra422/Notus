import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { cookieConsent } from '../../lib/cookieConsent'
import { initAnalyticsIfAllowed } from '../../lib/firebase'
import './CookieConsent.css'

function CategoryCard({ title, description, checked, disabled, onChange, badge }) {
  return (
    <div className="cookie-consent-cat">
      <div className="cookie-consent-cat__row">
        <div>
          <p className="cookie-consent-cat__name">
            {title} {badge ? <span style={{ color: 'var(--accent-dim)', fontWeight: 700 }}>({badge})</span> : null}
          </p>
        </div>
        <label className="cookie-consent-toggle">
          <input
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={(e) => onChange?.(e.target.checked)}
          />
          {disabled ? 'Always on' : checked ? 'On' : 'Off'}
        </label>
      </div>
      <p className="cookie-consent-cat__hint">{description}</p>
    </div>
  )
}

function CookiePreferencesModal({ open, onClose }) {
  const [draft, setDraft] = useState(cookieConsent.get())

  useEffect(() => {
    if (!open) return
    setDraft(cookieConsent.get())
  }, [open])

  if (!open) return null

  return (
    <div className="cookie-consent-modal-backdrop" role="dialog" aria-modal="true" aria-label="Cookie preferences">
      <div className="cookie-consent-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cookie-consent-modal__head">
          <div>
            <h2 className="cookie-consent-modal__title">Cookie preferences</h2>
            <p className="cookie-consent-modal__desc">
              Notus uses cookies and similar storage for sign-in and security. Optional categories help personalize the
              experience and improve the product. You can change these settings at any time.
            </p>
          </div>
          <button type="button" className="cookie-consent-close" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>

        <div className="cookie-consent-cats">
          <CategoryCard
            title="Strictly necessary"
            badge="Required"
            checked
            disabled
            description="Required to sign in, keep sessions secure, prevent abuse, and provide core application functionality."
          />
          <CategoryCard
            title="Preferences"
            checked={draft.preferences}
            disabled={false}
            onChange={(v) => setDraft((d) => ({ ...d, preferences: Boolean(v) }))}
            description="Helps remember settings such as UI choices and similar preferences to improve usability."
          />
          <CategoryCard
            title="Analytics"
            checked={draft.analytics}
            disabled={false}
            onChange={(v) => setDraft((d) => ({ ...d, analytics: Boolean(v) }))}
            description="Helps us understand usage in aggregate so we can improve reliability and prioritize features."
          />
        </div>

        <div className="cookie-consent-modal__footer">
          <button
            type="button"
            className="cookie-consent-btn cookie-consent-btn--ghost"
            onClick={() => {
              setDraft((d) => ({ ...d, preferences: false, analytics: false }))
            }}
          >
            Reject optional
          </button>
          <button
            type="button"
            className="cookie-consent-btn cookie-consent-btn--ghost"
            onClick={() => {
              setDraft((d) => ({ ...d, preferences: true, analytics: true }))
            }}
          >
            Accept all
          </button>
          <button
            type="button"
            className="cookie-consent-btn cookie-consent-btn--primary"
            onClick={async () => {
              cookieConsent.set({ preferences: draft.preferences, analytics: draft.analytics })
              if (draft.analytics) await initAnalyticsIfAllowed()
              onClose()
            }}
          >
            Save preferences
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Global cookie consent banner + preference center.
 * - Shows on first visit until the user makes a choice.
 * - Writes consent to localStorage.
 * - Gates Firebase Analytics initialization behind analytics consent.
 */
export function CookieConsentManager() {
  const initial = useMemo(() => cookieConsent.get(), [])
  const [consent, setConsent] = useState(initial)
  const [showPrefs, setShowPrefs] = useState(false)

  useEffect(() => cookieConsent.subscribe(setConsent), [])

  // Initialize analytics if already allowed (e.g. returning visitor).
  useEffect(() => {
    if (!consent.analytics) return
    initAnalyticsIfAllowed().catch(() => {})
  }, [consent.analytics])

  const showBanner = !cookieConsent.hasUserChoice()

  return (
    <>
      {showBanner ? (
        <div className="cookie-consent-banner" role="region" aria-label="Cookie consent">
          <p className="cookie-consent-banner__title">Cookies and similar technologies</p>
          <p className="cookie-consent-banner__body">
            We use strictly necessary cookies and storage to keep Notus secure and to sign you in. With your permission,
            we also use optional categories (preferences and analytics) to improve your experience and help us improve
            the product. You can manage your choices at any time in this banner.
          </p>
          <p className="cookie-consent-banner__body cookie-consent-banner__links" style={{ marginTop: '0.35rem' }}>
            Learn more in our <Link to="/app/cookies">Cookie Policy</Link> and <Link to="/app/privacy">Privacy Policy</Link>.
          </p>
          <div className="cookie-consent-banner__actions">
            <button
              type="button"
              className="cookie-consent-btn cookie-consent-btn--ghost"
              onClick={() => {
                cookieConsent.rejectAll()
              }}
            >
              Reject optional
            </button>
            <button
              type="button"
              className="cookie-consent-btn cookie-consent-btn--ghost"
              onClick={() => setShowPrefs(true)}
            >
              Manage preferences
            </button>
            <button
              type="button"
              className="cookie-consent-btn cookie-consent-btn--primary"
              onClick={async () => {
                cookieConsent.acceptAll()
                await initAnalyticsIfAllowed()
              }}
            >
              Accept all
            </button>
          </div>
        </div>
      ) : null}

      <CookiePreferencesModal open={showPrefs} onClose={() => setShowPrefs(false)} />
    </>
  )
}

