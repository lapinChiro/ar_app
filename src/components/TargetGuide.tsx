import type { CSSProperties } from 'react'

const guideStyle: CSSProperties = {
  position: 'fixed',
  bottom: '4rem',
  left: '50%',
  transform: 'translateX(-50%)',
  padding: '0.8rem 1.5rem',
  background: 'rgba(0, 0, 0, 0.6)',
  color: '#fff',
  borderRadius: '1rem',
  fontSize: '0.9rem',
  zIndex: 2,
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  textAlign: 'center',
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
}

export function TargetGuide() {
  return (
    <div style={guideStyle}>
      マーカーにカメラを向けてください
    </div>
  )
}
