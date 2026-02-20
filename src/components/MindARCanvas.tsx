import { useRef, useEffect, useState, useCallback } from 'react'
import type { CSSProperties } from 'react'
import * as THREE from 'three'
import { MindARThree } from 'mind-ar/dist/mindar-image-three.prod.js'
import { TargetGuide } from './TargetGuide'

// ============================================================
// 定数
// ============================================================

const FISH_COUNT = 8
const FISH_COLORS = ['#4fc3f7', '#81d4fa', '#e91e63', '#ff9800']

// MindAR モード用の Boid 境界（ターゲット画像に対する相対座標）
// ターゲット画像の中心が原点。1 ≒ ターゲット画像の幅
const BOUNDS = {
  x: [-0.6, 0.6] as const,
  y: [-0.1, 0.5] as const, // 画像の上方向に多めに確保
  z: [-0.4, 0.1] as const, // カメラ側（負のZ）に魚を配置
}

const MIN_SPEED = 0.08
const MAX_SPEED = 0.3

const SEPARATION_RADIUS = 0.15
const ALIGNMENT_RADIUS = 0.4
const COHESION_RADIUS = 0.5

const SEPARATION_WEIGHT = 0.05
const ALIGNMENT_WEIGHT = 0.02
const COHESION_WEIGHT = 0.01
const BOUNDARY_WEIGHT = 0.1
const BOUNDARY_MARGIN = 0.1

// ============================================================
// 型
// ============================================================

interface FishState {
  position: [number, number, number]
  velocity: [number, number, number]
}

// ============================================================
// 魚メッシュ生成
// ============================================================

function createFishMesh(color: string, scale: number): THREE.Group {
  const group = new THREE.Group()
  group.scale.setScalar(scale)

  const mat = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.3,
    roughness: 0.4,
  })

  // 胴体
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), mat)
  body.scale.set(1.6, 0.6, 0.5)
  group.add(body)

  // 尾びれ
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.8, 4), mat)
  tail.position.set(-1.2, 0, 0)
  tail.rotation.set(0, 0, Math.PI / 2)
  tail.name = 'tail'
  group.add(tail)

  // 背びれ
  const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.4, 4), mat)
  dorsal.position.set(0.2, 0.45, 0)
  group.add(dorsal)

  // 胸びれ（左）
  const leftFin = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 4), mat)
  leftFin.position.set(0.3, -0.1, 0.35)
  leftFin.rotation.set(0.3, 0, 0.5)
  group.add(leftFin)

  // 胸びれ（右）
  const rightFin = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 4), mat)
  rightFin.position.set(0.3, -0.1, -0.35)
  rightFin.rotation.set(-0.3, 0, 0.5)
  group.add(rightFin)

  return group
}

// ============================================================
// Boid シミュレーション
// ============================================================

function initializeFish(count: number): FishState[] {
  return Array.from({ length: count }, () => ({
    position: [
      (Math.random() - 0.5) * 0.8,
      Math.random() * 0.3 + 0.05,
      -(Math.random() * 0.3 + 0.05),
    ] as [number, number, number],
    velocity: [
      (Math.random() - 0.5) * 0.1,
      (Math.random() - 0.5) * 0.05,
      (Math.random() - 0.5) * 0.05,
    ] as [number, number, number],
  }))
}

function fishDist(
  a: [number, number, number],
  b: [number, number, number],
): number {
  const dx = a[0] - b[0]
  const dy = a[1] - b[1]
  const dz = a[2] - b[2]
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

function clampSpeed(v: [number, number, number]): void {
  const speed = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])
  if (speed < 0.001) {
    v[0] = MIN_SPEED
    return
  }
  const target =
    speed > MAX_SPEED ? MAX_SPEED : speed < MIN_SPEED ? MIN_SPEED : speed
  if (target !== speed) {
    const f = target / speed
    v[0] *= f
    v[1] *= f
    v[2] *= f
  }
}

function updateBoids(fish: FishState[], delta: number): void {
  for (let i = 0; i < fish.length; i++) {
    const cur = fish[i]
    let sepX = 0,
      sepY = 0,
      sepZ = 0
    let aliX = 0,
      aliY = 0,
      aliZ = 0
    let cohX = 0,
      cohY = 0,
      cohZ = 0
    let aliCount = 0,
      cohCount = 0

    for (let j = 0; j < fish.length; j++) {
      if (i === j) continue
      const other = fish[j]
      const d = fishDist(cur.position, other.position)

      if (d < SEPARATION_RADIUS && d > 0.001) {
        const f = 1 / (d * d)
        sepX += (cur.position[0] - other.position[0]) * f
        sepY += (cur.position[1] - other.position[1]) * f
        sepZ += (cur.position[2] - other.position[2]) * f
      }
      if (d < ALIGNMENT_RADIUS) {
        aliX += other.velocity[0]
        aliY += other.velocity[1]
        aliZ += other.velocity[2]
        aliCount++
      }
      if (d < COHESION_RADIUS) {
        cohX += other.position[0]
        cohY += other.position[1]
        cohZ += other.position[2]
        cohCount++
      }
    }

    let ax = sepX * SEPARATION_WEIGHT
    let ay = sepY * SEPARATION_WEIGHT
    let az = sepZ * SEPARATION_WEIGHT

    if (aliCount > 0) {
      ax += (aliX / aliCount - cur.velocity[0]) * ALIGNMENT_WEIGHT
      ay += (aliY / aliCount - cur.velocity[1]) * ALIGNMENT_WEIGHT
      az += (aliZ / aliCount - cur.velocity[2]) * ALIGNMENT_WEIGHT
    }
    if (cohCount > 0) {
      ax += (cohX / cohCount - cur.position[0]) * COHESION_WEIGHT
      ay += (cohY / cohCount - cur.position[1]) * COHESION_WEIGHT
      az += (cohZ / cohCount - cur.position[2]) * COHESION_WEIGHT
    }

    // 境界反発
    const p = cur.position
    const boundsAxes = [BOUNDS.x, BOUNDS.y, BOUNDS.z] as const
    const accs = [ax, ay, az]
    for (let axis = 0; axis < 3; axis++) {
      const [lo, hi] = boundsAxes[axis]
      if (p[axis] > hi - BOUNDARY_MARGIN) {
        accs[axis] -= (p[axis] - (hi - BOUNDARY_MARGIN)) * BOUNDARY_WEIGHT
      } else if (p[axis] < lo + BOUNDARY_MARGIN) {
        accs[axis] -= (p[axis] - (lo + BOUNDARY_MARGIN)) * BOUNDARY_WEIGHT
      }
    }
    ax = accs[0]
    ay = accs[1]
    az = accs[2]

    cur.velocity[0] += ax
    cur.velocity[1] += ay
    cur.velocity[2] += az
    clampSpeed(cur.velocity)

    cur.position[0] += cur.velocity[0] * delta
    cur.position[1] += cur.velocity[1] * delta
    cur.position[2] += cur.velocity[2] * delta
  }
}

// ============================================================
// 魚メッシュの更新（位置・回転・尾びれアニメーション）
// ============================================================

function updateFishMeshes(
  meshes: THREE.Group[],
  states: FishState[],
  elapsedTime: number,
): void {
  for (let i = 0; i < meshes.length; i++) {
    const mesh = meshes[i]
    const state = states[i]
    const [px, py, pz] = state.position
    const [vx, vy, vz] = state.velocity

    mesh.position.set(px, py, pz)

    // 進行方向の回転
    const hSpeed = Math.sqrt(vx * vx + vz * vz)
    mesh.rotation.y = -Math.atan2(vz, vx)
    const pitch = Math.atan2(vy, hSpeed)
    mesh.rotation.z = -pitch * 0.3 + Math.sin(elapsedTime * 4) * 0.05

    // 尾びれアニメーション
    const tail = mesh.getObjectByName('tail') as THREE.Mesh | undefined
    if (tail) {
      tail.rotation.y = Math.sin(elapsedTime * 6 + i) * 0.4
    }
  }
}

// ============================================================
// スタイル
// ============================================================

const containerStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1,
}

const backButtonStyle: CSSProperties = {
  position: 'fixed',
  top: '1rem',
  left: '1rem',
  padding: '0.5rem 1rem',
  background: 'rgba(0, 0, 0, 0.5)',
  color: '#fff',
  border: '1px solid rgba(255, 255, 255, 0.3)',
  borderRadius: '0.5rem',
  fontSize: '0.85rem',
  zIndex: 3,
  cursor: 'pointer',
  touchAction: 'manipulation',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
}

// ============================================================
// コンポーネント
// ============================================================

interface MindARCanvasProps {
  onBack: () => void
}

export function MindARCanvas({ onBack }: MindARCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [targetFound, setTargetFound] = useState(false)
  const mindarRef = useRef<InstanceType<typeof MindARThree> | null>(null)

  // コールバック ref（MindAR のコールバックが古いクロージャを参照する問題を回避）
  const setTargetFoundRef = useRef(setTargetFound)
  setTargetFoundRef.current = setTargetFound

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let cancelled = false

    const setup = async () => {
      const mindarThree = new MindARThree({
        container,
        imageTargetSrc: `${import.meta.env.BASE_URL}targets.mind`,
        filterMinCF: 0.0001,
        filterBeta: 1000,
        warmupTolerance: 5,
        missTolerance: 5,
        maxTrack: 1,
      })
      mindarRef.current = mindarThree

      const { renderer, scene, camera } = mindarThree

      // ---- ライティング ----
      scene.add(new THREE.AmbientLight(0xffffff, 0.6))
      const dirLight = new THREE.DirectionalLight(0xffffff, 0.8)
      dirLight.position.set(5, 5, 5)
      scene.add(dirLight)

      // ---- アンカー ----
      const anchor = mindarThree.addAnchor(0)

      // ---- 魚の生成 ----
      const fishStates = initializeFish(FISH_COUNT)
      const fishMeshes = fishStates.map((_, i) => {
        const color = FISH_COLORS[i % FISH_COLORS.length]
        const scale = 0.05 + Math.random() * 0.03
        return createFishMesh(color, scale)
      })
      fishMeshes.forEach((m) => anchor.group.add(m))

      // ---- アンカーイベント ----
      anchor.onTargetFound = () => {
        if (!cancelled) setTargetFoundRef.current(true)
      }
      anchor.onTargetLost = () => {
        if (!cancelled) setTargetFoundRef.current(false)
      }

      // ---- 開始 ----
      if (cancelled) return
      await mindarThree.start()
      if (cancelled) {
        mindarThree.stop()
        return
      }

      // ---- アニメーションループ ----
      let lastTime = performance.now()

      renderer.setAnimationLoop(() => {
        const now = performance.now()
        const delta = (now - lastTime) / 1000
        lastTime = now

        // 大きな delta をスキップ（タブ非アクティブ復帰時）
        if (delta < 0.1) {
          updateBoids(fishStates, delta)
          updateFishMeshes(fishMeshes, fishStates, now / 1000)
        }

        renderer.render(scene, camera)
      })
    }

    setup().catch((err) => {
      console.error('MindAR setup failed:', err)
    })

    return () => {
      cancelled = true
      if (mindarRef.current) {
        mindarRef.current.renderer.setAnimationLoop(null)
        mindarRef.current.stop()
        mindarRef.current = null
      }
    }
  }, [])

  const handleBack = useCallback(() => {
    if (mindarRef.current) {
      mindarRef.current.renderer.setAnimationLoop(null)
      mindarRef.current.stop()
      mindarRef.current = null
    }
    onBack()
  }, [onBack])

  return (
    <>
      <div ref={containerRef} style={containerStyle} />
      {!targetFound && <TargetGuide />}
      <button style={backButtonStyle} onClick={handleBack}>
        ← 戻る
      </button>
    </>
  )
}
