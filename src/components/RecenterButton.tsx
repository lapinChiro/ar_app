import type { CSSProperties } from 'react'

interface RecenterButtonProps {
  onRecenter: () => void
}

const buttonStyle: CSSProperties = {
  position: 'fixed',
  bottom: '2rem',
  left: '50%',
  transform: 'translateX(-50%)',
  padding: '0.6rem 1.5rem',
  fontSize: '0.9rem',
  border: '1px solid rgba(255, 255, 255, 0.3)',
  borderRadius: '2rem',
  background: 'rgba(0, 0, 0, 0.5)',
  color: '#fff',
  cursor: 'pointer',
  touchAction: 'manipulation',
  zIndex: 2,
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
}

export function RecenterButton({ onRecenter }: RecenterButtonProps) {
  return (
    <button style={buttonStyle} onClick={onRecenter}>
      リセンター
    </button>
  )
}
