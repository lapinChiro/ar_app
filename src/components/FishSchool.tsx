import { useMemo } from 'react'
import { Fish } from './Fish'
import { useFishMovement } from '../hooks/useFishMovement'

interface FishSchoolProps {
  count: number
  worldLocked?: boolean
}

const FISH_COLORS = ['#4fc3f7', '#81d4fa', '#e91e63', '#ff9800']

export function FishSchool({ count, worldLocked = false }: FishSchoolProps) {
  const fishStates = useFishMovement(count, worldLocked)

  const fishAttributes = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        color: FISH_COLORS[Math.floor(Math.random() * FISH_COLORS.length)],
        scale: 0.25 + Math.random() * 0.15,
      })),
    [count],
  )

  return (
    <group>
      {fishStates.map((fish, i) => (
        <Fish
          key={i}
          position={fish.position}
          velocity={fish.velocity}
          color={fishAttributes[i].color}
          scale={fishAttributes[i].scale}
        />
      ))}
    </group>
  )
}
