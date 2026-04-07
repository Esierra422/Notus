import { ScrollReveal } from './ScrollReveal'
import './HowItWorks.css'

const STEPS = [
  {
    num: 1,
    title: 'Sign up in seconds',
    desc: 'Create your account with Google or email. No credit card required. Choose a display name and profile photo. Add birthdate, phone, and time zone later in your profile.',
  },
  {
    num: 2,
    title: 'Create or join an organization',
    desc: 'Start a new organization for your team, or search for and request to join an existing one. Organizations give you a shared workspace with teams, channels, and members. Admins can approve join requests.',
  },
  {
    num: 3,
    title: 'Invite teammates',
    desc: 'Invite colleagues by email; they receive a link to join your org. Then add them to teams, or create open-to-join teams so org members can join without a direct invite.',
  },
  {
    num: 4,
    title: 'Set up teams and channels',
    desc: 'Create teams within your org (e.g. Engineering, Marketing). Each team can have a profile and description. Start text channels for async chat. Channels keep discussions organized by topic or project.',
  },
  {
    num: 5,
    title: 'Meet and collaborate in real time',
    desc: 'Start video or voice calls from the dashboard or any channel. Live transcripts and subtitles run automatically. Mute, toggle camera, and manage participants. Everything stays in one place.',
  },
  {
    num: 6,
    title: 'Capture and organize outcomes',
    desc: 'AI generates meeting summaries and notes. Ask the AI questions during or after meetings. Share notes in channels, update the collaborative notebook, and add action items to your to-do list.',
  },
  {
    num: 7,
    title: 'Stay in sync',
    desc: 'Use the calendar to schedule meetings and view upcoming events. Import from Google Calendar or iCal. Get notifications for invites, join requests, and updates. Your dashboard surfaces what matters next.',
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="how">
      <ScrollReveal>
        <h2 className="section-title">Simple by design</h2>
        <p className="section-subtitle">
          From signup to your first meeting: how Notus works.
        </p>
      </ScrollReveal>
      <div className="how-steps how-steps--vertical">
        {STEPS.map((s, i) => (
          <ScrollReveal key={s.num} delay={80 * i}>
            <div className="how-step">
              <span className="how-num">{s.num}</span>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </div>
          </ScrollReveal>
        ))}
      </div>
    </section>
  )
}
