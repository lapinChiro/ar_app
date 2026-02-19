import { useEffect, useRef } from 'react'

interface CameraBackgroundProps {
  stream: MediaStream
}

export function CameraBackground({ stream }: CameraBackgroundProps) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.srcObject = stream
    video.play().catch(() => {
      // autoplay失敗時は無視（ユーザー操作後なので通常は成功する）
    })
  }, [stream])

  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        zIndex: 0,
      }}
    />
  )
}
