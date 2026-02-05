import { VideoIcon, FileTextIcon, SparklesIcon, BookIcon, MessageSquareIcon, CalendarIcon } from '../ui/Icons'
import './Features.css'

const FEATURES = [
  { Icon: VideoIcon, title: 'Video & Voice', desc: 'HD calls with up to 2+ participants. Mute, camera toggle, and host controls built in.' },
  { Icon: FileTextIcon, title: 'Live Transcripts', desc: 'Real-time speech-to-text and subtitles. Search by keyword or speaker, download anytime.' },
  { Icon: SparklesIcon, title: 'AI Assistant', desc: 'Ask questions during and after meetings. Get summaries, notes, and answers in context.' },
  { Icon: BookIcon, title: 'Collaborative Notes', desc: 'Shared notebooks with multi-user editing. AI helps draft and organize from transcripts.' },
  { Icon: MessageSquareIcon, title: 'Text Channels', desc: 'Group channels for async chat. Find teammates, share links, and keep context in one place.' },
  { Icon: CalendarIcon, title: 'Calendar & Planner', desc: 'Schedule meetings, add events, and share calendars. Never miss a sync again.' },
]

export function Features() {
  return (
    <section id="features" className="features">
      <h2 className="section-title">Everything you need to collaborate</h2>
      <p className="section-subtitle">
        Video, voice, notes, and AI—integrated so your team can focus on the work.
      </p>
      <div className="features-grid">
        {FEATURES.map((f) => (
          <article key={f.title} className="feature-card">
            <div className="feature-icon">
              <f.Icon size={24} />
            </div>
            <h3>{f.title}</h3>
            <p>{f.desc}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
