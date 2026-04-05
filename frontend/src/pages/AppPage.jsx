import { useState, useEffect } from 'react'
import { useNavigate, Link, useOutletContext } from 'react-router-dom'
import {
  getActiveMemberships,
  getPendingMembership,
  getPendingRequests,
  createOrg,
  searchOrgsByName,
  requestToJoinOrg,
  getOrg,
  canManageOrg,
  MEMBERSHIP_STATES,
} from '../lib/orgService'
import { getUpcomingMeetingsInHorizonForUser } from '../lib/meetingService'
import { Button } from '../components/ui/Button'
import { CalendarIcon, VideoIcon, MessageSquareIcon, SettingsIcon, BuildingIcon } from '../components/ui/Icons'
import { MiniCalendarWidget } from '../components/dashboard/MiniCalendarWidget'
import { UpcomingEventsWidget } from '../components/dashboard/UpcomingEventsWidget'
import { getTimeZone, getLocale } from '../lib/dateUtils'
import '../styles/variables.css'
import './AppLayout.css'
import './Dashboard.css'
import './DashboardOrg.css'
import './AppDashboardPage.css'
import './OrgPage.css'
import './OrgAdminPage.css'

function pickFirstName(userDoc, authUser) {
  const raw = (userDoc?.displayName || authUser?.displayName || '').trim()
  if (!raw) return ''
  return raw.split(/\s+/)[0]
}

function getLocalTimeParts(date, locale, tzOpts) {
  const parts = new Intl.DateTimeFormat(locale || 'en-US', {
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    ...tzOpts,
  }).formatToParts(date)
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10)
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10)
  return { hour, minute }
}

function getGreetingLine(hour) {
  if (hour < 5) return 'Hi there'
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

/** Visual theme for card accents by time of day */
function getDayPhase(hour) {
  if (hour < 5) return 'night'
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  if (hour < 21) return 'evening'
  return 'night'
}

const DASHBOARD_QUOTES = [
  { text: 'The secret of getting ahead is getting started.', author: 'Mark Twain' },
  { text: 'Done is better than perfect.', author: 'Sheryl Sandberg' },
  { text: 'Focus is a matter of deciding what things you’re not going to do.', author: 'John Carmack' },
  { text: 'Simplicity is the ultimate sophistication.', author: 'Leonardo da Vinci' },
  { text: 'Well done is better than well said.', author: 'Benjamin Franklin' },
  { text: 'Quality is not an act, it is a habit.', author: 'Aristotle' },
  { text: 'Start where you are. Use what you have. Do what you can.', author: 'Arthur Ashe' },
  { text: 'A year from now you may wish you had started today.', author: 'Karen Lamb' },
  { text: 'Small deeds done are better than great deeds planned.', author: 'Peter Marshall' },
  { text: 'Do what you can, with what you have, where you are.', author: 'Theodore Roosevelt' },
  { text: 'He who has a why can bear almost any how.', author: 'Friedrich Nietzsche' },
  { text: 'What you do every day matters more than what you do once in a while.', author: 'Gretchen Rubin' },
  { text: 'The best time to plant a tree was 20 years ago. The second best time is now.', author: 'Chinese proverb' },
  { text: 'Act as if what you do makes a difference. It does.', author: 'William James' },
  { text: 'Focus on being productive instead of busy.', author: 'Tim Ferriss' },
  { text: 'Efficiency is doing things right; effectiveness is doing the right things.', author: 'Peter Drucker' },
  { text: 'Discipline is choosing between what you want now and what you want most.', author: 'Abraham Lincoln' },
  { text: 'It always seems impossible until it’s done.', author: 'Nelson Mandela' },
  { text: 'The future depends on what you do today.', author: 'Mahatma Gandhi' },
  { text: 'If you want to lift yourself up, lift up someone else.', author: 'Booker T. Washington' },
  { text: 'You miss 100% of the shots you don’t take.', author: 'Wayne Gretzky' },
  { text: 'In the middle of difficulty lies opportunity.', author: 'Albert Einstein' },
  { text: 'The only way to do great work is to love what you do.', author: 'Steve Jobs' },
  { text: 'I have not failed. I’ve just found 10,000 ways that won’t work.', author: 'Thomas Edison' },
]

/**
 * One quote per calendar day in the user’s timezone (profile TZ or browser).
 * Same quote all day; after local midnight the date string changes → new quote.
 */
function quoteForDayKey(yyyyMmDd) {
  let h = 2166136261 >>> 0
  for (let i = 0; i < yyyyMmDd.length; i++) {
    h ^= yyyyMmDd.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return DASHBOARD_QUOTES[h % DASHBOARD_QUOTES.length]
}

/**
 * Main dashboard — user-specific, combines data from ALL organizations.
 * Shows Organizations selector, Calendar, Video, Chats (all orgs).
 */
export function AppPage() {
  const navigate = useNavigate()
  const { user, userDoc, setNavExtra } = useOutletContext() || {}
  const [activeOrgs, setActiveOrgs] = useState([])
  const [pendingOrg, setPendingOrg] = useState(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('choose')
  const [orgName, setOrgName] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [error, setError] = useState('')

  const [upcomingMeetings, setUpcomingMeetings] = useState([])
  const [totalPendingCount, setTotalPendingCount] = useState(0)

  // To-dos
  const [todos, setTodos] = useState([])
  const [newTodoText, setNewTodoText] = useState('')
  const [newTodoDueDate, setNewTodoDueDate] = useState('')
  const [todoLoading, setTodoLoading] = useState(false)

  useEffect(() => {
    if (!user) return
    const load = async () => {
      const [memberships, pendingMem] = await Promise.all([
        getActiveMemberships(user.uid),
        getPendingMembership(user.uid),
      ])
      const orgs = await Promise.all(
        memberships.map(async (m) => {
          const orgData = await getOrg(m.orgId)
          return { orgId: m.orgId, org: orgData, membership: m }
        })
      )
      setActiveOrgs(orgs.filter((o) => o.org))
      if (pendingMem) {
        const orgData = await getOrg(pendingMem.orgId)
        setPendingOrg(orgData || { id: pendingMem.orgId, name: 'Organization' })
        setView('pending')
      }
      setLoading(false)
    }
    load()
  }, [user])

  useEffect(() => {
    if (setNavExtra) setNavExtra(undefined)
  }, [setNavExtra])

  useEffect(() => {
    if (!user?.uid) return
    getUpcomingMeetingsInHorizonForUser(user.uid, 14, 20, { includeNonVideo: true })
      .then(setUpcomingMeetings)
      .catch(() => setUpcomingMeetings([]))
  }, [user?.uid])

  useEffect(() => {
    if (!user?.uid || activeOrgs.length === 0) return
    const adminOrgs = activeOrgs.filter((o) => canManageOrg(o.membership))
    Promise.all(adminOrgs.map((o) => getPendingRequests(o.orgId)))
      .then((results) => results.reduce((sum, p) => sum + p.length, 0))
      .then(setTotalPendingCount)
  }, [user?.uid, activeOrgs])

  const handleCreateOrg = async (e) => {
    e.preventDefault()
    setError('')
    if (!orgName.trim()) {
      setError('Enter an organization name.')
      return
    }
    setCreateLoading(true)
    try {
      const newOrg = await createOrg(orgName, user.uid)
      setActiveOrgs((prev) => [...prev, { orgId: newOrg.id, org: newOrg, membership: { state: MEMBERSHIP_STATES.active, role: 'owner' } }])
      setView('choose')
      setOrgName('')
      setPendingOrg(null)
    } catch (err) {
      setError(err.message || 'Failed to create organization.')
    } finally {
      setCreateLoading(false)
    }
  }

  const handleSearch = async (e) => {
    e.preventDefault()
    setError('')
    setSearching(true)
    try {
      const results = await searchOrgsByName(searchTerm)
      setSearchResults(results)
    } catch (err) {
      setError(err.message || 'Search failed.')
    } finally {
      setSearching(false)
    }
  }

  const handleRequestJoin = async (orgData) => {
    setError('')
    setCreateLoading(true)
    try {
      await requestToJoinOrg(orgData.id, user.uid)
      setPendingOrg(orgData)
      setView('pending')
      setSearchResults([])
      setSearchTerm('')
    } catch (err) {
      setError(err.message || 'Failed to send request.')
    } finally {
      setCreateLoading(false)
    }
  }

  if (!user) return null

  const needsOrg = activeOrgs.length === 0 && !pendingOrg
  const adminOrgs = activeOrgs.filter((o) => canManageOrg(o.membership))
  const isAdmin = adminOrgs.length > 0

  const tz = getTimeZone(userDoc)
  const locale = getLocale(userDoc)
  const now = new Date()
  const tzOpts = tz ? { timeZone: tz } : {}
  const calDateStr = now.toLocaleDateString('en-CA', { ...tzOpts, year: 'numeric', month: '2-digit', day: '2-digit' })
  const todayWeekday = now.toLocaleDateString(locale, { weekday: 'long', ...tzOpts })
  const todayLong = now.toLocaleDateString(locale, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    ...tzOpts,
  })
  const dailyQuote = quoteForDayKey(calDateStr)

  const { hour: localHour } = getLocalTimeParts(now, locale, tzOpts)
  const dayPhase = getDayPhase(localHour)
  const greetingLine = getGreetingLine(localHour)
  const firstName = pickFirstName(userDoc, user)
  const greetingFull = firstName ? `${greetingLine}, ${firstName}` : greetingLine

  return (
    <main className="app-main dashboard-main">
        {loading ? (
          <p className="app-muted">Loading…</p>
        ) : needsOrg ? (
          <div className="dashboard-org-section">
            <h2>Organization</h2>
            <p className="app-muted">Create a new organization or request to join an existing one.</p>
            {view === 'choose' && (
              <div className="onboarding-org-choose">
                <div className="onboarding-org-actions">
                  <Button variant="primary" size="lg" onClick={() => setView('create')}>
                    Create organization
                  </Button>
                  <Button variant="outline" size="lg" onClick={() => setView('search')}>
                    Request to join
                  </Button>
                </div>
              </div>
            )}
            {view === 'create' && (
              <form onSubmit={handleCreateOrg} className="onboarding-org-form">
                <input
                  type="text"
                  placeholder="Organization name"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  className="auth-input"
                  disabled={createLoading}
                  autoFocus
                />
                {error && <p className="auth-error">{error}</p>}
                <div className="onboarding-org-form-actions">
                  <Button type="submit" variant="primary" size="lg" disabled={createLoading}>
                    {createLoading ? 'Creating...' : 'Create'}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => { setView('choose'); setError(''); setOrgName(''); }}>
                    ← Back
                  </Button>
                </div>
              </form>
            )}
            {view === 'search' && (
              <div className="onboarding-org-search">
                <form onSubmit={handleSearch} className="onboarding-org-form">
                  <input
                    type="text"
                    placeholder="Search by organization name"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="auth-input"
                    disabled={searching}
                  />
                  <Button type="submit" variant="outline" size="lg" disabled={searching}>
                    {searching ? 'Searching...' : 'Search'}
                  </Button>
                </form>
                <Button variant="ghost" onClick={() => { setView('choose'); setError(''); setSearchTerm(''); setSearchResults([]); }} className="onboarding-org-back">
                  ← Back
                </Button>
                {error && <p className="auth-error">{error}</p>}
                <ul className="onboarding-org-results">
                  {searchResults.map((o) => (
                    <li key={o.id} className="onboarding-org-result-item">
                      <span>{o.name}</span>
                      <Button variant="outline" size="md" onClick={() => handleRequestJoin(o)} disabled={createLoading}>
                        Request to join
                      </Button>
                    </li>
                  ))}
                  {searchResults.length === 0 && searchTerm && !searching && (
                    <li className="onboarding-org-no-results">No organizations found.</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        ) : view === 'pending' && pendingOrg ? (
          <div className="dashboard-pending">
            <h2>Waiting for approval</h2>
            <p className="onboarding-org-pending-text">
              Your request to join <strong>{pendingOrg.name}</strong> has been sent. An admin will review it shortly.
            </p>
          </div>
        ) : (
          <div className="dashboard-overview">
            {/* Stats row */}
            <div className="dashboard-stats">
              <div className={`dashboard-stat-card dashboard-stat-card--today dashboard-stat-card--phase-${dayPhase}`}>
                <div className="dashboard-stat-today-date">
                  <span className="dashboard-stat-today-greeting">{greetingFull}</span>
                  <div className="dashboard-stat-today-date-text">
                    <span className="dashboard-stat-today-weekday">{todayWeekday}</span>
                    <span className="dashboard-stat-today-main">{todayLong}</span>
                  </div>
                  <div className="dashboard-stat-today-quote-block">
                    <p className="dashboard-stat-today-quote-kicker">Quote of the day</p>
                    <blockquote className="dashboard-stat-today-quote">
                      <p>“{dailyQuote.text}”</p>
                      <footer>— {dailyQuote.author}</footer>
                    </blockquote>
                  </div>
                </div>
                <div
                  className={[
                    'dashboard-stat-today-events',
                    upcomingMeetings.length > 0 ? 'dashboard-stat-today-events--has-items' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-label={`${upcomingMeetings.length} upcoming events in the next two weeks`}
                >
                  <span className="dashboard-stat-today-count">{upcomingMeetings.length}</span>
                  <div className="dashboard-stat-today-events-text">
                    <span className="dashboard-stat-today-events-label">Upcoming</span>
                    <span className="dashboard-stat-today-events-hint">next 2 wks</span>
                  </div>
                </div>
              </div>
              {isAdmin && totalPendingCount > 0 && (
                <Link to={adminOrgs[0] ? `/app/org/${adminOrgs[0].orgId}/admin` : '/app'} className="dashboard-stat-card dashboard-stat-card-action">
                  <span className="dashboard-stat-value">{totalPendingCount}</span>
                  <span className="dashboard-stat-label">Pending</span>
                </Link>
              )}
            </div>

            {/* Shortcuts */}
            <div className="dashboard-shortcuts">
              <Link to="/app/organizations" className="dashboard-shortcut">
                <span className="dashboard-shortcut-icon"><BuildingIcon size={24} /></span>
                <span className="dashboard-shortcut-label">Organizations</span>
                <span className="dashboard-shortcut-hint">{activeOrgs.length} orgs · Select to view</span>
              </Link>
              <Link to="/app/calendar" className="dashboard-shortcut">
                <span className="dashboard-shortcut-icon"><CalendarIcon size={24} /></span>
                <span className="dashboard-shortcut-label">Calendar</span>
                <span className="dashboard-shortcut-hint">All your organizations</span>
              </Link>
              <Link to="/app/video" className="dashboard-shortcut">
                <span className="dashboard-shortcut-icon"><VideoIcon size={24} /></span>
                <span className="dashboard-shortcut-label">Video Call</span>
                <span className="dashboard-shortcut-hint">All your organizations</span>
              </Link>
              <Link to="/app/chats" className="dashboard-shortcut">
                <span className="dashboard-shortcut-icon"><MessageSquareIcon size={24} /></span>
                <span className="dashboard-shortcut-label">Chats</span>
                <span className="dashboard-shortcut-hint">Messages & conversations</span>
              </Link>
              {isAdmin && (
                <Link to="/app/admin" className="dashboard-shortcut">
                  <span className="dashboard-shortcut-icon"><SettingsIcon size={24} /></span>
                  <span className="dashboard-shortcut-label">Admin</span>
                  <span className="dashboard-shortcut-hint">{adminOrgs.length} org{adminOrgs.length !== 1 ? 's' : ''} to manage</span>
                </Link>
              )}
            </div>

            {/* Compact widgets */}
            <div className="dashboard-widgets">
              <UpcomingEventsWidget userId={user?.uid} />

              <section className="dashboard-widget dashboard-widget-calendar">
                <MiniCalendarWidget userId={user?.uid} />
              </section>

              <section className="dashboard-widget dashboard-widget-wide">
                <div className="dashboard-widget-header">
                  <h3 className="dashboard-widget-title">
                    <BuildingIcon size={20} style={{ marginRight: '0.4rem', verticalAlign: 'middle' }} />
                    Organizations
                  </h3>
                  <Link to="/app/organizations" className="dashboard-widget-link">View all & add new →</Link>
                </div>
                <ul className="org-teams-list">
                  {activeOrgs.map(({ orgId, org }) => (
                    <li key={orgId} className="org-team-item">
                      <Link to={`/app/org/${orgId}`} className="org-team-link">
                        {org?.name || 'Organization'}
                      </Link>
                    </li>
                  ))}
                  {activeOrgs.length === 0 && (
                    <li className="org-teams-empty">No organizations yet — create or join one above</li>
                  )}
                </ul>
              </section>
            </div>
          </div>
        )}
    </main>
  )
}
