import type { CSSProperties } from 'react'

interface StartScreenProps {
  status: 'idle' | 'requesting' | 'error'
  error?: string
  onStart: (mode?: 'mindar' | 'standard') => void
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

const buttonGroupStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
  alignItems: 'center',
}

const secondaryButtonStyle: CSSProperties = {
  padding: '1rem 2rem',
  fontSize: '1rem',
  border: '1px solid rgba(255, 255, 255, 0.4)',
  borderRadius: '0.5rem',
  background: 'transparent',
  color: '#fff',
  cursor: 'pointer',
  touchAction: 'manipulation',
}

const descriptionStyle: CSSProperties = {
  fontSize: '0.75rem',
  color: '#94a3b8',
  marginTop: '0.25rem',
}

export function StartScreen({ status, error, onStart }: StartScreenProps) {
  return (
    <div style={containerStyle}>
      <h1 style={titleStyle}>AR Fish</h1>

      {status === 'idle' && (
        <div style={buttonGroupStyle}>
          <div style={{ textAlign: 'center' }}>
            <button style={buttonStyle} onClick={() => onStart('mindar')}>
              画像AR（マーカーを使う）
            </button>
            <p style={descriptionStyle}>印刷したマーカー画像が必要です</p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <button style={secondaryButtonStyle} onClick={() => onStart('standard')}>
              フリーAR（ジャイロ）
            </button>
            <p style={descriptionStyle}>マーカー不要・見回すAR体験</p>
          </div>
        </div>
      )}

      {status === 'requesting' && (
        <p style={loadingStyle}>カメラを起動中...</p>
      )}

      {status === 'error' && (
        <>
          <p style={errorStyle}>{error}</p>
          <button style={buttonStyle} onClick={() => onStart('standard')}>
            リトライ
          </button>
        </>
      )}
    </div>
  )
}
