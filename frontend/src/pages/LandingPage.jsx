import { useEffect } from 'react'
import { Nav, Hero, Features, HowItWorks, CTA, Footer } from '../components/landing'
import { applyPublicMeta } from '../lib/seo'
import '../styles/variables.css'
import '../styles/landing.css'

export function LandingPage() {
  useEffect(() => {
    applyPublicMeta({
      title: 'Notus | Team Collaboration Platform',
      description:
        'Coordinate work with team chat, shared calendars, secure video meetings, and AI-generated meeting summaries.',
      path: '/',
    })
  }, [])

  return (
    <div className="landing">
      <div className="landing__grid" aria-hidden />
      <Nav />
      <Hero />
      <Features />
      <HowItWorks />
      <CTA />
      <Footer />
    </div>
  )
}
