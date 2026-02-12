import { useInView } from '../../hooks/useInView'
import './ScrollReveal.css'

export function ScrollReveal({ children, delay = 0, className = '', as: Tag = 'div' }) {
  const { ref, inView } = useInView({ rootMargin: '0px 0px -60px 0px', threshold: 0.1 })

  return (
    <Tag
      ref={ref}
      className={`scroll-reveal ${inView ? 'scroll-reveal--in' : ''} ${className}`.trim()}
      style={{ transitionDelay: inView ? `${delay}ms` : undefined }}
    >
      {children}
    </Tag>
  )
}
