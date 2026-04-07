import { useEffect } from 'react'
import { Nav, HowItWorks, Footer } from '../components/landing'
import { applyPublicMeta } from '../lib/seo'
import '../styles/variables.css'
import '../styles/landing.css'

export function HowItWorksPage() {
  useEffect(() => {
    applyPublicMeta({
      title: 'How Notus Works | From Planning to Delivery',
      description:
        'See how Notus helps teams plan, meet, document outcomes, and follow through with clear next actions.',
      path: '/how-it-works',
    })
  }, [])

  return (
    <div className="landing">
      <div className="landing__grid" aria-hidden />
      <Nav />
      <HowItWorks />
      <Footer />
    </div>
  )
}
