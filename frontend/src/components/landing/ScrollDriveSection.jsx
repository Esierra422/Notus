import { useScrollProgress } from '../../hooks/useScrollProgress'
import './ScrollDriveSection.css'

const ROTATION_RANGE = 28 // degrees each side (Y axis)

export function ScrollDriveSection() {
  const { containerRef, progress } = useScrollProgress({ runHeight: 300 })

  // progress 0 -> rotateY(-28deg), progress 0.5 -> rotateY(0), progress 1 -> rotateY(28deg)
  const rotateY = (progress - 0.5) * 2 * ROTATION_RANGE
  const rotateX = Math.sin(progress * Math.PI) * 4 // subtle tilt at edges

  return (
    <section ref={containerRef} className="scroll-drive">
      <div className="scroll-drive-sticky">
        <div
          className="scroll-drive-mockup-wrap"
          style={{
            transform: `perspective(1200px) rotateY(${rotateY}deg) rotateX(${rotateX}deg)`,
          }}
        >
          <div className="scroll-drive-mockup">
            <div className="mockup-bar">
              <span className="mockup-dot"></span>
              <span className="mockup-dot"></span>
              <span className="mockup-dot"></span>
            </div>
            <div className="mockup-content">
              <div className="mockup-sidebar"></div>
              <div className="mockup-main">
                <div className="mockup-chat mockup-chat--alt"></div>
                <div className="mockup-chat"></div>
                <div className="mockup-chat mockup-chat--alt"></div>
                <div className="mockup-chat"></div>
                <div className="mockup-chat mockup-chat--short"></div>
              </div>
            </div>
          </div>
        </div>
        <p className="scroll-drive-hint">Scroll to explore</p>
      </div>
    </section>
  )
}
