import type { CSSProperties } from 'react'

interface StartScreenProps {
  status: 'idle' | 'requesting' | 'error'
  error?: string
  onStart: () => void
}

const containerStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'linear-gradient(135deg, #0a1628, #1a3a5c)',
  color: '#fff',
  zIndex: 10,
  fontFamily: 'system-ui, sans-serif',
}

const titleStyle: CSSProperties = {
  fontSize: '2rem',
  fontWeight: 'bold',
  marginBottom: '2rem',
}

const buttonStyle: CSSProperties = {
  padding: '1rem 2rem',
  fontSize: '1.2rem',
  border: 'none',
  borderRadius: '0.5rem',
  background: '#3b82f6',
  color: '#fff',
  cursor: 'pointer',
  touchAction: 'manipulation',
}

const errorStyle: CSSProperties = {
  color: '#f87171',
  fontSize: '0.9rem',
  marginBottom: '1rem',
  textAlign: 'center',
  padding: '0 2rem',
}

const loadingStyle: CSSProperties = {
  fontSize: '1rem',
  color: '#94a3b8',
}

export function StartScreen({ status, error, onStart }: StartScreenProps) {
  return (
    <div style={containerStyle}>
      <h1 style={titleStyle}>AR Fish</h1>

      {status === 'idle' && (
        <button style={buttonStyle} onClick={onStart}>
          AR を開始する
        </button>
      )}

      {status === 'requesting' && (
        <p style={loadingStyle}>カメラを起動中...</p>
      )}

      {status === 'error' && (
        <>
          <p style={errorStyle}>{error}</p>
          <button style={buttonStyle} onClick={onStart}>
            リトライ
          </button>
        </>
      )}
    </div>
  )
}
