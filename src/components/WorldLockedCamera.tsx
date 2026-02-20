import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Quaternion } from 'three'
import { useDeviceOrientation } from '../hooks/useDeviceOrientation'

const SLERP_FACTOR = 0.6
const GYRO_TIMEOUT_MS = 1000
const _targetQ = new Quaternion()

interface WorldLockedCameraProps {
  onFallbackToOverlay: () => void
}

export function WorldLockedCamera({
  onFallbackToOverlay,
}: WorldLockedCameraProps) {
  const { camera } = useThree()
  const { quaternion: deviceQ, hasData } = useDeviceOrientation()
  const mountTimeRef = useRef(Date.now())
  const fallbackCalledRef = useRef(false)
  const positionSetRef = useRef(false)

  useFrame(() => {
    // 初回のみカメラ位置をリセット
    if (!positionSetRef.current) {
      camera.position.set(0, 0, 0)
      positionSetRef.current = true
    }

    if (!hasData) {
      if (
        !fallbackCalledRef.current &&
        Date.now() - mountTimeRef.current > GYRO_TIMEOUT_MS
      ) {
        fallbackCalledRef.current = true
        onFallbackToOverlay()
      }
      return
    }

    _targetQ.copy(deviceQ)
    camera.quaternion.slerp(_targetQ, SLERP_FACTOR)
  })

  return null
}
