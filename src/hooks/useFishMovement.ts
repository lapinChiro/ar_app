import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

export interface FishState {
  position: [number, number, number]
  velocity: [number, number, number]
}

const BOUNDS = {
  x: [-3, 3] as const,
  y: [-2, 2] as const,
  z: [-2, 2] as const,
}

const MIN_SPEED = 0.3
const MAX_SPEED = 1.2

const SEPARATION_RADIUS = 0.8
const ALIGNMENT_RADIUS = 2.0
const COHESION_RADIUS = 2.5

const SEPARATION_WEIGHT = 0.05
const ALIGNMENT_WEIGHT = 0.02
const COHESION_WEIGHT = 0.01

const BOUNDARY_WEIGHT = 0.1
const BOUNDARY_MARGIN = 0.5

function initializeFish(count: number): FishState[] {
  return Array.from({ length: count }, () => ({
    position: [
      (Math.random() - 0.5) * 4,
      (Math.random() - 0.5) * 3,
      (Math.random() - 0.5) * 3,
    ] as [number, number, number],
    velocity: [
      (Math.random() - 0.5) * 0.6,
      (Math.random() - 0.5) * 0.3,
      (Math.random() - 0.5) * 0.3,
    ] as [number, number, number],
  }))
}

function distance(a: [number, number, number], b: [number, number, number]): number {
  const dx = a[0] - b[0]
  const dy = a[1] - b[1]
  const dz = a[2] - b[2]
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

function clampSpeed(velocity: [number, number, number]): void {
  const speed = Math.sqrt(
    velocity[0] * velocity[0] +
    velocity[1] * velocity[1] +
    velocity[2] * velocity[2],
  )
  if (speed < 0.001) {
    velocity[0] = MIN_SPEED
    return
  }
  if (speed > MAX_SPEED) {
    const factor = MAX_SPEED / speed
    velocity[0] *= factor
    velocity[1] *= factor
    velocity[2] *= factor
  } else if (speed < MIN_SPEED) {
    const factor = MIN_SPEED / speed
    velocity[0] *= factor
    velocity[1] *= factor
    velocity[2] *= factor
  }
}

export function useFishMovement(count: number): FishState[] {
  const fishRef = useRef<FishState[]>(initializeFish(count))

  useFrame((_, delta) => {
    // タブ非アクティブ復帰時の大きな delta をスキップ
    if (delta > 0.1) return

    const fish = fishRef.current

    for (let i = 0; i < fish.length; i++) {
      const current = fish[i]
      const ax = { separation: 0, alignment: 0, cohesion: 0 }
      const ay = { separation: 0, alignment: 0, cohesion: 0 }
      const az = { separation: 0, alignment: 0, cohesion: 0 }

      let alignCount = 0
      let cohesionCount = 0
      let cohesionCenterX = 0
      let cohesionCenterY = 0
      let cohesionCenterZ = 0

      for (let j = 0; j < fish.length; j++) {
        if (i === j) continue
        const other = fish[j]
        const dist = distance(current.position, other.position)

        // 分離
        if (dist < SEPARATION_RADIUS && dist > 0.001) {
          const factor = 1 / (dist * dist)
          ax.separation += (current.position[0] - other.position[0]) * factor
          ay.separation += (current.position[1] - other.position[1]) * factor
          az.separation += (current.position[2] - other.position[2]) * factor
        }

        // 整列
        if (dist < ALIGNMENT_RADIUS) {
          ax.alignment += other.velocity[0]
          ay.alignment += other.velocity[1]
          az.alignment += other.velocity[2]
          alignCount++
        }

        // 結合
        if (dist < COHESION_RADIUS) {
          cohesionCenterX += other.position[0]
          cohesionCenterY += other.position[1]
          cohesionCenterZ += other.position[2]
          cohesionCount++
        }
      }

      // 加速度の計算
      let accX = ax.separation * SEPARATION_WEIGHT
      let accY = ay.separation * SEPARATION_WEIGHT
      let accZ = az.separation * SEPARATION_WEIGHT

      if (alignCount > 0) {
        accX += (ax.alignment / alignCount - current.velocity[0]) * ALIGNMENT_WEIGHT
        accY += (ay.alignment / alignCount - current.velocity[1]) * ALIGNMENT_WEIGHT
        accZ += (az.alignment / alignCount - current.velocity[2]) * ALIGNMENT_WEIGHT
      }

      if (cohesionCount > 0) {
        accX += (cohesionCenterX / cohesionCount - current.position[0]) * COHESION_WEIGHT
        accY += (cohesionCenterY / cohesionCount - current.position[1]) * COHESION_WEIGHT
        accZ += (cohesionCenterZ / cohesionCount - current.position[2]) * COHESION_WEIGHT
      }

      // 境界反発
      const pos = current.position
      if (pos[0] > BOUNDS.x[1] - BOUNDARY_MARGIN) {
        accX -= (pos[0] - (BOUNDS.x[1] - BOUNDARY_MARGIN)) * BOUNDARY_WEIGHT
      } else if (pos[0] < BOUNDS.x[0] + BOUNDARY_MARGIN) {
        accX -= (pos[0] - (BOUNDS.x[0] + BOUNDARY_MARGIN)) * BOUNDARY_WEIGHT
      }
      if (pos[1] > BOUNDS.y[1] - BOUNDARY_MARGIN) {
        accY -= (pos[1] - (BOUNDS.y[1] - BOUNDARY_MARGIN)) * BOUNDARY_WEIGHT
      } else if (pos[1] < BOUNDS.y[0] + BOUNDARY_MARGIN) {
        accY -= (pos[1] - (BOUNDS.y[0] + BOUNDARY_MARGIN)) * BOUNDARY_WEIGHT
      }
      if (pos[2] > BOUNDS.z[1] - BOUNDARY_MARGIN) {
        accZ -= (pos[2] - (BOUNDS.z[1] - BOUNDARY_MARGIN)) * BOUNDARY_WEIGHT
      } else if (pos[2] < BOUNDS.z[0] + BOUNDARY_MARGIN) {
        accZ -= (pos[2] - (BOUNDS.z[0] + BOUNDARY_MARGIN)) * BOUNDARY_WEIGHT
      }

      // 速度更新
      current.velocity[0] += accX
      current.velocity[1] += accY
      current.velocity[2] += accZ

      // 速度クランプ
      clampSpeed(current.velocity)

      // 位置更新
      current.position[0] += current.velocity[0] * delta
      current.position[1] += current.velocity[1] * delta
      current.position[2] += current.velocity[2] * delta
    }
  })

  return fishRef.current
}
