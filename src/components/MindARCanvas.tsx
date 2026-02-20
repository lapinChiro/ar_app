import { useRef, useEffect, useState, useCallback } from 'react'
import type { CSSProperties } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
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

// 海藻
const SEAWEED_COUNT = 6
const SEAWEED_COLORS = ['#2d8a4e', '#3cb371', '#228b22', '#1a6b3c']
const SEAWEED_HEIGHT_MIN = 0.15
const SEAWEED_HEIGHT_MAX = 0.35
const SEAWEED_RADIUS = 0.005
const SEAWEED_SWAY_SPEED = 2.0
const SEAWEED_SWAY_AMOUNT = 0.03

// 泡パーティクル
const BUBBLE_COUNT = 200
const BUBBLE_AREA = { x: [-0.5, 0.5], z: [-0.3, 0.1] }
const BUBBLE_Y_MIN = 0.0
const BUBBLE_Y_MAX = 0.6
const BUBBLE_RISE_SPEED = 0.03
const BUBBLE_SIZE = 0.008

// 出現アニメーション
const APPEAR_DURATION = 0.8

// ============================================================
// 型
// ============================================================

interface FishState {
  position: [number, number, number]
  velocity: [number, number, number]
}

interface SeaweedState {
  mesh: THREE.Mesh
  basePositions: Float32Array
  height: number
  phaseOffset: number
}

interface BubbleSystem {
  points: THREE.Points
  velocities: Float32Array
}

interface AppearAnimation {
  active: boolean
  startTime: number
}

// ============================================================
// GLTF 魚モデルロード
// ============================================================

const gltfLoader = new GLTFLoader()

function normalizeModel(model: THREE.Group): void {
  const box = new THREE.Box3().setFromObject(model)
  const size = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z)
  if (maxDim > 0) {
    model.scale.multiplyScalar(1 / maxDim)
  }
  const center = box.getCenter(new THREE.Vector3())
  model.position.sub(center.multiplyScalar(1 / maxDim))
}

// ============================================================
// 魚メッシュ生成（GLTF フォールバック用）
// ============================================================

function createFishMesh(color: string, scale: number): THREE.Group {
  const group = new THREE.Group()
  group.scale.setScalar(scale)

  const mat = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.3,
    roughness: 0.4,
  })

  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), mat)
  body.scale.set(1.6, 0.6, 0.5)
  group.add(body)

  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.8, 4), mat)
  tail.position.set(-1.2, 0, 0)
  tail.rotation.set(0, 0, Math.PI / 2)
  tail.name = 'tail'
  group.add(tail)

  const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.4, 4), mat)
  dorsal.position.set(0.2, 0.45, 0)
  group.add(dorsal)

  const leftFin = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 4), mat)
  leftFin.position.set(0.3, -0.1, 0.35)
  leftFin.rotation.set(0.3, 0, 0.5)
  group.add(leftFin)

  const rightFin = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 4), mat)
  rightFin.position.set(0.3, -0.1, -0.35)
  rightFin.rotation.set(-0.3, 0, 0.5)
  group.add(rightFin)

  return group
}

// ============================================================
// 海藻
// ============================================================

function createSeaweed(
  x: number,
  z: number,
  height: number,
  color: string,
): SeaweedState {
  const points = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.01, height * 0.33, 0),
    new THREE.Vector3(-0.01, height * 0.66, 0),
    new THREE.Vector3(0.005, height, 0),
  ]
  const curve = new THREE.CatmullRomCurve3(points)
  const geometry = new THREE.TubeGeometry(curve, 12, SEAWEED_RADIUS, 5, false)

  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.8,
    metalness: 0.0,
    side: THREE.DoubleSide,
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(x, 0, z)

  const basePositions = new Float32Array(geometry.attributes.position.array)

  return { mesh, basePositions, height, phaseOffset: Math.random() * Math.PI * 2 }
}

function createSeaweeds(): SeaweedState[] {
  const seaweeds: SeaweedState[] = []
  for (let i = 0; i < SEAWEED_COUNT; i++) {
    const angle = (i / SEAWEED_COUNT) * Math.PI * 2
    const radius = 0.35 + Math.random() * 0.15
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius * 0.5 - 0.15
    const height =
      SEAWEED_HEIGHT_MIN + Math.random() * (SEAWEED_HEIGHT_MAX - SEAWEED_HEIGHT_MIN)
    const color = SEAWEED_COLORS[i % SEAWEED_COLORS.length]
    seaweeds.push(createSeaweed(x, z, height, color))
  }
  return seaweeds
}

function updateSeaweeds(seaweeds: SeaweedState[], time: number): void {
  for (const sw of seaweeds) {
    const positions = sw.mesh.geometry.attributes.position
    const base = sw.basePositions
    const maxH = sw.height

    for (let i = 0; i < positions.count; i++) {
      const baseX = base[i * 3]
      const baseY = base[i * 3 + 1]
      const baseZ = base[i * 3 + 2]

      const heightRatio = maxH > 0 ? baseY / maxH : 0
      const sway =
        Math.sin(time * SEAWEED_SWAY_SPEED + sw.phaseOffset + baseY * 8) *
        heightRatio *
        SEAWEED_SWAY_AMOUNT

      positions.setXYZ(i, baseX + sway, baseY, baseZ + sway * 0.3)
    }

    positions.needsUpdate = true
  }
}

// ============================================================
// 泡パーティクル
// ============================================================

function createBubbles(): BubbleSystem {
  const positions = new Float32Array(BUBBLE_COUNT * 3)
  const velocities = new Float32Array(BUBBLE_COUNT)

  for (let i = 0; i < BUBBLE_COUNT; i++) {
    positions[i * 3] =
      BUBBLE_AREA.x[0] + Math.random() * (BUBBLE_AREA.x[1] - BUBBLE_AREA.x[0])
    positions[i * 3 + 1] =
      BUBBLE_Y_MIN + Math.random() * (BUBBLE_Y_MAX - BUBBLE_Y_MIN)
    positions[i * 3 + 2] =
      BUBBLE_AREA.z[0] + Math.random() * (BUBBLE_AREA.z[1] - BUBBLE_AREA.z[0])
    velocities[i] = BUBBLE_RISE_SPEED * (0.5 + Math.random() * 0.5)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

  const material = new THREE.PointsMaterial({
    color: 0xaaddff,
    size: BUBBLE_SIZE,
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })

  return { points: new THREE.Points(geometry, material), velocities }
}

function updateBubbles(bubbles: BubbleSystem, delta: number): void {
  const positions = bubbles.points.geometry.attributes.position
  const arr = positions.array as Float32Array

  for (let i = 0; i < BUBBLE_COUNT; i++) {
    const xi = i * 3
    const yi = i * 3 + 1
    const zi = i * 3 + 2

    arr[yi] += bubbles.velocities[i] * delta
    arr[xi] += Math.sin(arr[yi] * 20 + i) * 0.0002

    if (arr[yi] > BUBBLE_Y_MAX) {
      arr[yi] = BUBBLE_Y_MIN
      arr[xi] =
        BUBBLE_AREA.x[0] + Math.random() * (BUBBLE_AREA.x[1] - BUBBLE_AREA.x[0])
      arr[zi] =
        BUBBLE_AREA.z[0] + Math.random() * (BUBBLE_AREA.z[1] - BUBBLE_AREA.z[0])
    }
  }

  positions.needsUpdate = true
}

// ============================================================
// 出現アニメーション
// ============================================================

function easeOutBack(t: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
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
// 魚メッシュの更新（位置・回転）
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

    // フォールバック魚の尾びれアニメーション
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

      // ---- 魚の生成（GLTF 優先、フォールバックあり） ----
      const fishStates = initializeFish(FISH_COUNT)
      let fishMeshes: THREE.Group[]
      const mixers: THREE.AnimationMixer[] = []

      try {
        const gltf = await new Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }>(
          (resolve, reject) => {
            gltfLoader.load(
              `${import.meta.env.BASE_URL}models/fish.glb`,
              (result) => resolve(result),
              undefined,
              reject,
            )
          },
        )

        const template = gltf.scene
        normalizeModel(template)

        fishMeshes = fishStates.map((_, i) => {
          const scale = 0.05 + Math.random() * 0.03
          const wrapper = new THREE.Group()
          const clone = template.clone()
          clone.scale.multiplyScalar(scale)

          // カラーバリエーション
          const color = new THREE.Color(FISH_COLORS[i % FISH_COLORS.length])
          clone.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material) {
              child.material = (child.material as THREE.MeshStandardMaterial).clone()
              ;(child.material as THREE.MeshStandardMaterial).color = color
            }
          })

          wrapper.add(clone)

          // GLTF アニメーション（泳ぎ等）があれば再生
          if (gltf.animations.length > 0) {
            const mixer = new THREE.AnimationMixer(clone)
            for (const clip of gltf.animations) {
              const action = mixer.clipAction(clip)
              action.play()
            }
            // 各魚のアニメーション位相をずらす
            mixer.setTime(Math.random() * 2)
            mixers.push(mixer)
          }

          return wrapper
        })
      } catch {
        // GLTF ロード失敗 → フォールバック
        console.warn('GLTF fish model failed to load, using fallback primitives')
        fishMeshes = fishStates.map((_, i) => {
          const color = FISH_COLORS[i % FISH_COLORS.length]
          const scale = 0.05 + Math.random() * 0.03
          return createFishMesh(color, scale)
        })
      }

      fishMeshes.forEach((m) => anchor.group.add(m))

      // ---- 海藻の生成 ----
      const seaweeds = createSeaweeds()
      seaweeds.forEach((sw) => anchor.group.add(sw.mesh))

      // ---- 泡パーティクルの生成 ----
      const bubbles = createBubbles()
      anchor.group.add(bubbles.points)

      // ---- 出現アニメーション ----
      anchor.group.scale.setScalar(0)
      const appearAnim: AppearAnimation = { active: false, startTime: 0 }

      // ---- アンカーイベント ----
      anchor.onTargetFound = () => {
        appearAnim.active = true
        appearAnim.startTime = performance.now() / 1000
        if (!cancelled) setTargetFoundRef.current(true)
      }
      anchor.onTargetLost = () => {
        anchor.group.scale.setScalar(0)
        appearAnim.active = false
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
        const elapsed = now / 1000

        // 大きな delta をスキップ（タブ非アクティブ復帰時）
        if (delta < 0.1) {
          // 出現アニメーション
          if (appearAnim.active) {
            const progress = Math.min(
              (elapsed - appearAnim.startTime) / APPEAR_DURATION,
              1,
            )
            anchor.group.scale.setScalar(easeOutBack(progress))
            if (progress >= 1) {
              appearAnim.active = false
            }
          }

          // Boid シミュレーション + 魚メッシュ更新
          updateBoids(fishStates, delta)
          updateFishMeshes(fishMeshes, fishStates, elapsed)

          // GLTF アニメーション更新
          for (const mixer of mixers) {
            mixer.update(delta)
          }

          // 海藻の揺れ更新
          updateSeaweeds(seaweeds, elapsed)

          // 泡パーティクル更新
          updateBubbles(bubbles, delta)
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
