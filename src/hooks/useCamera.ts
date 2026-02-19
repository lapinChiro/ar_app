import { useState, useCallback, useEffect, useRef } from 'react'

export type CameraState =
  | { status: 'idle' }
  | { status: 'requesting' }
  | { status: 'active'; stream: MediaStream }
  | { status: 'error'; error: string }

export interface UseCameraReturn {
  state: CameraState
  start: () => Promise<void>
  stop: () => void
}

const CONSTRAINTS: MediaStreamConstraints = {
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
  audio: false,
}

export function useCamera(): UseCameraReturn {
  const [state, setState] = useState<CameraState>({ status: 'idle' })
  const streamRef = useRef<MediaStream | null>(null)

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  const start = useCallback(async () => {
    setState({ status: 'requesting' })
    try {
      stopStream()
      const stream = await navigator.mediaDevices.getUserMedia(CONSTRAINTS)
      streamRef.current = stream
      setState({ status: 'active', stream })
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'カメラへのアクセスが拒否されました。ブラウザの設定から許可してください。'
          : 'カメラの起動に失敗しました。'
      setState({ status: 'error', error: message })
    }
  }, [stopStream])

  const stop = useCallback(() => {
    stopStream()
    setState({ status: 'idle' })
  }, [stopStream])

  // バックグラウンド復帰時のストリーム再取得
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && streamRef.current) {
        const allAlive = streamRef.current
          .getTracks()
          .every((t) => t.readyState === 'live')
        if (!allAlive) {
          start()
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [start])

  // アンマウント時にストリームを停止
  useEffect(() => {
    return () => stopStream()
  }, [stopStream])

  return { state, start, stop }
}
