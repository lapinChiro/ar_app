import { Canvas } from '@react-three/fiber'
import { Lighting } from './Lighting'
import { FishSchool } from './FishSchool'
import { WorldLockedCamera } from './WorldLockedCamera'

const FISH_COUNT = 8

interface ARCanvasProps {
  worldLocked: boolean
  onFallbackToOverlay: () => void
}

export function ARCanvas({ worldLocked, onFallbackToOverlay }: ARCanvasProps) {
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
        position: worldLocked ? [0, 0, 0] : [0, 0, 5],
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1,
        background: 'transparent',
        touchAction: 'none',
      }}
    >
      {worldLocked && (
        <WorldLockedCamera onFallbackToOverlay={onFallbackToOverlay} />
      )}
      <Lighting />
      <FishSchool count={FISH_COUNT} worldLocked={worldLocked} />
    </Canvas>
  )
}
