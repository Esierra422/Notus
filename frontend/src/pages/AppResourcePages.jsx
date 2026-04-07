import { useEffect, useMemo, useRef, useState, useId } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowLeftIcon,
  SearchIcon,
  XIcon,
  VideoIcon,
  MessageSquareIcon,
  CalendarIcon,
  BuildingIcon,
  UserIcon,
  LockIcon,
  BookIcon,
  ChevronDownIcon,
  ClockIcon,
  SparklesIcon,
  StarIcon,
  FlagIcon,
  UsersIcon,
} from '../components/ui/Icons'
import '../styles/variables.css'
import './AppLayout.css'
import './AppResourcePages.css'
import { useCopyFeedback } from '../hooks/useCopyFeedback.js'

const HELP_CATEGORY_CHIPS = [
  { id: 'all', label: 'All topics' },
  { id: 'video', label: 'Video' },
  { id: 'chats', label: 'Chats' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'orgs', label: 'Organizations' },
  { id: 'account', label: 'Account' },
  { id: 'security', label: 'Privacy & security' },
]

const HELP_FAQ_GROUPS = [
  {
    id: 'video',
    title: 'Video & meetings',
    items: [
      {
        id: 'join-flow',
        q: 'How do I join a meeting?',
        searchText: 'join lobby prejoin meeting id calendar invite video',
        a: (
          <>
            <p>
              Open <strong>Video</strong> from the top navigation. Start a new meeting, enter a <strong>meeting ID</strong>{' '}
              to join an existing one, or open a scheduled meeting from your <Link to="/app/calendar">calendar</Link> when
              you have been invited.
            </p>
            <p>
              Before you enter, you can preview your microphone and camera. If the host uses a waiting room for
              scheduled calls, you may wait until they admit you.
            </p>
          </>
        ),
      },
      {
        id: 'mic-camera',
        q: 'Microphone or camera is not working',
        searchText: 'mic mute camera permission browser chrome safari audio video blocked',
        a: (
          <>
            <p>
              Check that your browser has permission to use the mic and camera (lock icon or site settings in the
              address bar). Try another browser or disable extensions that block media devices.
            </p>
            <p>
              In the meeting, use the toolbar to mute/unmute or turn the camera on or off. If others still see the wrong
              state after a few seconds, leave and rejoin once; media state syncs from the live session.
            </p>
          </>
        ),
      },
      {
        id: 'screen-share',
        q: 'How does screen sharing work?',
        searchText: 'share screen presenter viewer pinned spotlight mirror',
        a: (
          <>
            <p>
              Click <strong>Share screen</strong> in the meeting toolbar. While you share, you keep a normal camera
              grid on your own screen (with a banner that you are sharing) so you do not get a recursive “hall of mirrors”
              preview.
            </p>
            <p>
              Everyone else sees your shared content <strong>spotlighted</strong> with participant thumbnails along the
              bottom. When sharing stops, the layout returns to the usual gallery.
            </p>
          </>
        ),
      },
      {
        id: 'host-controls',
        q: 'I am the host: what can I control?',
        searchText: 'host organizer waiting room admit kick mute permissions meeting id',
        a: (
          <>
            <p>
              Organizers can configure waiting rooms for scheduled meetings, manage who can share their screen, and use
              participant actions (where enabled) to keep the room orderly.
            </p>
            <p>
              Meeting information and IDs are managed from the in-meeting menus. Only share IDs with people you intend
              to invite.
            </p>
          </>
        ),
      },
      {
        id: 'leave-end',
        q: 'Leave meeting vs ending for everyone',
        searchText: 'leave end meeting host alone everyone',
        a: (
          <>
            <p>
              Use <strong>Leave</strong> to exit without closing the room for others. When the last person leaves, the
              meeting session is ended in the usual way so ongoing lists stay accurate.
            </p>
            <p>
              Organizers may have additional options to signal that a meeting has finished. Follow your organization’s
              practice.
            </p>
          </>
        ),
      },
    ],
  },
  {
    id: 'chats',
    title: 'Chats & channels',
    items: [
      {
        id: 'find-chats',
        q: 'Where are my conversations?',
        searchText: 'channels dm direct message organization chat list',
        a: (
          <>
            <p>
              Open <strong>Chats</strong> from the header. Conversations are scoped to an <strong>organization</strong>.
              Use your org switcher if you belong to more than one workspace.
            </p>
            <p>You will see channels your admin has set up and any direct threads you are part of.</p>
          </>
        ),
      },
      {
        id: 'mute-chat',
        q: 'Mute notifications for a conversation',
        searchText: 'mute bell notifications conversation settings',
        a: (
          <>
            <p>
              In the chat list or conversation menu, choose <strong>Mute</strong> to stop alerts for that thread only.
              Your global notification preferences live under <Link to="/app/settings">Settings</Link>.
            </p>
          </>
        ),
      },
      {
        id: 'chat-vs-email',
        q: 'When should I use chat instead of email?',
        searchText: 'async thread decision link meeting',
        a: (
          <>
            <p>
              Use channels for quick updates, links, and decisions that should stay next to your team context. Use
              meetings or meeting notes when you need real-time alignment; chat stays best for durable, searchable
              threads inside Notus.
            </p>
          </>
        ),
      },
    ],
  },
  {
    id: 'calendar',
    title: 'Calendar & events',
    items: [
      {
        id: 'schedule-video',
        q: 'Schedule a video meeting',
        searchText: 'create event video meeting calendar invite',
        a: (
          <>
            <p>
              From <Link to="/app/calendar">Calendar</Link>, create an event and enable the video-meeting option where
              available. Invited members can open the event and join when it is time.
            </p>
            <p>Org-scoped calendars help keep meetings tied to the right team and permissions.</p>
          </>
        ),
      },
      {
        id: 'calendar-views',
        q: 'Personal vs organization calendar',
        searchText: 'org calendar import tasks',
        a: (
          <>
            <p>
              Your calendar can include personal tasks and imported feeds alongside org-visible meetings, depending on how
              your workspace is configured. Use the dashboard widgets to see what is coming up soon.
            </p>
          </>
        ),
      },
    ],
  },
  {
    id: 'orgs',
    title: 'Organizations & teams',
    items: [
      {
        id: 'switch-org',
        q: 'Switch between organizations',
        searchText: 'org switcher workspace multiple membership',
        a: (
          <>
            <p>
              Use the organization control in the app header (or go to <Link to="/app/organizations">Organizations</Link>
              ) to change the active workspace. Video, chats, and many meetings follow the org you have selected.
            </p>
          </>
        ),
      },
      {
        id: 'create-org',
        q: 'Create or join an organization',
        searchText: 'create invite request join org admin',
        a: (
          <>
            <p>
              From the dashboard, create a new organization or request to join an existing one if your admin allows
              requests. Once you are a member, you can access that org’s chats, calendar, and meetings according to your
              role.
            </p>
          </>
        ),
      },
      {
        id: 'roles',
        q: 'Who can manage members and settings?',
        searchText: 'admin moderator member role permission',
        a: (
          <>
            <p>
              Organization admins can manage membership, high-level settings, and moderation flows. If you need a role
              change, ask an admin in your org.
            </p>
          </>
        ),
      },
    ],
  },
  {
    id: 'account',
    title: 'Account & profile',
    items: [
      {
        id: 'profile',
        q: 'Update my name or photo',
        searchText: 'profile picture avatar display name email',
        a: (
          <>
            <p>
              Open <Link to="/app/profile">Profile</Link> to edit how you appear in meetings and chats. Some fields may
              be synced from your sign-in provider until you override them.
            </p>
          </>
        ),
      },
      {
        id: 'notifications-settings',
        q: 'Push and email notifications',
        searchText: 'push browser fcm settings bell',
        a: (
          <>
            <p>
              Visit <Link to="/app/settings">Settings</Link> to turn browser notifications on or off when supported.
              Meeting and chat behavior may also respect per-conversation mute settings.
            </p>
          </>
        ),
      },
      {
        id: 'sign-out',
        q: 'Sign out or switch accounts',
        searchText: 'logout sign out login google',
        a: (
          <>
            <p>
              Use <strong>Sign out</strong> from Settings (or your account menu where available). To use another
              account, sign out and sign back in with the other identity.
            </p>
          </>
        ),
      },
    ],
  },
  {
    id: 'security',
    title: 'Privacy & security',
    items: [
      {
        id: 'privacy-policy',
        q: 'Where are your policies?',
        searchText: 'privacy terms legal data gdpr',
        a: (
          <>
            <p>
              Read our <Link to="/app/privacy">Privacy Policy</Link>, <Link to="/app/terms">Terms</Link>, and{' '}
              <Link to="/app/security">Security</Link> overview for how we handle data and protect the service. Cookie
              details are in the <Link to="/app/cookies">Cookie Policy</Link>.
            </p>
          </>
        ),
      },
      {
        id: 'meeting-privacy',
        q: 'Who can see meeting content?',
        searchText: 'invite only transcript recording host',
        a: (
          <>
            <p>
              Access depends on meeting type (for example org-wide vs invite-only) and your role. Hosts control several
              visibility options such as whether the meeting ID is shown to everyone. When in doubt, ask the organizer.
            </p>
          </>
        ),
      },
    ],
  },
]

function filterHelpGroups(categoryId, query) {
  const needle = query.trim().toLowerCase()
  return HELP_FAQ_GROUPS.map((group) => {
    if (categoryId !== 'all' && group.id !== categoryId) {
      return { ...group, items: [] }
    }
    const items = !needle
      ? group.items
      : group.items.filter((item) => item.searchText.toLowerCase().includes(needle) || item.q.toLowerCase().includes(needle))
    return { ...group, items }
  }).filter((g) => g.items.length > 0)
}

export function AppHelpCenterPage() {
  const searchId = useId()
  const faqAnchorRef = useRef(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')

  const filteredGroups = useMemo(() => filterHelpGroups(category, query), [category, query])

  const scrollToFaq = () => {
    faqAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const setTopic = (id) => {
    setCategory(id)
    setQuery('')
    requestAnimationFrame(() => scrollToFaq())
  }

  return (
    <main className="app-main app-help-main">
      <div className="app-help-back">
        <Link to="/app" className="page-back-btn">
          <ArrowLeftIcon size={18} /> Back
        </Link>
      </div>

      <header className="app-help-hero">
        <p className="app-help-kicker">Support</p>
        <h1 className="app-help-title">Help Center</h1>
        <p className="app-help-lead">
          Search answers, browse by topic, or follow step-by-step guides. Everything here matches how Notus works in
          the app today, from video and chat to calendar and org settings.
        </p>
      </header>

      <div className="app-help-toolbar">
        <div className="app-help-search-wrap">
          <SearchIcon size={18} className="app-help-search-icon" aria-hidden />
          <input
            id={searchId}
            className="app-help-search-input"
            type="search"
            placeholder="Search help (e.g. screen share, mute, calendar…)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            aria-label="Search help articles"
          />
          {query ? (
            <button
              type="button"
              className="app-help-search-clear"
              onClick={() => setQuery('')}
              aria-label="Clear search"
            >
              <XIcon size={18} />
            </button>
          ) : null}
        </div>
        <div className="app-help-chips" role="group" aria-label="Filter by topic">
          {HELP_CATEGORY_CHIPS.map((c) => (
            <button
              key={c.id}
              type="button"
              className={['app-help-chip', category === c.id && 'app-help-chip--active'].filter(Boolean).join(' ')}
              onClick={() => setCategory(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <p className="app-help-section-title" id="browse-topics">
        Browse by topic
      </p>
      <div className="app-help-topic-grid" role="navigation" aria-labelledby="browse-topics">
        <button type="button" className="app-help-topic-card" onClick={() => setTopic('video')}>
          <div className="app-help-topic-card-icon" aria-hidden>
            <VideoIcon size={20} />
          </div>
          <h3>Video & meetings</h3>
          <p>Join flows, mic &amp; camera, screen share, host tools.</p>
        </button>
        <button type="button" className="app-help-topic-card" onClick={() => setTopic('chats')}>
          <div className="app-help-topic-card-icon" aria-hidden>
            <MessageSquareIcon size={20} />
          </div>
          <h3>Chats</h3>
          <p>Channels, DMs, notifications, and best practices.</p>
        </button>
        <button type="button" className="app-help-topic-card" onClick={() => setTopic('calendar')}>
          <div className="app-help-topic-card-icon" aria-hidden>
            <CalendarIcon size={20} />
          </div>
          <h3>Calendar</h3>
          <p>Schedule video meetings and manage your time.</p>
        </button>
        <button type="button" className="app-help-topic-card" onClick={() => setTopic('orgs')}>
          <div className="app-help-topic-card-icon" aria-hidden>
            <BuildingIcon size={20} />
          </div>
          <h3>Organizations</h3>
          <p>Switch workspaces, roles, and membership.</p>
        </button>
        <button type="button" className="app-help-topic-card" onClick={() => setTopic('account')}>
          <div className="app-help-topic-card-icon" aria-hidden>
            <UserIcon size={20} />
          </div>
          <h3>Account</h3>
          <p>Profile, notifications, and sign-in.</p>
        </button>
        <button type="button" className="app-help-topic-card" onClick={() => setTopic('security')}>
          <div className="app-help-topic-card-icon" aria-hidden>
            <LockIcon size={20} />
          </div>
          <h3>Privacy &amp; security</h3>
          <p>Policies, meeting visibility, and trust.</p>
        </button>
      </div>

      <p className="app-help-section-title">Guides</p>
      <div className="app-help-guides">
        <div className="app-help-guide">
          <h3 className="app-help-guide-title">
            <BookIcon size={16} className="app-help-guide-title-icon" aria-hidden />
            First week in Notus
          </h3>
          <ol>
            <li>Confirm your profile and notification preferences in Settings.</li>
            <li>Join or create an organization; explore the dashboard.</li>
            <li>Open Video for a test meeting, then check your microphone and camera.</li>
            <li>Pin Chats and Calendar from the header for daily use.</li>
          </ol>
        </div>
        <div className="app-help-guide">
          <h3 className="app-help-guide-title">Before an important call</h3>
          <ol>
            <li>Use a wired headset if possible; close heavy background tabs.</li>
            <li>Join one minute early to settle audio/video.</li>
            <li>If presenting, start screen share only when you are on the right window.</li>
            <li>Use the in-meeting chat if bandwidth is limited.</li>
          </ol>
        </div>
      </div>

      <div ref={faqAnchorRef}>
        <p className="app-help-section-title">Questions &amp; answers</p>
        {filteredGroups.length === 0 ? (
          <div className="app-help-empty">
            {query.trim() ? (
              <>
                No articles match <strong>&ldquo;{query.trim()}&rdquo;</strong>. Try a shorter keyword or{' '}
                <button type="button" className="app-help-text-btn" onClick={() => setQuery('')}>
                  clear search
                </button>
                .
              </>
            ) : (
              <>
                Nothing matched this filter. Try{' '}
                <button type="button" className="app-help-text-btn" onClick={() => setCategory('all')}>
                  All topics
                </button>
                .
              </>
            )}
          </div>
        ) : (
          <div className="app-help-faq">
            {filteredGroups.map((group) => (
              <div key={group.id}>
                {(category === 'all' || filteredGroups.length > 1) && <h2 className="app-help-faq-group-title">{group.title}</h2>}
                {group.items.map((item) => (
                  <details key={item.id} className="app-help-faq-item">
                    <summary>
                      <span>{item.q}</span>
                      <ChevronDownIcon size={18} className="app-help-faq-chevron" aria-hidden />
                    </summary>
                    <div className="app-help-faq-body">{item.a}</div>
                  </details>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="app-help-section-title">Product tours</p>
      <div className="app-resource-card" style={{ marginBottom: '1.25rem' }}>
        <h3 style={{ marginTop: 0 }}>Deeper walkthroughs</h3>
        <p style={{ marginBottom: '0.75rem' }}>
          Prefer a narrative tour? These in-app pages mirror the marketing story but stay inside your workspace.
        </p>
        <div className="app-resource-actions">
          <Link className="app-resource-link" to="/app/how-it-works">
            How it works →
          </Link>
          <Link className="app-resource-link" to="/app/features">
            Features →
          </Link>
        </div>
      </div>

      <div className="app-help-cta">
        <h2>Still need help?</h2>
        <p>
          Your org admin can assist with access and policy. For product questions or bugs, contact us; we read every
          message.
        </p>
        <div className="app-help-cta-actions">
          <Link to="/app/contact">Contact support</Link>
          <Link className="app-help-cta-secondary" to="/app/community">
            Community
          </Link>
        </div>
      </div>
    </main>
  )
}

const BLOG_CATEGORY_CHIPS = [
  { id: 'all', label: 'All posts' },
  { id: 'product', label: 'Product' },
  { id: 'meetings', label: 'Meetings' },
  { id: 'collaboration', label: 'Collaboration' },
  { id: 'workflow', label: 'Workflow' },
  { id: 'trust', label: 'Trust' },
]

const FEATURED_BLOG_SLUG = 'designing-calm-video'

const BLOG_POSTS = [
  {
    slug: 'designing-calm-video',
    title: 'Designing calm video for long workdays',
    excerpt:
      'Why we bias readable chrome, predictable stages, and screen-share layouts that do not fight the presenter.',
    category: 'product',
    categoryLabel: 'Product',
    dateLabel: 'Mar 28, 2026',
    readMin: 6,
    searchText: 'ui layout spotlight filmstrip accessibility dark mode',
    body: (
      <>
        <p>
          Video products often compete on feature count. We optimize for <strong>fatigue</strong>: fewer competing
          focal points, labels that stay legible on laptop screens, and controls that do not jump when someone shares
          their screen.
        </p>
        <p>
          The stage/filmstrip split exists so viewers always know where to look, while hosts keep participant context
          one glance away. When you present, you should not need a second monitor just to avoid recursive previews. We
          keep your own share off the giant tile by default.
        </p>
        <p>
          If something feels loud or cramped, tell us via <Link to="/app/contact">Contact</Link>. Visual polish is an
          ongoing release, not a one-off redesign.
        </p>
      </>
    ),
  },
  {
    slug: 'waiting-rooms-that-work',
    title: 'Waiting rooms that respect everyone’s time',
    excerpt:
      'Scheduled meetings, early guests, and hosts who need one more minute, without chaos in the lobby.',
    category: 'meetings',
    categoryLabel: 'Meetings',
    dateLabel: 'Mar 22, 2026',
    readMin: 5,
    searchText: 'waiting room admit early host scheduled',
    body: (
      <>
        <p>
          A waiting room is only useful if the rules are obvious: who can enter when, what early joiners see, and how
          hosts bulk-admit without hunting through menus.
        </p>
        <p>
          We bias toward <strong>scheduled integrity</strong>: if a meeting is not meant to start until 2:00, early
          arrivals should land somewhere calm, not in a half-started call. Hosts can still open the room early when the
          workflow demands it.
        </p>
        <p>
          Pair waiting rooms with a short agenda in chat so the first minute after admit is productive, not awkward.
        </p>
      </>
    ),
  },
  {
    slug: 'channels-over-email',
    title: 'Why channels beat long email chains',
    excerpt: 'Move decisions next to your team, keep history searchable, and stop losing attachments in reply-all.',
    category: 'collaboration',
    categoryLabel: 'Collaboration',
    dateLabel: 'Mar 18, 2026',
    readMin: 4,
    searchText: 'chat org channel thread async',
    body: (
      <>
        <p>
          Email excels at external correspondence. Inside a team, it fractures context: the same decision forked across
          three threads, screenshots out of order, and new hires who cannot reconstruct why a call happened.
        </p>
        <p>
          Org channels in Notus keep <strong>one durable timeline</strong> per topic. Pin the decision, link the meeting
          recap, and let people catch up without forwarding PDFs.
        </p>
        <p>
          Mute noisy threads per channel when you need focus; your global notification settings still apply. See{' '}
          <Link to="/app/help">Help Center</Link> for tips.
        </p>
      </>
    ),
  },
  {
    slug: 'dashboard-as-hub',
    title: 'The dashboard as a daily hub',
    excerpt: 'Glanceable meetings, org context, and fewer clicks before you are doing real work.',
    category: 'workflow',
    categoryLabel: 'Workflow',
    dateLabel: 'Mar 12, 2026',
    readMin: 5,
    searchText: 'dashboard widgets upcoming calendar',
    body: (
      <>
        <p>
          The first screen after login should answer: what is urgent, what is next, and where do I go to act? We keep
          widgets tight so the page loads fast and scans quickly on small laptops.
        </p>
        <p>
          Use the dashboard to jump into <Link to="/app/video">Video</Link>, <Link to="/app/calendar">Calendar</Link>,
          or your primary org without rebuilding mental context each morning.
        </p>
        <p>
          Admins: align default onboarding links so new members see the same “happy path” on day one.
        </p>
      </>
    ),
  },
  {
    slug: 'transcripts-accountability',
    title: 'Transcripts, captions, and gentle accountability',
    excerpt: 'When text trails audio, everyone can catch up, and teams can agree on what was said.',
    category: 'meetings',
    categoryLabel: 'Meetings',
    dateLabel: 'Mar 6, 2026',
    readMin: 7,
    searchText: 'transcript subtitle caption accessibility recap',
    body: (
      <>
        <p>
          Live captions help participants who join late, work in noisy environments, or process information better in
          text. Transcripts turn a meeting from a fleeting moment into something you can search and cite.
        </p>
        <p>
          Accountability does not mean surveillance; it means clarity. When action items live next to the words that
          spawned them, fewer commitments slip through the cracks.
        </p>
        <p>
          Check org policies on who can export or share recap material; when in doubt, ask your admin.
        </p>
      </>
    ),
  },
  {
    slug: 'screen-share-without-mirrors',
    title: 'Screen share without the infinite mirror',
    excerpt: 'Presenters see their cameras; viewers see the slide. Everyone stays oriented.',
    category: 'meetings',
    categoryLabel: 'Meetings',
    dateLabel: 'Feb 28, 2026',
    readMin: 3,
    searchText: 'screen share presenter viewer pinned spotlight',
    body: (
      <>
        <p>
          Sharing your whole desktop while the meeting is visible on that desktop creates a distracting feedback loop. We
          separate <strong>presenter</strong> and <strong>audience</strong> layouts so you keep spatial awareness without
          a hall of mirrors.
        </p>
        <p>
          If you teach or demo often, rehearse once with your actual monitor arrangement. You will thank yourself in the
          live session.
        </p>
      </>
    ),
  },
  {
    slug: 'org-boundaries-trust',
    title: 'Organization boundaries build trust',
    excerpt: 'Why chats, meetings, and settings respect the workspace you are in, and how to switch safely.',
    category: 'trust',
    categoryLabel: 'Trust',
    dateLabel: 'Feb 20, 2026',
    readMin: 5,
    searchText: 'organization switcher membership privacy scope',
    body: (
      <>
        <p>
          Notus scopes much of the product to an <strong>organization</strong> so customer data does not accidentally
          commingle. The org switcher is not cosmetic: it changes which channels, calendars, and policies apply.
        </p>
        <p>
          Before you paste a customer link or upload a file, confirm the correct org badge in the header. Admins can
          reinforce this with naming conventions (“Acme · Client work”).
        </p>
        <p>
          Read <Link to="/app/security">Security</Link> and <Link to="/app/privacy">Privacy</Link> for how we think
          about data handling at a high level.
        </p>
      </>
    ),
  },
  {
    slug: 'notifications-that-respect-focus',
    title: 'Notifications that respect focus time',
    excerpt: 'Push, badges, and per-conversation mute so alerts match how you actually work.',
    category: 'product',
    categoryLabel: 'Product',
    dateLabel: 'Feb 14, 2026',
    readMin: 4,
    searchText: 'push browser settings mute bell fcm',
    body: (
      <>
        <p>
          Notifications should be <strong>actionable</strong>, not ambient anxiety. We separate global preferences (in{' '}
          <Link to="/app/settings">Settings</Link>) from per-chat mute so you can silence a busy channel without going
          dark entirely.
        </p>
        <p>
          Browser push remains optional: some teams want pings for @mentions only; others want meeting starts. Tune
          until the signal-to-noise ratio feels sustainable.
        </p>
      </>
    ),
  },
  {
    slug: 'calendar-single-source',
    title: 'One calendar honesty layer',
    excerpt: 'Scheduled meetings, tasks, and imports without pretending everything lives in three tabs.',
    category: 'workflow',
    categoryLabel: 'Workflow',
    dateLabel: 'Feb 8, 2026',
    readMin: 5,
    searchText: 'calendar schedule import tasks personal org',
    body: (
      <>
        <p>
          The worst calendar experience is double-booking yourself because video lived in one tool and tasks in another.
          We bring <Link to="/app/calendar">Calendar</Link> next to meetings so you can see conflicts early.
        </p>
        <p>
          Imports and personal items may sit alongside org meetings. Use color or naming discipline so your week reads as
          a single truthful timeline.
        </p>
        <p>
          Hosts: when you move a meeting, update the event so Notus and your attendees stay aligned.
        </p>
      </>
    ),
  },
]

function filterBlogPosts(categoryId, query, posts) {
  const needle = query.trim().toLowerCase()
  return posts.filter((p) => {
    if (categoryId !== 'all' && p.category !== categoryId) return false
    if (!needle) return true
    const blob = `${p.title} ${p.excerpt} ${p.searchText}`.toLowerCase()
    return blob.includes(needle)
  })
}

export function AppBlogPage() {
  const searchId = useId()
  const browseRef = useRef(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')

  const filtered = useMemo(() => filterBlogPosts(category, query, BLOG_POSTS), [category, query])

  const showFeatured = category === 'all' && !query.trim()
  const featuredPost = BLOG_POSTS.find((p) => p.slug === FEATURED_BLOG_SLUG)
  const gridPosts = showFeatured
    ? filtered.filter((p) => p.slug !== FEATURED_BLOG_SLUG)
    : filtered

  const scrollToPost = (slug) => {
    setSearchParams(slug ? { post: slug } : {})
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.getElementById(`blog-post-${slug}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    })
  }

  useEffect(() => {
    const slug = searchParams.get('post')
    if (!slug || !filtered.some((p) => p.slug === slug)) return
    const t = window.setTimeout(() => {
      document.getElementById(`blog-post-${slug}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 80)
    return () => window.clearTimeout(t)
  }, [searchParams, filtered])

  const resetBrowse = () => {
    setCategory('all')
    setQuery('')
    setSearchParams({})
    browseRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <main className="app-main app-blog-main">
      <div className="app-help-back">
        <Link to="/app" className="page-back-btn">
          <ArrowLeftIcon size={18} /> Back
        </Link>
      </div>

      <header className="app-help-hero">
        <p className="app-help-kicker">Journal</p>
        <h1 className="app-help-title">Blog</h1>
        <p className="app-help-lead">
          Product notes, meeting craft, and workflow ideas from the Notus team. Search, filter, and read in full without
          leaving your workspace.
        </p>
      </header>

      <div className="app-help-toolbar">
        <div className="app-help-search-wrap">
          <SearchIcon size={18} className="app-help-search-icon" aria-hidden />
          <input
            id={searchId}
            className="app-help-search-input"
            type="search"
            placeholder="Search posts (e.g. transcript, calendar, screen share…)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            aria-label="Search blog posts"
          />
          {query ? (
            <button
              type="button"
              className="app-help-search-clear"
              onClick={() => setQuery('')}
              aria-label="Clear search"
            >
              <XIcon size={18} />
            </button>
          ) : null}
        </div>
        <div className="app-help-chips" role="group" aria-label="Filter posts by topic">
          {BLOG_CATEGORY_CHIPS.map((c) => (
            <button
              key={c.id}
              type="button"
              className={['app-help-chip', category === c.id && 'app-help-chip--active'].filter(Boolean).join(' ')}
              onClick={() => {
                setCategory(c.id)
                setSearchParams({})
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <p className="app-help-section-title" ref={browseRef}>
        Browse
      </p>

      {filtered.length === 0 ? (
        <div className="app-help-empty">
          {query.trim() ? (
            <>
              No posts match <strong>&ldquo;{query.trim()}&rdquo;</strong>.{' '}
              <button type="button" className="app-help-text-btn" onClick={() => setQuery('')}>
                Clear search
              </button>{' '}
              or try another category.
            </>
          ) : (
            <>
              No posts in this category yet.{' '}
              <button type="button" className="app-help-text-btn" onClick={() => setCategory('all')}>
                View all posts
              </button>
              .
            </>
          )}
        </div>
      ) : (
        <>
          {showFeatured && featuredPost && filtered.some((p) => p.slug === featuredPost.slug) ? (
            <button type="button" className="app-blog-featured" onClick={() => scrollToPost(featuredPost.slug)}>
              <span className="app-blog-featured-badge">Featured</span>
              <h2>{featuredPost.title}</h2>
              <p>{featuredPost.excerpt}</p>
              <div className="app-blog-featured-footer">
                <span>{featuredPost.categoryLabel}</span>
                <span>{featuredPost.dateLabel}</span>
                <span className="app-blog-featured-cta">Read article →</span>
              </div>
            </button>
          ) : null}

          <div className="app-blog-grid">
            {gridPosts.map((post) => (
              <button key={post.slug} type="button" className="app-blog-card" onClick={() => scrollToPost(post.slug)}>
                <span className="app-blog-card-tag">{post.categoryLabel}</span>
                <h3>{post.title}</h3>
                <p>{post.excerpt}</p>
                <div className="app-blog-card-meta">
                  <span>
                    <ClockIcon size={13} aria-hidden /> {post.readMin} min read
                  </span>
                  <span>{post.dateLabel}</span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {filtered.length > 0 ? (
        <>
          <p className="app-help-section-title">Read</p>
          <div className="app-blog-articles">
            {filtered.map((post) => (
              <article key={post.slug} id={`blog-post-${post.slug}`} className="app-blog-article">
                <header className="app-blog-article-header">
                  <h2 className="app-blog-article-title">{post.title}</h2>
                  <div className="app-blog-article-meta">
                    <span>{post.categoryLabel}</span>
                    <span>{post.dateLabel}</span>
                    <span>
                      <ClockIcon size={14} aria-hidden /> {post.readMin} min read
                    </span>
                  </div>
                </header>
                <div className="app-blog-article-body">{post.body}</div>
                <div className="app-blog-back-to-top">
                  <button type="button" onClick={resetBrowse}>
                    ↑ Back to browse
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      ) : null}

      <p className="app-help-section-title">More in the app</p>
      <div className="app-resource-card" style={{ marginBottom: '1.25rem' }}>
        <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <SparklesIcon size={18} aria-hidden />
          Guided tours
        </h3>
        <p style={{ marginBottom: '0.75rem' }}>
          Prefer structured help? Jump to Features or How it works, or search the Help Center for step-by-step answers.
        </p>
        <div className="app-resource-actions">
          <Link className="app-resource-link" to="/app/features">
            Features →
          </Link>
          <Link className="app-resource-link" to="/app/how-it-works">
            How it works →
          </Link>
          <Link className="app-resource-link" to="/app/help">
            Help Center →
          </Link>
        </div>
      </div>

      <div className="app-help-cta">
        <h2>Ideas for a post?</h2>
        <p>
          We publish notes on shipping, meetings, and team habits. If you have a story or lesson from using Notus, send
          it; we read everything.
        </p>
        <div className="app-help-cta-actions">
          <Link to="/app/contact">Suggest a topic</Link>
          <Link className="app-help-cta-secondary" to="/app/community">
            Community
          </Link>
        </div>
      </div>
    </main>
  )
}

const COMMUNITY_CATEGORY_CHIPS = [
  { id: 'all', label: 'All' },
  { id: 'org', label: 'Your org' },
  { id: 'feedback', label: 'Feedback' },
  { id: 'admins', label: 'Admins' },
  { id: 'culture', label: 'Culture' },
  { id: 'learning', label: 'Learning' },
]

const COMMUNITY_FAQ_GROUPS = [
  {
    id: 'org',
    title: 'Inside your organization',
    items: [
      {
        id: 'org-home',
        q: 'Where does “community” live day to day?',
        searchText: 'workspace channel org switcher team',
        a: (
          <>
            <p>
              Your <strong>organization</strong> in Notus is the primary community boundary: shared chats, calendars,
              and many meetings are scoped there. Use the org switcher in the header before you post customer data or
              start a sensitive call.
            </p>
            <p>
              Stand up a <strong>#welcome</strong> or <strong>#intros</strong> channel for new hires, and pin a short
              “how we use Notus” message so people know where to ask questions.
            </p>
          </>
        ),
      },
      {
        id: 'org-rituals',
        q: 'Lightweight rituals that scale',
        searchText: 'standup retro weekly async',
        a: (
          <>
            <p>
              You do not need a heavy process: a weekly thread for wins/blockers, a monthly “show something small you
              shipped,” or a rotating note-taker for leadership syncs all compound.
            </p>
            <p>Keep rituals in the same channel each time so history stays searchable.</p>
          </>
        ),
      },
      {
        id: 'org-onboarding',
        q: 'Onboarding buddies in Notus',
        searchText: 'new hire mentor shadow',
        a: (
          <>
            <p>
              Pair each newcomer with a buddy who walks them through Video (test call), Chats (where announcements
              live), and Calendar (how your team blocks focus time).
            </p>
            <p>
              Point people at the <Link to="/app/help">Help Center</Link> for device permissions and troubleshooting.
            </p>
          </>
        ),
      },
    ],
  },
  {
    id: 'feedback',
    title: 'Feedback that ships',
    items: [
      {
        id: 'fb-quality',
        q: 'What makes product feedback useful?',
        searchText: 'bug feature request repro steps expected',
        a: (
          <>
            <p>
              The best notes include: <strong>what you tried</strong>, <strong>what you expected</strong>, and{' '}
              <strong>what happened instead</strong> (screenshots welcome). If it is a bug, say which browser and
              roughly when it occurred.
            </p>
            <p>
              Send it through <Link to="/app/contact">Contact</Link> or your internal tracker. Either way, specifics beat
              “it feels broken.”
            </p>
          </>
        ),
      },
      {
        id: 'fb-prioritize',
        q: 'How we think about priorities',
        searchText: 'roadmap customer impact',
        a: (
          <>
            <p>
              We weigh safety, reliability, and broad customer impact ahead of niche shortcuts. That does not mean your
              idea is ignored. Small polish often lands quickly when the path is clear.
            </p>
          </>
        ),
      },
      {
        id: 'fb-stories',
        q: 'Share a customer or team story',
        searchText: 'case study blog lesson learned',
        a: (
          <>
            <p>
              If Notus helped you close a loop faster (fewer meetings, clearer handoffs, calmer video), consider writing it
              up for your org or suggesting it for the <Link to="/app/blog">Blog</Link>. Real narratives help other teams
              copy what worked.
            </p>
          </>
        ),
      },
    ],
  },
  {
    id: 'admins',
    title: 'For admins & owners',
    items: [
      {
        id: 'ad-policy',
        q: 'Set simple guardrails early',
        searchText: 'permissions screen share waiting room',
        a: (
          <>
            <p>
              Document defaults: who can create org meetings, whether screen share is open or host-gated, and how
              waiting rooms are used for external guests. Shorter policies get read.
            </p>
            <p>
              Revisit after your first month of real usage; teams discover edge cases quickly.
            </p>
          </>
        ),
      },
      {
        id: 'ad-champions',
        q: 'Appoint channel champions',
        searchText: 'moderator owner channel',
        a: (
          <>
            <p>
              Name one person per major channel who keeps the topic on-track, archives stale threads, and nudges
              decisions into meeting notes when chat runs long.
            </p>
          </>
        ),
      },
      {
        id: 'ad-health',
        q: 'Signals of a healthy workspace',
        searchText: 'lurker participation engagement',
        a: (
          <>
            <p>
              Healthy workspaces mix async writing with timely video. Watch for channels that go silent (maybe the topic
              moved elsewhere) or noisy (maybe they need sub-threads or a weekly summary post).
            </p>
          </>
        ),
      },
    ],
  },
  {
    id: 'culture',
    title: 'Culture & inclusion',
    items: [
      {
        id: 'cu-kind',
        q: 'Assume good intent, then clarify',
        searchText: 'respect tone async',
        a: (
          <>
            <p>
              Text strips nuance. If something lands wrong, ask a good-faith question before escalating. Many “bugs” are
              misaligned expectations about who owns a decision.
            </p>
          </>
        ),
      },
      {
        id: 'cu-timezones',
        q: 'Time zones and meeting fairness',
        searchText: 'global rotate schedule record',
        a: (
          <>
            <p>
              Rotate recurring meeting times when your team spans regions, or record key sessions so people who cannot
              attend still get context from transcripts and chat.
            </p>
          </>
        ),
      },
      {
        id: 'cu-access',
        q: 'Accessibility is everyone’s job',
        searchText: 'captions a11y',
        a: (
          <>
            <p>
              Turn on captions when anyone benefits; describe visuals briefly when you present; prefer agendas so
              neurodiverse teammates can prepare. Small habits make meetings kinder.
            </p>
          </>
        ),
      },
    ],
  },
  {
    id: 'learning',
    title: 'Learning together',
    items: [
      {
        id: 'lr-study',
        q: 'Run an internal “study hall”',
        searchText: 'training lunch learn demo',
        a: (
          <>
            <p>
              Pick one Notus feature per month (transcripts, calendar holds, screen share etiquette). Fifteen minutes of
              demo + ten minutes of Q&amp;A beats a hundred-page manual.
            </p>
          </>
        ),
      },
      {
        id: 'lr-library',
        q: 'Build a tiny link library',
        searchText: 'pinned resources playbook',
        a: (
          <>
            <p>
              Pin three links in your org dashboard or a <strong>#resources</strong> channel: employee handbook, support
              contact, and “how we meet.” Update quarterly.
            </p>
          </>
        ),
      },
      {
        id: 'lr-blog-help',
        q: 'Where to read more',
        searchText: 'documentation how it works features',
        a: (
          <>
            <p>
              Browse the <Link to="/app/blog">Blog</Link> for product philosophy, the <Link to="/app/help">Help Center</Link>{' '}
              for operational how-tos, and <Link to="/app/how-it-works">How it works</Link> for a full tour.
            </p>
          </>
        ),
      },
    ],
  },
]

function filterCommunityGroups(categoryId, query) {
  const needle = query.trim().toLowerCase()
  return COMMUNITY_FAQ_GROUPS.map((group) => {
    if (categoryId !== 'all' && group.id !== categoryId) {
      return { ...group, items: [] }
    }
    const items = !needle
      ? group.items
      : group.items.filter(
          (item) =>
            item.searchText.toLowerCase().includes(needle) || item.q.toLowerCase().includes(needle)
        )
    return { ...group, items }
  }).filter((g) => g.items.length > 0)
}

const CONVERSATION_STARTERS = [
  {
    id: 'cs-1',
    text: 'What is one thing we should stop doing in meetings this month?',
  },
  {
    id: 'cs-2',
    text: 'Where should async updates live vs when do we need a live call?',
  },
  {
    id: 'cs-3',
    text: 'Which customer problem are we solving this week, and how will we know we succeeded?',
  },
  {
    id: 'cs-4',
    text: 'What decision got stuck last sprint, and what would unblock the next one?',
  },
  {
    id: 'cs-5',
    text: 'Who needs visibility on this thread before we finalize?',
  },
]

function CommunityConversationStarters() {
  const { copied, copy } = useCopyFeedback()
  const [lastId, setLastId] = useState(null)

  useEffect(() => {
    if (!copied) setLastId(null)
  }, [copied])

  const handleCopy = async (id, text) => {
    const ok = await copy(text)
    if (ok) setLastId(id)
  }

  return (
    <div className="app-community-starters">
      <h2>Conversation starters</h2>
      <p className="app-resource-lead" style={{ marginBottom: '1rem' }}>
        Copy a prompt into your org channel or retro doc. Built for leads who want better discussions without awkward
        silence.
      </p>
      {CONVERSATION_STARTERS.map((row) => (
        <div key={row.id} className="app-community-starter-row">
          <p className="app-community-starter-text">{row.text}</p>
          <button
            type="button"
            className={[
              'app-community-copy-btn',
              copied && lastId === row.id ? 'app-community-copy-btn--done' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => handleCopy(row.id, row.text)}
          >
            {copied && lastId === row.id ? 'Copied' : 'Copy'}
          </button>
        </div>
      ))}
    </div>
  )
}

export function AppCommunityPage() {
  const searchId = useId()
  const faqRef = useRef(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')

  const filteredGroups = useMemo(() => filterCommunityGroups(category, query), [category, query])

  const scrollToFaq = () => {
    faqRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const setTopic = (id) => {
    setCategory(id)
    setQuery('')
    requestAnimationFrame(() => scrollToFaq())
  }

  return (
    <main className="app-main app-help-main">
      <div className="app-help-back">
        <Link to="/app" className="page-back-btn">
          <ArrowLeftIcon size={18} /> Back
        </Link>
      </div>

      <header className="app-help-hero">
        <p className="app-help-kicker">Together</p>
        <h1 className="app-help-title">Community</h1>
        <p className="app-help-lead">
          Practical plays for org leaders, feedback that reaches the product team, and shared norms. Search, filter, and
          copy prompts into your own workspace.
        </p>
      </header>

      <div className="app-help-toolbar">
        <div className="app-help-search-wrap">
          <SearchIcon size={18} className="app-help-search-icon" aria-hidden />
          <input
            id={searchId}
            className="app-help-search-input"
            type="search"
            placeholder="Search (e.g. onboarding, feedback, time zone…)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            aria-label="Search community guides"
          />
          {query ? (
            <button
              type="button"
              className="app-help-search-clear"
              onClick={() => setQuery('')}
              aria-label="Clear search"
            >
              <XIcon size={18} />
            </button>
          ) : null}
        </div>
        <div className="app-help-chips" role="group" aria-label="Filter by topic">
          {COMMUNITY_CATEGORY_CHIPS.map((c) => (
            <button
              key={c.id}
              type="button"
              className={['app-help-chip', category === c.id && 'app-help-chip--active'].filter(Boolean).join(' ')}
              onClick={() => setCategory(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <p className="app-help-section-title">Plays to try this week</p>
      <div className="app-community-play-grid">
        <Link to="/app/contact" className="app-community-play">
          <h3>Send product feedback</h3>
          <p>
            Tell us what broke, what confused you, or what would save ten minutes a day, with enough detail to reproduce.
          </p>
          <span className="app-community-play-cta">Open contact →</span>
        </Link>
        <Link to="/app/blog" className="app-community-play">
          <h3>Read the journal</h3>
          <p>Longer notes on how we think about meetings, notifications, and calm software. Filter by topic inside the blog.</p>
          <span className="app-community-play-cta">Open blog →</span>
        </Link>
        <Link to="/app/help" className="app-community-play">
          <h3>Answer “how do I…?”</h3>
          <p>
            Point teammates at searchable FAQs for video, chat, calendar, and org settings. That is faster than recording a
            one-off Loom.
          </p>
          <span className="app-community-play-cta">Open Help Center →</span>
        </Link>
      </div>

      <p className="app-help-section-title">Browse by focus</p>
      <div className="app-help-topic-grid" role="navigation" aria-label="Community topics">
        <button type="button" className="app-help-topic-card" onClick={() => setTopic('org')}>
          <div className="app-help-topic-card-icon" aria-hidden>
            <BuildingIcon size={20} />
          </div>
          <h3>Your org</h3>
          <p>Rituals, channels, onboarding, and where work lives.</p>
        </button>
        <button type="button" className="app-help-topic-card" onClick={() => setTopic('feedback')}>
          <div className="app-help-topic-card-icon" aria-hidden>
            <MessageSquareIcon size={20} />
          </div>
          <h3>Feedback</h3>
          <p>Useful bug reports, stories, and how we prioritize.</p>
        </button>
        <button type="button" className="app-help-topic-card" onClick={() => setTopic('admins')}>
          <div className="app-help-topic-card-icon" aria-hidden>
            <StarIcon size={20} />
          </div>
          <h3>Admins</h3>
          <p>Guardrails, champions, and healthy workspace signals.</p>
        </button>
        <button type="button" className="app-help-topic-card" onClick={() => setTopic('culture')}>
          <div className="app-help-topic-card-icon" aria-hidden>
            <UsersIcon size={20} />
          </div>
          <h3>Culture</h3>
          <p>Kind candor, time zones, and accessibility habits.</p>
        </button>
        <button type="button" className="app-help-topic-card" onClick={() => setTopic('learning')}>
          <div className="app-help-topic-card-icon" aria-hidden>
            <SparklesIcon size={20} />
          </div>
          <h3>Learning</h3>
          <p>Study halls, link libraries, and where to read more.</p>
        </button>
        <button type="button" className="app-help-topic-card" onClick={() => setTopic('all')}>
          <div className="app-help-topic-card-icon" aria-hidden>
            <FlagIcon size={20} />
          </div>
          <h3>All guides</h3>
          <p>Reset filters and scan every section below.</p>
        </button>
      </div>

      <div className="app-community-guidelines">
        <h2>Ground rules we recommend</h2>
        <ol>
          <li>
            <strong>Default transparent, escalate privately.</strong> Start disagreements in the smallest audience that
            can resolve them; take heat out of thread if emotions run high.
          </li>
          <li>
            <strong>Credit sources.</strong> When you forward a decision, link the chat or meeting note it came from.
          </li>
          <li>
            <strong>Protect customer data.</strong> Follow your org’s policies; when unsure, ask an admin before posting
            identifiers or recordings.
          </li>
          <li>
            <strong>Celebrate small wins.</strong> Short shout-outs in team channels compound morale without another
            meeting.
          </li>
        </ol>
      </div>

      <CommunityConversationStarters />

      <div ref={faqRef}>
        <p className="app-help-section-title">Guides &amp; answers</p>
        {filteredGroups.length === 0 ? (
          <div className="app-help-empty">
            {query.trim() ? (
              <>
                No results for <strong>&ldquo;{query.trim()}&rdquo;</strong>.{' '}
                <button type="button" className="app-help-text-btn" onClick={() => setQuery('')}>
                  Clear search
                </button>{' '}
                or pick another topic.
              </>
            ) : (
              <>
                Nothing in this filter.{' '}
                <button type="button" className="app-help-text-btn" onClick={() => setCategory('all')}>
                  Show all
                </button>
                .
              </>
            )}
          </div>
        ) : (
          <div className="app-help-faq">
            {filteredGroups.map((group) => (
              <div key={group.id}>
                {(category === 'all' || filteredGroups.length > 1) && (
                  <h2 className="app-help-faq-group-title">{group.title}</h2>
                )}
                {group.items.map((item) => (
                  <details key={item.id} className="app-help-faq-item">
                    <summary>
                      <span>{item.q}</span>
                      <ChevronDownIcon size={18} className="app-help-faq-chevron" aria-hidden />
                    </summary>
                    <div className="app-help-faq-body">{item.a}</div>
                  </details>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="app-help-section-title">Jump elsewhere</p>
      <nav className="app-community-link-pills" aria-label="Related pages">
        <Link to="/app/about">About</Link>
        <Link to="/app/features">Features</Link>
        <Link to="/app/how-it-works">How it works</Link>
        <Link to="/app/careers">Careers</Link>
        <Link to="/app/security">Security</Link>
      </nav>

      <div className="app-help-cta">
        <h2>Want a public space later?</h2>
        <p>
          We may add forums or programs you can join across orgs. Until then, your workspace here is the best place to
          practice these plays, then tell us what you need next.
        </p>
        <div className="app-help-cta-actions">
          <Link to="/app/contact">Tell us what to build</Link>
          <Link className="app-help-cta-secondary" to="/app/blog">
            Read the blog
          </Link>
        </div>
      </div>
    </main>
  )
}
