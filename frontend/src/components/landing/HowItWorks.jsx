import './HowItWorks.css'

const STEPS = [
  { num: 1, title: 'Create a workspace', desc: 'Sign up with Google or email. Name your workspace and invite teammates.' },
  { num: 2, title: 'Meet & discuss', desc: 'Start video or voice calls from any channel. Transcripts and subtitles run automatically.' },
  { num: 3, title: 'Capture & act', desc: 'AI generates notes from meetings. Share in channels, update the notebook, and plan next steps.' },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="how">
      <h2 className="section-title">Simple by design</h2>
      <p className="section-subtitle">
        Create a workspace, invite your team, and start collaborating in minutes.
      </p>
      <div className="how-steps">
        {STEPS.map((s) => (
          <div key={s.num} className="how-step">
            <span className="how-num">{s.num}</span>
            <h3>{s.title}</h3>
            <p>{s.desc}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
