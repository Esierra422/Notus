import { Button } from '../ui/Button'
import { ScrollReveal } from './ScrollReveal'
import { AmbientGraphics } from './AmbientGraphics'
import './Hero.css'

export function Hero() {
  return (
    <section className="hero">
      <AmbientGraphics />
      <ScrollReveal delay={0}>
        <p className="hero-badge">One place for your whole team</p>
      </ScrollReveal>
      <ScrollReveal delay={80}>
        <h1 className="hero-title">
          Team collaboration,
          <span className="hero-accent"> simplified.</span>
        </h1>
      </ScrollReveal>
      <ScrollReveal delay={160}>
        <p className="hero-subtitle">
          Video calls, real-time transcripts, AI notes, and collaborative tools—
          all in one workspace. Stop juggling apps. Start building together.
        </p>
      </ScrollReveal>
      <ScrollReveal delay={240}>
        <div className="hero-actions">
          <Button to="/signup" variant="primary" size="lg">Sign up</Button>
          <Button to="/how-it-works" variant="outline" size="lg">See how it works</Button>
        </div>
        <p className="hero-primer">Set up your team in under 2 minutes.</p>
      </ScrollReveal>
      <ScrollReveal delay={400}>
      <div className="hero-visual">
        <div className="hero-mockup">
          <div className="mockup-bar">
            <span className="mockup-dot"></span>
            <span className="mockup-dot"></span>
            <span className="mockup-dot"></span>
          </div>
          <div className="mockup-content">
            <div className="mockup-sidebar"></div>
            <div className="mockup-main">
              <div className="mockup-chat mockup-chat--alt"></div>
              <div className="mockup-chat"></div>
              <div className="mockup-chat mockup-chat--alt"></div>
              <div className="mockup-chat"></div>
              <div className="mockup-chat mockup-chat--short"></div>
            </div>
          </div>
        </div>
      </div>
      </ScrollReveal>
    </section>
  )
}
