import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

interface FishProps {
  position: [number, number, number]
  velocity: [number, number, number]
  color: string
  scale?: number
}

export function Fish({ position, velocity, color, scale = 0.3 }: FishProps) {
  const groupRef = useRef<THREE.Group>(null)
  const tailRef = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    const group = groupRef.current
    const tail = tailRef.current
    if (!group || !tail) return

    const t = clock.getElapsedTime()

    // 位置の更新
    group.position.set(position[0], position[1], position[2])

    // velocity → 進行方向の回転
    const vx = velocity[0]
    const vy = velocity[1]
    const vz = velocity[2]
    const horizontalSpeed = Math.sqrt(vx * vx + vz * vz)

    // Y軸回転（左右の向き）: X+ を正面として atan2 で角度を求める
    group.rotation.y = -Math.atan2(vz, vx)

    // Z軸回転（上下の傾き）
    const pitch = Math.atan2(vy, horizontalSpeed)
    group.rotation.z = -pitch * 0.3

    // 胴体の微揺れ
    group.rotation.z += Math.sin(t * 4) * 0.05

    // 尾びれのアニメーション
    tail.rotation.y = Math.sin(t * 6) * 0.4
  })

  return (
    <group ref={groupRef} scale={scale}>
      {/* 胴体 */}
      <mesh scale={[1.6, 0.6, 0.5]}>
        <sphereGeometry args={[1, 12, 8]} />
        <meshStandardMaterial color={color} metalness={0.3} roughness={0.4} />
      </mesh>

      {/* 尾びれ */}
      <mesh
        ref={tailRef}
        position={[-1.2, 0, 0]}
        rotation={[0, 0, Math.PI / 2]}
      >
        <coneGeometry args={[0.4, 0.8, 4]} />
        <meshStandardMaterial color={color} metalness={0.3} roughness={0.4} />
      </mesh>

      {/* 背びれ */}
      <mesh position={[0.2, 0.45, 0]}>
        <coneGeometry args={[0.15, 0.4, 4]} />
        <meshStandardMaterial color={color} metalness={0.3} roughness={0.4} />
      </mesh>

      {/* 胸びれ（左） */}
      <mesh
        position={[0.3, -0.1, 0.35]}
        rotation={[0.3, 0, 0.5]}
      >
        <coneGeometry args={[0.1, 0.3, 4]} />
        <meshStandardMaterial color={color} metalness={0.3} roughness={0.4} />
      </mesh>

      {/* 胸びれ（右） */}
      <mesh
        position={[0.3, -0.1, -0.35]}
        rotation={[-0.3, 0, 0.5]}
      >
        <coneGeometry args={[0.1, 0.3, 4]} />
        <meshStandardMaterial color={color} metalness={0.3} roughness={0.4} />
      </mesh>
    </group>
  )
}
