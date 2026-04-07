import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeftIcon } from '../components/ui/Icons'
import { Button } from '../components/ui/Button'
import '../styles/variables.css'
import './AppLayout.css'
import './AppCompanyPages.css'

/** Update this to your real support inbox; used for mailto + display. */
export const NOTUS_CONTACT_EMAIL = 'hello@notus.app'

const CONTACT_TOPICS = [
  { value: 'general', label: 'General question' },
  { value: 'billing', label: 'Billing & plans' },
  { value: 'careers', label: 'Careers & hiring' },
  { value: 'technical', label: 'Technical issue' },
  { value: 'partnership', label: 'Partnership' },
]

function CompanyBackLink() {
  return (
    <div className="app-co-back">
      <Link to="/app" className="page-back-btn">
        <ArrowLeftIcon size={18} /> Back
      </Link>
    </div>
  )
}

export function AppAboutPage() {
  return (
    <main className="app-main app-co-main">
      <CompanyBackLink />
      <header className="app-co-hero">
        <p className="app-co-kicker">Company</p>
        <h1 className="app-co-title">About Notus</h1>
        <p className="app-co-subtitle">
          We build one calm place for teams to meet, write, and decide, without tab overload or tool sprawl.
        </p>
      </header>

      <div className="app-co-stats" role="presentation">
        <div className="app-co-stat">
          <div className="app-co-stat-value">One</div>
          <div className="app-co-stat-label">Workspace for video, chat, calendar, and notes</div>
        </div>
        <div className="app-co-stat">
          <div className="app-co-stat-value">Human</div>
          <div className="app-co-stat-label">Designed for real meetings, async depth, and clarity</div>
        </div>
        <div className="app-co-stat">
          <div className="app-co-stat-value">Now</div>
          <div className="app-co-stat-label">Shipping iteratively with teams who use Notus every day</div>
        </div>
      </div>

      <section className="app-co-section" aria-labelledby="about-mission">
        <h2 id="about-mission" className="app-co-section-head">
          Mission
        </h2>
        <div className="app-co-grid-2">
          <div className="app-co-panel">
            <h3>Why we exist</h3>
            <p>
              Knowledge work fractures across apps: a call in one place, decisions in another, context lost in
              between. Notus brings the core rituals (showing up together, capturing what mattered, and following
              through) into a single, coherent product.
            </p>
          </div>
          <div className="app-co-panel">
            <h3>What we optimize for</h3>
            <p>
              Trustworthy video, readable transcripts, and channels that stay on-topic. We favor predictable layouts
              and fast paths over novelty for its own sake, so your team spends energy on the work, not the stack.
            </p>
          </div>
        </div>
      </section>

      <section className="app-co-section" aria-labelledby="about-values">
        <h2 id="about-values" className="app-co-section-head">
          Principles
        </h2>
        <div className="app-co-values">
          <div className="app-co-value-row">
            <div className="app-co-value-icon">1</div>
            <div className="app-co-value-body">
              <h3>Clarity over noise</h3>
              <p>Interfaces stay legible in long sessions; hierarchy and contrast carry the story.</p>
            </div>
          </div>
          <div className="app-co-value-row">
            <div className="app-co-value-icon">2</div>
            <div className="app-co-value-body">
              <h3>Respect for time</h3>
              <p>Join flows, lobby, and recap paths are tuned so people can drop in, contribute, and leave cleanly.</p>
            </div>
          </div>
          <div className="app-co-value-row">
            <div className="app-co-value-icon">3</div>
            <div className="app-co-value-body">
              <h3>Privacy-minded defaults</h3>
              <p>Host controls, org boundaries, and sensible sharing settings reduce accidental exposure.</p>
            </div>
          </div>
        </div>
      </section>

      <nav className="app-co-inline-links" aria-label="Related">
        <Link to="/app/features">Features</Link>
        <Link to="/app/how-it-works">How it works</Link>
        <Link to="/app/careers">Careers</Link>
        <Link to="/app/contact">Contact</Link>
      </nav>
    </main>
  )
}

const ROLES = [
  {
    title: 'Product engineering',
    desc: 'Web platform, real-time media, and delightful in-meeting experiences.',
    status: 'We hire selectively',
  },
  {
    title: 'Design & brand',
    desc: 'End-to-end UX for dense, professional workflows: accessible and calm.',
    status: 'Portfolio welcome',
  },
  {
    title: 'Customer success',
    desc: 'Help organizations roll out Notus and get lasting value from transcripts, chat, and video.',
    status: 'Relationship builders',
  },
]

export function AppCareersPage() {
  return (
    <main className="app-main app-co-main">
      <CompanyBackLink />
      <header className="app-co-hero">
        <p className="app-co-kicker">Careers</p>
        <h1 className="app-co-title">Build with us</h1>
        <p className="app-co-subtitle">
          Small team, high craft. We care about typography, latency, and the unglamorous details that make software
          feel dependable.
        </p>
      </header>

      <section className="app-co-section" aria-labelledby="careers-culture">
        <h2 id="careers-culture" className="app-co-section-head">
          How we work
        </h2>
        <div className="app-co-grid-2">
          <div className="app-co-panel">
            <h3>Ownership</h3>
            <p>You will see problems end-to-end: from customer pain in support to the commit that fixes it.</p>
          </div>
          <div className="app-co-panel">
            <h3>Written culture</h3>
            <p>
              Decisions leave trails (brief specs, meeting notes, and honest retros) so context survives handoffs.
            </p>
          </div>
          <div className="app-co-panel">
            <h3>Async-first</h3>
            <p>Deep work blocks are protected; meetings are for alignment, not status theatre.</p>
          </div>
          <div className="app-co-panel">
            <h3>Kind candor</h3>
            <p>Direct feedback, assumed good intent, and room to revise when we learn something new.</p>
          </div>
        </div>
      </section>

      <section className="app-co-section" aria-labelledby="careers-open">
        <h2 id="careers-open" className="app-co-section-head">
          Open directions
        </h2>
        <p className="app-co-subtitle" style={{ marginBottom: '1.25rem' }}>
          We do not always run public job boards. If one of these areas fits you, say hello; we read every note.
        </p>
        <div className="app-co-roles">
          {ROLES.map((r) => (
            <div key={r.title} className="app-co-role">
              <div className="app-co-role-info">
                <h3>{r.title}</h3>
                <p>{r.desc}</p>
                <span className="app-co-pill">{r.status}</span>
              </div>
              <Button to="/app/contact?topic=careers" variant="outline" size="sm">
                Express interest
              </Button>
            </div>
          ))}
        </div>
      </section>

      <div className="app-co-cta-band">
        <h2>Not sure where you fit?</h2>
        <p>Tell us what you have built and what you want to build next. We will route you to the right conversation.</p>
        <Button to="/app/contact?topic=careers" variant="primary">
          Start a conversation
        </Button>
      </div>
    </main>
  )
}

function AppContactForm() {
  const [searchParams] = useSearchParams()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [topic, setTopic] = useState('general')
  const [message, setMessage] = useState('')
  const [sentHint, setSentHint] = useState(false)

  useEffect(() => {
    const t = (searchParams.get('topic') || '').toLowerCase()
    if (CONTACT_TOPICS.some((o) => o.value === t)) setTopic(t)
  }, [searchParams])

  const topicLabel = useMemo(() => CONTACT_TOPICS.find((o) => o.value === topic)?.label || 'General', [topic])

  const handleSubmit = (e) => {
    e.preventDefault()
    setSentHint(false)
    const subject = `[Notus] ${topicLabel} | ${name.trim() || 'Web form'}`
    const body = `Name: ${name.trim()}\nEmail: ${email.trim()}\nTopic: ${topicLabel}\n\n${message.trim()}`
    const max = 1800
    const safeBody = body.length > max ? `${body.slice(0, max)}\n\n[truncated]` : body
    const href = `mailto:${NOTUS_CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(safeBody)}`
    window.location.href = href
    setSentHint(true)
  }

  return (
    <form className="app-co-form" onSubmit={handleSubmit} noValidate>
      <div className="app-co-field">
        <label htmlFor="co-name">Name</label>
        <input
          id="co-name"
          name="name"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="Your name"
        />
      </div>
      <div className="app-co-field">
        <label htmlFor="co-email">Email</label>
        <input
          id="co-email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="you@company.com"
        />
      </div>
      <div className="app-co-field">
        <label htmlFor="co-topic">Topic</label>
        <select id="co-topic" name="topic" value={topic} onChange={(e) => setTopic(e.target.value)}>
          {CONTACT_TOPICS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="app-co-field">
        <label htmlFor="co-message">Message</label>
        <textarea
          id="co-message"
          name="message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
          placeholder="How can we help?"
        />
      </div>
      <div className="app-co-form-actions">
        <Button type="submit" variant="primary">
          Open in email app
        </Button>
      </div>
      <p className="app-co-form-hint">
        This opens your default mail client with a pre-filled message to {NOTUS_CONTACT_EMAIL}. If nothing opens, copy
        the address from the card on the left.
      </p>
      {sentHint ? (
        <p className="app-co-form-success" role="status">
          If your mail app did not open, check pop-up blockers or paste your message into an email manually.
        </p>
      ) : null}
    </form>
  )
}

export function AppContactPage() {
  return (
    <main className="app-main app-co-main">
      <CompanyBackLink />
      <header className="app-co-hero">
        <p className="app-co-kicker">Contact</p>
        <h1 className="app-co-title">Talk to Notus</h1>
        <p className="app-co-subtitle">
          Product questions, partnerships, press, or something broken: we read everything and reply as soon as we can.
        </p>
      </header>

      <div className="app-co-contact-layout">
        <aside className="app-co-contact-side" aria-label="Contact options">
          <div className="app-co-contact-card">
            <h3>Email</h3>
            <a href={`mailto:${NOTUS_CONTACT_EMAIL}`}>{NOTUS_CONTACT_EMAIL}</a>
            <p>Best for detailed questions and attachments.</p>
          </div>
          <div className="app-co-contact-card">
            <h3>Response time</h3>
            <p>We typically answer within a few business days. For urgent production issues, say so in the subject line.</p>
          </div>
          <div className="app-co-contact-card">
            <h3>Careers</h3>
            <p>
              Hiring conversations start the same way: use the form with topic <strong>Careers & hiring</strong>, or go
              from <Link to="/app/careers">Careers</Link>.
            </p>
          </div>
        </aside>
        <div className="app-co-form-wrap">
          <AppContactForm />
        </div>
      </div>
    </main>
  )
}
