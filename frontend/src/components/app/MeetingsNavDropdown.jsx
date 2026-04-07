import { Link, useLocation } from 'react-router-dom'
import { Video } from 'lucide-react'
import './MeetingsNavDropdown.css'

const VIDEO_LOBBY = '/app/video'

export function MeetingsNavDropdown() {
  const loc = useLocation()

  const onVideoPath =
    /^\/app\/video(\/|$)/.test(loc.pathname) || /^\/app\/org\/[^/]+\/video(\/|$)/.test(loc.pathname)

  return (
    <Link
      to={VIDEO_LOBBY}
      className={['app-nav-meetings-trigger', onVideoPath && 'app-nav-meetings-trigger--active']
        .filter(Boolean)
        .join(' ')}
      title="Video Room"
      aria-label="Video Room"
    >
      <Video size={20} strokeWidth={2.25} aria-hidden />
    </Link>
  )
}
