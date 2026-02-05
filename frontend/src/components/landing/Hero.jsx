import { Link } from 'react-router-dom'
import { Button } from '../ui/Button'
import './Hero.css'

export function Hero() {
  return (
    <section className="hero">
      <p className="hero-badge">One place for your whole team</p>
      <h1 className="hero-title">
        Meet. Plan.
        <span className="hero-accent">Ship.</span>
      </h1>
      <p className="hero-subtitle">
        Video calls, real-time transcripts, AI notes, and collaborative tools—
        all in one workspace. Stop juggling apps. Start building together.
      </p>
      <div className="hero-actions">
        <Button to="/signup" variant="primary" size="lg">Sign up</Button>
        <Button href="#how-it-works" variant="outline" size="lg">See how it works</Button>
      </div>
      <p className="hero-primer">Set up your team in under 2 minutes.</p>
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
              <div className="mockup-chat"></div>
              <div className="mockup-chat mockup-chat--alt"></div>
              <div className="mockup-chat"></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
