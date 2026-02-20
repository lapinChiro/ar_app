import { useState, useCallback, useEffect, useRef } from 'react'
import { recenterOrientation } from './useDeviceOrientation'

export type ARMode = 'webxr' | 'orientation' | 'overlay'

export type ARState =
  | { status: 'idle' }
  | { status: 'requesting' }
  | { status: 'active'; mode: ARMode; stream: MediaStream | null }
  | { status: 'error'; error: string }

export interface UseARModeReturn {
  state: ARState
  start: () => Promise<void>
  recenter: () => void
  handleXRSessionEnd: () => void
  handleFallbackToOverlay: () => void
}

const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
  audio: false,
}

async function detectARMode(): Promise<ARMode> {
  if (navigator.xr) {
    try {
      const supported = await navigator.xr.isSessionSupported('immersive-ar')
      if (supported) return 'webxr'
    } catch {
      // immersive-ar 非対応
    }
  }

  if (typeof DeviceOrientationEvent !== 'undefined') {
    return 'orientation'
  }

  return 'overlay'
}

async function requestOrientationPermission(): Promise<boolean> {
  const DOE = DeviceOrientationEvent as unknown as {
    requestPermission?: () => Promise<'granted' | 'denied' | 'default'>
  }
  if (typeof DOE.requestPermission === 'function') {
    try {
      const result = await DOE.requestPermission()
      return result === 'granted'
    } catch {
      return false
    }
  }
  return true
}

export function useARMode(): UseARModeReturn {
  const [state, setState] = useState<ARState>({ status: 'idle' })
  const streamRef = useRef<MediaStream | null>(null)

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  const acquireCamera = useCallback(async (): Promise<MediaStream> => {
    stopStream()
    const stream =
      await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS)
    streamRef.current = stream
    return stream
  }, [stopStream])

  const start = useCallback(async () => {
    setState({ status: 'requesting' })

    try {
      const mode = await detectARMode()

      if (mode === 'webxr') {
        setState({ status: 'active', mode: 'webxr', stream: null })
        return
      }

      const stream = await acquireCamera()

      if (mode === 'orientation') {
        const granted = await requestOrientationPermission()
        if (granted) {
          setState({ status: 'active', mode: 'orientation', stream })
        } else {
          setState({ status: 'active', mode: 'overlay', stream })
        }
        return
      }

      setState({ status: 'active', mode: 'overlay', stream })
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'カメラへのアクセスが拒否されました。ブラウザの設定から許可してください。'
          : 'カメラの起動に失敗しました。'
      setState({ status: 'error', error: message })
    }
  }, [acquireCamera])

  const recenter = useCallback(() => {
    recenterOrientation()
  }, [])

  const handleXRSessionEnd = useCallback(async () => {
    try {
      const stream = await acquireCamera()
      const granted = await requestOrientationPermission()
      if (granted && typeof DeviceOrientationEvent !== 'undefined') {
        setState({ status: 'active', mode: 'orientation', stream })
      } else {
        setState({ status: 'active', mode: 'overlay', stream })
      }
    } catch {
      setState({
        status: 'error',
        error: 'カメラの起動に失敗しました。',
      })
    }
  }, [acquireCamera])

  const handleFallbackToOverlay = useCallback(() => {
    setState((prev) => {
      if (prev.status === 'active') {
        return { ...prev, mode: 'overlay' as const }
      }
      return prev
    })
  }, [])

  // バックグラウンド復帰時のストリーム再取得
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && streamRef.current) {
        const allAlive = streamRef.current
          .getTracks()
          .every((t) => t.readyState === 'live')
        if (!allAlive) {
          acquireCamera()
            .then((stream) => {
              setState((prev) => {
                if (prev.status === 'active') {
                  return { ...prev, stream }
                }
                return prev
              })
            })
            .catch(() => {})
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [acquireCamera])

  useEffect(() => {
    return () => stopStream()
  }, [stopStream])

  return {
    state,
    start,
    recenter,
    handleXRSessionEnd,
    handleFallbackToOverlay,
  }
}
