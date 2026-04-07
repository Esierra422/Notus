import './Skeleton.css'

export function Skeleton({ className = '', lines = 0 }) {
  if (lines > 0) {
    return (
      <div className={`notus-skeleton-block ${className}`.trim()} aria-hidden>
        {Array.from({ length: lines }).map((_, idx) => (
          <span key={idx} className="notus-skeleton-line" />
        ))}
      </div>
    )
  }
  return <span className={`notus-skeleton ${className}`.trim()} aria-hidden />
}
