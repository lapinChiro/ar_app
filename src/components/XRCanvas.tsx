import { useRef, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { createXRStore, XR } from '@react-three/xr'
import { Lighting } from './Lighting'
import { FishSchool } from './FishSchool'

const FISH_COUNT = 8

interface XRCanvasProps {
  onSessionEnd: () => void
}

export function XRCanvas({ onSessionEnd }: XRCanvasProps) {
  const storeRef = useRef(createXRStore({ emulate: false }))
  const onSessionEndRef = useRef(onSessionEnd)
  onSessionEndRef.current = onSessionEnd

  useEffect(() => {
    const store = storeRef.current

    // Canvas 初期化後に AR セッション開始
    const timer = setTimeout(() => {
      store.enterAR()
    }, 100)

    // セッション終了を監視
    let prevSession = store.getState().session
    const unsub = store.subscribe((state) => {
      if (prevSession && !state.session) {
        onSessionEndRef.current()
      }
      prevSession = state.session
    })

    return () => {
      clearTimeout(timer)
      unsub()
    }
  }, [])

  return (
    <Canvas
      gl={{
        antialias: false,
        stencil: false,
        depth: true,
        powerPreference: 'default',
      }}
      dpr={[1, 2]}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1,
        touchAction: 'none',
      }}
    >
      <XR store={storeRef.current}>
        <Lighting />
        <FishSchool count={FISH_COUNT} worldLocked />
      </XR>
    </Canvas>
  )
}
