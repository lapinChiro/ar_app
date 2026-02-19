import { Canvas } from '@react-three/fiber'
import { Lighting } from './Lighting'
import { FishSchool } from './FishSchool'

const FISH_COUNT = 8

export function ARCanvas() {
  return (
    <Canvas
      gl={{
        alpha: true,
        antialias: false,
        stencil: false,
        depth: true,
        powerPreference: 'default',
      }}
      dpr={[1, 2]}
      camera={{
        fov: 60,
        near: 0.1,
        far: 100,
        position: [0, 0, 5],
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1,
        background: 'transparent',
        touchAction: 'none',
      }}
    >
      <Lighting />
      <FishSchool count={FISH_COUNT} />
    </Canvas>
  )
}
