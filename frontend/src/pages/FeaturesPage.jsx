import { useEffect } from 'react'
import { Nav, Features, Footer } from '../components/landing'
import { applyPublicMeta } from '../lib/seo'
import '../styles/variables.css'
import '../styles/landing.css'

export function FeaturesPage() {
  useEffect(() => {
    applyPublicMeta({
      title: 'Notus Features | Collaboration, Video, AI',
      description:
        'Explore Notus capabilities across messaging, meetings, calendars, and AI-powered summaries designed for modern teams.',
      path: '/features',
    })
  }, [])

  return (
    <div className="landing">
      <div className="landing__grid" aria-hidden />
      <Nav />
      <Features />
      <Footer />
    </div>
  )
}
