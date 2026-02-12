import { Button } from '../ui/Button'
import { ScrollReveal } from './ScrollReveal'
import './CTA.css'

export function CTA() {
  return (
    <section className="cta">
      <ScrollReveal>
        <h2 className="cta-title">Ready to work smarter?</h2>
        <p className="cta-subtitle">
          Join teams who've stopped juggling tools and started shipping faster.
        </p>
        <Button to="/signup" variant="primary" size="lg">Sign up</Button>
      </ScrollReveal>
    </section>
  )
}
