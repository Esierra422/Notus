import { VideoIcon, FileTextIcon, SparklesIcon, BookIcon, MessageSquareIcon, CalendarIcon, UsersIcon, BuildingIcon, BellIcon, ClipboardIcon, SettingsIcon, LayoutDashboardIcon } from '../ui/Icons'
import { ScrollReveal } from './ScrollReveal'
import './Features.css'

const FEATURES = [
  {
    Icon: VideoIcon,
    title: 'Video & Voice Calls',
    desc: 'HD video and clear voice calls with multiple participants. Mute, camera, and host controls are built in. Start calls from any channel or the dashboard without switching apps.',
  },
  {
    Icon: FileTextIcon,
    title: 'Live Transcripts',
    desc: 'Real-time speech-to-text and live subtitles for every meeting. Search transcripts by keyword or speaker. Download transcripts for records, compliance, or sharing with stakeholders who couldn’t attend.',
  },
  {
    Icon: SparklesIcon,
    title: 'AI Assistant',
    desc: 'Ask questions during and after meetings. Get instant summaries, action items, and key decisions. AI pulls answers from your transcripts so you never miss context. Perfect for catching up or finding that one detail.',
  },
  {
    Icon: BookIcon,
    title: 'Collaborative Notes',
    desc: 'Shared notebooks with real-time multi-user editing. AI helps draft and organize notes from meeting transcripts. Everyone stays on the same page with version history and structured layouts.',
  },
  {
    Icon: MessageSquareIcon,
    title: 'Text Channels',
    desc: 'Group channels for async chat: one per team or topic. Find teammates, share links, and discuss in context. Unread badges and threaded replies keep conversations organized and out of long email chains.',
  },
  {
    Icon: CalendarIcon,
    title: 'Calendar & Planner',
    desc: 'Schedule meetings, add events, and view your agenda at a glance. Import from Google Calendar or iCal and share calendars across your org. Upcoming meetings surface on your dashboard so nothing slips through.',
  },
  {
    Icon: BuildingIcon,
    title: 'Organizations',
    desc: 'Create or join organizations to structure your workspace. Each org has its own teams, channels, and members. Request to join public orgs or invite colleagues via email. Org profiles with descriptions help teams align.',
  },
  {
    Icon: UsersIcon,
    title: 'Teams & Invitations',
    desc: 'Create teams within your organization. Invite members by email (similar to org invites, scoped to a team). Optional open-to-join teams let org members self-join. Profiles and descriptions keep everyone aligned.',
  },
  {
    Icon: LayoutDashboardIcon,
    title: 'Unified Dashboard',
    desc: 'One place for meetings, teams, org admin, and to-dos. See upcoming meetings, team memberships, pending invitations, and your task list. Quick shortcuts to calendar, video, and chat.',
  },
  {
    Icon: ClipboardIcon,
    title: 'To-Dos & Tasks',
    desc: 'Personal and shared to-dos right on the dashboard. Add due dates, check off completed items, and delete when done. Stay on top of action items from meetings and async discussions.',
  },
  {
    Icon: BellIcon,
    title: 'Notifications',
    desc: 'Get notified for team invitations, org join requests, and other updates. Notification dropdown in the header keeps you informed without clutter. Never miss an invite or approval request.',
  },
  {
    Icon: SettingsIcon,
    title: 'Profile & Settings',
    desc: 'Complete profile with display name, photo, birthdate, and phone. Notification settings and connected accounts. Meeting preferences, transcript settings, and storage controls. Sign in with Google or email.',
  },
]

export function Features() {
  return (
    <section id="features" className="features">
      <ScrollReveal>
        <h2 className="section-title">Everything you need to collaborate</h2>
        <p className="section-subtitle">
          Video, voice, notes, AI, teams, and more in one place so your team can focus on the work.
        </p>
      </ScrollReveal>
      <div className="features-grid">
        {FEATURES.map((f, i) => (
          <ScrollReveal key={f.title} delay={40 * (i % 6)}>
            <article className="feature-card">
              <div className="feature-icon">
                <f.Icon size={24} />
              </div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </article>
          </ScrollReveal>
        ))}
      </div>
    </section>
  )
}
