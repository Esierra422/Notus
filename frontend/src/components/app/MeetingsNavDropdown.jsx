import { useState, useRef, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Video, ChevronDown } from 'lucide-react'
import './MeetingsNavDropdown.css'

const VIDEO_LOBBY = '/app/video'
const VIDEO_MEETINGS = '/app/video/meetings'

export function MeetingsNavDropdown() {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const loc = useLocation()

  const onVideoPath =
    /^\/app\/video(\/|$)/.test(loc.pathname) || /^\/app\/org\/[^/]+\/video(\/|$)/.test(loc.pathname)

  useEffect(() => {
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [])

  return (
    <div className="app-nav-meetings-wrap" ref={wrapRef}>
      <button
        type="button"
        className={['app-nav-meetings-trigger', onVideoPath && 'app-nav-meetings-trigger--active']
          .filter(Boolean)
          .join(' ')}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        aria-expanded={open}
        aria-haspopup="menu"
        title="Meetings"
        aria-label="Meetings menu"
      >
        <Video size={20} strokeWidth={2.25} aria-hidden />
        <ChevronDown size={14} strokeWidth={2.5} className="app-nav-meetings-chevron" aria-hidden />
      </button>
      {open && (
        <div className="app-nav-meetings-dropdown" role="menu">
          <Link to={VIDEO_LOBBY} role="menuitem" className="app-nav-meetings-item" onClick={() => setOpen(false)}>
            Video Room
          </Link>
          <Link
            to={VIDEO_MEETINGS}
            role="menuitem"
            className="app-nav-meetings-item"
            onClick={() => setOpen(false)}
          >
            Past Meetings & Transcripts
          </Link>
        </div>
      )}
    </div>
  )
}
