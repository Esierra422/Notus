import { Nav, Features, Footer } from '../components/landing'
import '../styles/variables.css'
import '../styles/landing.css'

export function FeaturesPage() {
  return (
    <div className="landing">
      <div className="landing__grid" aria-hidden />
      <Nav />
      <Features />
      <Footer />
    </div>
  )
}
