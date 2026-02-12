import { Nav, HowItWorks, Footer } from '../components/landing'
import '../styles/variables.css'
import '../styles/landing.css'

export function HowItWorksPage() {
  return (
    <div className="landing">
      <div className="landing__grid" aria-hidden />
      <Nav />
      <HowItWorks />
      <Footer />
    </div>
  )
}
