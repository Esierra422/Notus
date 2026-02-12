import { Nav, Hero, Features, HowItWorks, CTA, Footer } from '../components/landing'
import '../styles/variables.css'
import '../styles/landing.css'

export function LandingPage() {
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
