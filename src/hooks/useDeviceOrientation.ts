import { useRef, useEffect } from 'react'
import { Quaternion, Euler, MathUtils, Vector3 } from 'three'

// 事前計算定数
const Z_AXIS = new Vector3(0, 0, 1)
const Q_SCREEN_TRANSFORM = new Quaternion(
  -Math.sqrt(0.5),
  0,
  0,
  Math.sqrt(0.5),
) // -90° X軸回転: デバイス座標系(Z上向き)→Three.js座標系(Y上向き)

// 作業用オブジェクト（毎フレームのアロケーション回避）
const _euler = new Euler()
const _q0 = new Quaternion()

// モジュールレベル状態（Canvas境界を越えて recenter を呼べるようにする）
let _alphaOffset: number | null = null
let _latestAlpha = 0
let _hasData = false
const _quaternion = new Quaternion()

function getScreenOrientation(): number {
  if (screen.orientation && typeof screen.orientation.angle === 'number') {
    return screen.orientation.angle
  }
  return 0
}

function setQuaternionFromOrientation(
  target: Quaternion,
  alpha: number,
  beta: number,
  gamma: number,
  screenOrientation: number,
): void {
  const alphaRad = MathUtils.degToRad(alpha)
  const betaRad = MathUtils.degToRad(beta)
  const gammaRad = MathUtils.degToRad(gamma)
  const orientRad = MathUtils.degToRad(screenOrientation)

  // デバイスのオイラー角 → クォータニオン ('YXZ' 順)
  _euler.set(betaRad, alphaRad, -gammaRad, 'YXZ')
  target.setFromEuler(_euler)

  // スマホを垂直に持った状態を「正面を向いている」に変換
  target.multiply(Q_SCREEN_TRANSFORM)

  // 画面回転補正
  target.multiply(_q0.setFromAxisAngle(Z_AXIS, -orientRad))
}

/** Canvas外から呼べるリセンター関数 */
export function recenterOrientation(): void {
  _alphaOffset = _latestAlpha
}

export interface UseDeviceOrientationReturn {
  quaternion: Quaternion
  hasData: boolean
}

export function useDeviceOrientation(): UseDeviceOrientationReturn {
  const initializedRef = useRef(false)

  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true

    // 状態リセット（コンポーネント再マウント対策）
    _alphaOffset = null
    _hasData = false

    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (
        event.alpha == null ||
        event.beta == null ||
        event.gamma == null
      ) {
        return
      }

      _hasData = true
      _latestAlpha = event.alpha

      // 初回データ受信時に自動リセンター
      if (_alphaOffset === null) {
        _alphaOffset = event.alpha
      }

      const alpha = event.alpha - (_alphaOffset ?? 0)

      setQuaternionFromOrientation(
        _quaternion,
        alpha,
        event.beta,
        event.gamma,
        getScreenOrientation(),
      )
    }

    window.addEventListener('deviceorientation', handleOrientation)
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation)
    }
  }, [])

  return {
    quaternion: _quaternion,
    hasData: _hasData,
  }
}
