import { Nav, Hero, Features, HowItWorks, CTA, Footer } from '../components/landing'
import '../styles/variables.css'
import '../styles/landing.css'

export function LandingPage() {
  return (
    <div className="landing">
      <Nav />
      <Hero />
      <Features />
      <HowItWorks />
      <CTA />
      <Footer />
    </div>
  )
}
