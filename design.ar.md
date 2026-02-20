# MindAR 画像トラッキング AR - 開発用設計書

## 1. 概要・目標

MindAR ライブラリを使い、**印刷した画像ターゲットの上に魚群を表示する**画像トラッキングARモードを追加する。

**ゴール:**
- ユーザーがスマホのカメラをマーカー画像に向けると、画像の上に魚が泳いで見える
- カメラを動かすと、魚はマーカー画像の位置に固定されたまま追従する
- 既存のフリーAR（ジャイロ）モードはそのまま維持する

**既存モードとの違い:**

| 項目 | フリーAR（ジャイロ） | 画像AR（MindAR） |
|---|---|---|
| トラッキング | DeviceOrientationEvent (3DoF) | 画像特徴点マッチング (6DoF) |
| マーカー | 不要 | 印刷画像が必要 |
| 魚の位置 | ワールド空間に固定（回転追跡のみ） | 画像ターゲットに固定 |
| カメラ制御 | 自前(useDeviceOrientation) | MindAR内蔵 |
| カメラ映像 | 自前(\<video\> + getUserMedia) | MindAR内蔵 |

---

## 2. 技術選定

### MindARThree を直接利用する（react-three-mind は使わない）

**理由:**
1. `react-three-mind` (v0.3.0, 51スター) はサードパーティの小規模ライブラリで、本プロジェクトのバージョン構成（React 19, R3F v9, Three.js v0.183）との互換性が未検証
2. MindARThree は MindAR 公式の Three.js 統合 API で、Three.js v137 以上であれば動作保証あり（v0.183 は対応範囲内）
3. MindARThree は内部でカメラ映像取得・表示・トラッキング・レンダリングを一括管理するため、既存の R3F Canvas とは独立した自己完結型コンポーネントとして実装するのが最もシンプル

**結果:** MindAR モード用の `MindARCanvas` コンポーネントは R3F を使わず、素の Three.js + MindARThree で実装する。
魚のジオメトリ生成と Boid シミュレーションのロジックを Three.js 版として新規に書く（既存 R3F コンポーネントは変更しない）。

---

## 3. アプリケーション状態遷移（更新）

```
[idle] ──(ユーザーがボタン押下)──→ [requesting] or [active(mindar)]
                                           │
                               ┌───────────┴───────────┐
                               ↓                       ↓
                           [active]                [error]
                               │                       │
                               │                (ユーザーがリトライ)
                               │                       │
                               ↓                       ↓
                          [requesting] ←───────────────┘
```

**MindAR モードの特殊性:**
- `start('mindar')` が呼ばれると、`requesting` を経由せず直接 `active(mindar)` に遷移する
- MindARThree が内部でカメラの取得・表示を行うため、`useARMode` がカメラストリームを取得する必要がない
- `stream` は `null` になる

**ARMode 型の更新:**
```ts
export type ARMode = 'webxr' | 'orientation' | 'overlay' | 'mindar'
```

---

## 4. コンポーネントツリー

### MindAR モード選択時
```
App
├── MindARCanvas                ... MindARThree で AR 描画
│   ├── <div ref={container}>   ... MindARThree のレンダリング先
│   ├── TargetGuide             ... ターゲット未検出時のガイドUI
│   └── BackButton              ... StartScreenに戻るボタン
│
│   (MindARThree 内部)
│   ├── <video>                 ... カメラ映像（MindAR が自動生成）
│   ├── <canvas>                ... WebGL レンダリング（MindAR が自動生成）
│   └── Scene
│       ├── AmbientLight
│       ├── DirectionalLight
│       └── Anchor (targetIndex: 0)
│           └── FishGroup
│               ├── FishMesh[0]
│               ├── FishMesh[1]
│               └── ...FishMesh[7]
```

### フリーAR モード選択時（既存のまま）
```
App
├── CameraBackground
├── ARCanvas
│   └── <Canvas> (R3F)
│       ├── WorldLockedCamera
│       ├── Lighting
│       └── FishSchool
│           └── Fish × N
└── RecenterButton
```

### データフロー（MindAR モード）
```
App (useARMode)
 │
 ├──→ StartScreen   ... onStart('mindar') or onStart('standard')
 │
 └──→ MindARCanvas (mode === 'mindar')
       │
       ├── MindARThree (内部で camera + tracking + rendering)
       │
       ├── Anchor.onTargetFound → setTargetFound(true)
       ├── Anchor.onTargetLost  → setTargetFound(false)
       │
       ├── fishStates[]  ←── updateBoids() (毎フレーム)
       ├── fishMeshes[]  ←── updateFishMeshes() (毎フレーム)
       │
       └── onBack → useARMode.reset() → idle
```

---

## 5. パッケージ追加

```bash
npm install mind-ar
```

| パッケージ | バージョン | サイズ | 用途 |
|---|---|---|---|
| `mind-ar` | ^1.2.5 | ※CDN利用も可 | 画像トラッキングエンジン |

**import パス:**
```ts
import { MindARThree } from 'mind-ar/dist/mindar-image-three.prod.js'
```

※ Three.js は既存の `three@0.183.0` をそのまま使用（MindAR v1.2.0 以降は Three.js を外部依存として分離済み）

---

## 6. 画像ターゲット準備ワークフロー

### 6.1 ターゲット画像の選定

**要件:**
- 高コントラスト、複雑なテクスチャ、特徴点が均一に分布
- 繰り返しパターン・対称デザイン・大きな空白は避ける
- 推奨解像度: 1000px 以上（幅または高さ）

**本プロジェクト用の推奨案:**
- 水中写真（サンゴ礁、海底）をターゲット画像にする → AR体験のテーマと一致
- または独自のイラスト・ポスターを作成

### 6.2 `.mind` ファイルの生成

1. https://hiukim.github.io/mind-ar-js-doc/tools/compile/ にアクセス
2. ターゲット画像をドラッグ＆ドロップ
3. 「Start」をクリック → 特徴点の分布を確認（均一であれば良好）
4. `targets.mind` をダウンロード

### 6.3 プロジェクトへの配置

```
public/
  targets.mind       ← ここに配置
  target-image.png   ← 印刷用の元画像（ユーザー配布用）
```

Vite は `public/` 内のファイルをそのままコピーするため、`/ar_app/targets.mind` でアクセス可能。

### 6.4 印刷・設置

- **マット紙**に印刷（光沢紙は反射で認識率低下）
- **A4サイズ**推奨 → 約1〜1.5mの距離で認識
- 屋外の場合はマットラミネート加工

---

## 7. ファイル別詳細設計

---

### 7.1 新規: `src/types/mind-ar.d.ts`

**責務:** MindAR の TypeScript 型定義（mind-ar パッケージに型定義が含まれないため）

```ts
declare module 'mind-ar/dist/mindar-image-three.prod.js' {
  import type { WebGLRenderer, Scene, Camera, Group } from 'three'

  interface MindARThreeOptions {
    container: HTMLElement
    imageTargetSrc: string
    maxTrack?: number
    filterMinCF?: number
    filterBeta?: number
    missTolerance?: number
    warmupTolerance?: number
  }

  interface MindARAnchor {
    group: Group
    onTargetFound: (() => void) | null
    onTargetLost: (() => void) | null
  }

  export class MindARThree {
    constructor(options: MindARThreeOptions)
    renderer: WebGLRenderer
    scene: Scene
    camera: Camera
    addAnchor(targetIndex: number): MindARAnchor
    start(): Promise<void>
    stop(): void
    switchCamera(): void
  }
}
```

---

### 7.2 新規: `src/components/MindARCanvas.tsx`

**責務:** MindAR による画像トラッキング AR 体験の全体を管理する自己完結型コンポーネント

**props:**
```ts
interface MindARCanvasProps {
  onBack: () => void  // StartScreen に戻る
}
```

**内部状態:**
```ts
const [targetFound, setTargetFound] = useState(false)
```

**ライフサイクル:**

```
マウント
  ↓
useEffect 開始
  ↓
MindARThree インスタンス生成
  ↓
Lighting を scene に追加
  ↓
Anchor (targetIndex: 0) を追加
  ↓
魚メッシュ × 8 を生成 → anchor.group に追加
  ↓
anchor.onTargetFound / onTargetLost を設定
  ↓
mindarThree.start() (async)
  ↓
renderer.setAnimationLoop 開始
  │  毎フレーム:
  │  ├── delta 計算
  │  ├── updateBoids(fishStates, delta)
  │  ├── updateFishMeshes(fishMeshes, fishStates, elapsedTime)
  │  └── renderer.render(scene, camera)
  ↓
（ユーザーが「戻る」を押す or アンマウント）
  ↓
renderer.setAnimationLoop(null)
mindarThree.stop()
```

**完全なコード:**

```tsx
import { useRef, useEffect, useState, useCallback } from 'react'
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
  y: [-0.1, 0.5] as const,   // 画像の上方向に多めに確保
  z: [-0.4, 0.1] as const,   // カメラ側（負のZ）に魚を配置
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

function dist(a: [number, number, number], b: [number, number, number]): number {
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
  const target = speed > MAX_SPEED ? MAX_SPEED : speed < MIN_SPEED ? MIN_SPEED : speed
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
    let sepX = 0, sepY = 0, sepZ = 0
    let aliX = 0, aliY = 0, aliZ = 0
    let cohX = 0, cohY = 0, cohZ = 0
    let aliCount = 0, cohCount = 0

    for (let j = 0; j < fish.length; j++) {
      if (i === j) continue
      const other = fish[j]
      const d = dist(cur.position, other.position)

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
    for (let axis = 0; axis < 3; axis++) {
      const bounds = axis === 0 ? BOUNDS.x : axis === 1 ? BOUNDS.y : BOUNDS.z
      const acc = axis === 0 ? 'ax' : axis === 1 ? 'ay' : 'az'
      if (p[axis] > bounds[1] - BOUNDARY_MARGIN) {
        const force = -(p[axis] - (bounds[1] - BOUNDARY_MARGIN)) * BOUNDARY_WEIGHT
        if (axis === 0) ax += force
        else if (axis === 1) ay += force
        else az += force
      } else if (p[axis] < bounds[0] + BOUNDARY_MARGIN) {
        const force = -(p[axis] - (bounds[0] + BOUNDARY_MARGIN)) * BOUNDARY_WEIGHT
        if (axis === 0) ax += force
        else if (axis === 1) ay += force
        else az += force
      }
    }

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

const containerStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1,
}

const backButtonStyle: React.CSSProperties = {
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

  // targetFound を ref 経由で MindAR コールバックに渡す
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
```

**重要なポイント:**

| ポイント | 詳細 |
|---|---|
| `container` | MindARThree は渡された DOM 要素に `<video>` と `<canvas>` を自動挿入する |
| `import.meta.env.BASE_URL` | Vite の `base: '/ar_app/'` に対応。GitHub Pages で正しいパスになる |
| `cancelled` フラグ | React Strict Mode での二重 effect 実行に対応。setup 途中でアンマウントされた場合にリークを防止 |
| `setTargetFoundRef` | MindAR のコールバックが古いクロージャを参照する問題を回避 |
| 魚のスケール | `0.05〜0.08`（既存モードの `0.25〜0.4` より大幅に小さい。画像ターゲットの座標系に合わせるため） |
| Boid 境界 | ターゲット画像中心を原点とした小さな領域。Y>0（上方向）、Z<0（カメラ手前側）に魚を配置 |

---

### 7.3 新規: `src/components/TargetGuide.tsx`

**責務:** ターゲット画像が未検出の間、ユーザーに案内を表示する

```tsx
import type { CSSProperties } from 'react'

const guideStyle: CSSProperties = {
  position: 'fixed',
  bottom: '4rem',
  left: '50%',
  transform: 'translateX(-50%)',
  padding: '0.8rem 1.5rem',
  background: 'rgba(0, 0, 0, 0.6)',
  color: '#fff',
  borderRadius: '1rem',
  fontSize: '0.9rem',
  zIndex: 2,
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  textAlign: 'center',
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
}

export function TargetGuide() {
  return (
    <div style={guideStyle}>
      マーカーにカメラを向けてください
    </div>
  )
}
```

---

### 7.4 変更: `src/hooks/useARMode.ts`

**変更内容:**
1. `ARMode` 型に `'mindar'` を追加
2. `start` 関数の引数に `preferredMode` を追加
3. `reset` 関数を追加（MindAR モードから idle に戻る用）

**差分:**

```ts
// ---- 型定義の変更 ----

export type ARMode = 'webxr' | 'orientation' | 'overlay' | 'mindar'  // 'mindar' 追加

// ---- UseARModeReturn に reset を追加 ----

export interface UseARModeReturn {
  state: ARState
  start: (preferredMode?: 'mindar' | 'standard') => Promise<void>  // 引数追加
  reset: () => void                                                  // 新規
  recenter: () => void
  handleXRSessionEnd: () => void
  handleFallbackToOverlay: () => void
}

// ---- start 関数の変更 ----

const start = useCallback(async (preferredMode?: 'mindar' | 'standard') => {
  // MindAR モード: カメラはMindARが管理するため、直接 active に遷移
  if (preferredMode === 'mindar') {
    setState({ status: 'active', mode: 'mindar', stream: null })
    return
  }

  // 以下は既存のロジック（変更なし）
  setState({ status: 'requesting' })
  try {
    const mode = await detectARMode()
    // ... 既存コード ...
  } catch (err) {
    // ... 既存コード ...
  }
}, [acquireCamera])

// ---- reset 関数を追加 ----

const reset = useCallback(() => {
  stopStream()
  setState({ status: 'idle' })
}, [stopStream])

// ---- return に reset を追加 ----

return {
  state,
  start,
  reset,          // 追加
  recenter,
  handleXRSessionEnd,
  handleFallbackToOverlay,
}
```

---

### 7.5 変更: `src/components/StartScreen.tsx`

**変更内容:**
1. `onStart` の型を `(mode?: 'mindar' | 'standard') => void` に変更
2. `idle` 状態で2つのボタンを表示

**差分:**

```tsx
// ---- Props の変更 ----

interface StartScreenProps {
  status: 'idle' | 'requesting' | 'error'
  error?: string
  onStart: (mode?: 'mindar' | 'standard') => void  // 引数追加
}

// ---- ボタングループのスタイル追加 ----

const buttonGroupStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
  alignItems: 'center',
}

const secondaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: 'transparent',
  border: '1px solid rgba(255, 255, 255, 0.4)',
  fontSize: '1rem',
}

const descriptionStyle: CSSProperties = {
  fontSize: '0.75rem',
  color: '#94a3b8',
  marginTop: '0.25rem',
}

// ---- idle 時の表示を変更 ----

{status === 'idle' && (
  <div style={buttonGroupStyle}>
    <div style={{ textAlign: 'center' }}>
      <button style={buttonStyle} onClick={() => onStart('mindar')}>
        画像AR（マーカーを使う）
      </button>
      <p style={descriptionStyle}>印刷したマーカー画像が必要です</p>
    </div>
    <div style={{ textAlign: 'center' }}>
      <button style={secondaryButtonStyle} onClick={() => onStart('standard')}>
        フリーAR（ジャイロ）
      </button>
      <p style={descriptionStyle}>マーカー不要・見回すAR体験</p>
    </div>
  </div>
)}
```

---

### 7.6 変更: `src/App.tsx`

**変更内容:** MindAR モードの分岐を追加

```tsx
import { useARMode } from './hooks/useARMode'
import { StartScreen } from './components/StartScreen'
import { CameraBackground } from './components/CameraBackground'
import { ARCanvas } from './components/ARCanvas'
import { XRCanvas } from './components/XRCanvas'
import { RecenterButton } from './components/RecenterButton'
import { MindARCanvas } from './components/MindARCanvas'       // 追加

export default function App() {
  const {
    state,
    start,
    reset,                          // 追加
    recenter,
    handleXRSessionEnd,
    handleFallbackToOverlay,
  } = useARMode()

  if (state.status !== 'active') {
    return (
      <StartScreen
        status={state.status}
        error={state.status === 'error' ? state.error : undefined}
        onStart={start}
      />
    )
  }

  // MindAR モード（追加）
  if (state.mode === 'mindar') {
    return <MindARCanvas onBack={reset} />
  }

  // WebXR モード（既存）
  if (state.mode === 'webxr') {
    return <XRCanvas onSessionEnd={handleXRSessionEnd} />
  }

  // Orientation / Overlay モード（既存）
  return (
    <>
      {state.stream && <CameraBackground stream={state.stream} />}
      <ARCanvas
        worldLocked={state.mode === 'orientation'}
        onFallbackToOverlay={handleFallbackToOverlay}
      />
      {state.mode === 'orientation' && (
        <RecenterButton onRecenter={recenter} />
      )}
    </>
  )
}
```

---

### 7.7 画像ターゲットファイルの配置

```
public/
  targets.mind          ← MindAR コンパイラで生成（※初回は仮ターゲットで動作確認）
```

**開発初期のテスト用:**
MindAR 公式のサンプルターゲット（GitHub の examples に含まれる）を使って動作確認し、
後から本番用のターゲット画像に差し替える。

---

## 8. MindARThree 初期化シーケンス詳細

```
MindARCanvas マウント
  │
  ▼
new MindARThree({
  container,                         ← DOM 要素
  imageTargetSrc: '.../targets.mind' ← コンパイル済みターゲット
})
  │
  ├── container 内に <video> 要素を生成
  ├── container 内に <canvas> 要素を生成（WebGL）
  ├── Three.js の Scene, Camera, WebGLRenderer を生成
  │
  ▼
mindarThree.addAnchor(0)
  │
  ├── targetIndex: 0 に紐づく Group を生成
  ├── anchor.group はターゲット検出時のみ可視
  ├── anchor.onTargetFound / onTargetLost コールバック設定
  │
  ▼
anchor.group に魚メッシュ × 8 を追加
  │
  ▼
await mindarThree.start()
  │
  ├── getUserMedia でカメラを取得（MindAR 内部）
  ├── <video> にストリームを設定
  ├── 画像認識エンジン (TensorFlow.js WebGL) を初期化
  ├── Web Worker でトラッキングループを開始
  │
  ▼
renderer.setAnimationLoop(callback)
  │
  ├── 毎フレーム:
  │   ├── MindAR がカメラ映像を解析
  │   ├── ターゲット検出時: anchor.group の transform を更新
  │   ├── updateBoids(): Boid アルゴリズムで魚の位置・速度を更新
  │   ├── updateFishMeshes(): メッシュに位置・回転を反映
  │   └── renderer.render(scene, camera)
  │
  ▼
（cleanup 時）
  ├── renderer.setAnimationLoop(null)
  └── mindarThree.stop()
       ├── カメラストリームを停止
       ├── Web Worker を終了
       └── DOM 要素をクリーンアップ
```

---

## 9. 魚の座標系とスケール

### 座標系（MindAR のアンカー座標系）

```
        Y (上)
        │
        │    ターゲット画像
        │   ┌─────────────┐
        │   │             │
        ├───┤  (0, 0, 0)  ├───→ X (右)
        │   │             │
        │   └─────────────┘
        │
        ▼
       Z (カメラに向かって手前)
```

- 原点: ターゲット画像の中心
- 1 単位 ≒ ターゲット画像の幅
- Z 正方向: カメラ側（手前）
- Y 正方向: 画像上方

### スケール対応表

| 項目 | フリーAR（既存） | 画像AR（MindAR） | 比率 |
|---|---|---|---|
| 魚のスケール | 0.25〜0.4 | 0.05〜0.08 | 約 1/5 |
| 遊泳範囲 X | ±3〜4 | ±0.6 | 約 1/6 |
| 遊泳範囲 Y | ±2〜3 | -0.1〜+0.5 | 約 1/6 |
| 遊泳範囲 Z | ±2〜4 | -0.4〜+0.1 | 約 1/6 |
| Boid 分離半径 | 0.8 | 0.15 | 約 1/5 |
| Boid 速度 | 0.3〜1.2 | 0.08〜0.3 | 約 1/4 |

---

## 10. ビルド・デプロイ設定

### Vite 設定

`vite.config.ts` の変更は不要。`mind-ar` は npm パッケージとしてインストールされ、Vite が自動でバンドルする。

### TypeScript 設定

`tsconfig.app.json` の `include` に `src` が含まれているため、`src/types/mind-ar.d.ts` は自動的に認識される。

### GitHub Pages デプロイ

`public/targets.mind` は `dist/targets.mind` にコピーされ、`/ar_app/targets.mind` でアクセス可能。
追加設定は不要。

### バンドルサイズの影響

| パッケージ | 追加サイズ（gzip 概算） |
|---|---|
| `mind-ar` (image-three prod) | 約 200〜400KB |
| TensorFlow.js WebGL (mind-ar 内蔵) | 上記に含む |

**注意:** MindAR は TensorFlow.js を内蔵しているため、バンドルサイズが大きめ。
フリーAR モードのみ使うユーザーには不要なコードがロードされる。

**最適化（将来）:**
- `React.lazy` + `Suspense` で `MindARCanvas` を動的 import し、MindAR モード選択時にのみロードする

```tsx
// App.tsx での動的 import（将来の最適化）
const MindARCanvas = lazy(() =>
  import('./components/MindARCanvas').then((m) => ({ default: m.MindARCanvas }))
)

// 使用時
{state.mode === 'mindar' && (
  <Suspense fallback={<LoadingScreen />}>
    <MindARCanvas onBack={reset} />
  </Suspense>
)}
```

---

## 11. テスト計画

### 11.1 開発中のテスト（PCブラウザ）

1. `npm run dev` でローカルサーバー起動
2. PC のウェブカメラで画像ターゲットを表示（画面上 or 印刷物）
3. MindAR がターゲットを検出 → 魚が表示されることを確認
4. ターゲットを隠す → 魚が消え、TargetGuide が表示されることを確認
5. 「戻る」ボタン → StartScreen に戻ることを確認

### 11.2 モバイルテスト

| テスト項目 | iOS Safari | Android Chrome |
|---|---|---|
| MindAR モード起動 | カメラ権限ダイアログ → 許可 | カメラ権限ダイアログ → 許可 |
| ターゲット検出 | 魚が表示される | 魚が表示される |
| ターゲットロスト | ガイド表示 | ガイド表示 |
| 魚の Boid アニメーション | 滑らかに泳ぐ | 滑らかに泳ぐ |
| 「戻る」→ StartScreen | 正常遷移 | 正常遷移 |
| 「フリーAR」→ 既存モード | 正常動作（変更なし） | 正常動作（変更なし） |
| バックグラウンド→復帰 | MindAR が復帰 or エラーハンドリング | 同左 |

### 11.3 テスト用ターゲット画像

開発初期は MindAR 公式の example ターゲットを使用:
- https://cdn.jsdelivr.net/gh/nicolo-ribaudo/mind-ar-ts@main/examples/image-tracking/assets/band-target.mind

後から本番用のターゲット画像に差し替える。

---

## 12. 既知の制限事項

| 制限 | 詳細 | 影響 |
|---|---|---|
| Firefox 非対応 | MindAR の画像トラッキングが Firefox で不安定 | Firefox ユーザーはフリーAR モードを使用 |
| iOS Safari でのターゲット数制限 | 6個以上のターゲットでクラッシュ報告あり | 本アプリは1ターゲットなので影響なし |
| 暗所での認識失敗 | カメラ映像が暗いと特徴点が検出できない | ユーザーに照明を案内 |
| 角度制限 | ±45〜60度以上でトラッキングが外れる | 正面から使うことをUI上で案内 |
| バンドルサイズ | MindAR(TensorFlow.js含)で約200〜400KB増加 | 将来的に動的 import で最適化 |
| react-three-mind 不使用 | R3F コンポーネントを MindAR モードで直接再利用できない | 魚メッシュを Three.js で別途生成（コード重複あり） |

---

## 13. 実装手順チェックリスト

1. [ ] `npm install mind-ar` でパッケージ追加
2. [ ] `src/types/mind-ar.d.ts` を作成（型定義）
3. [ ] テスト用 `targets.mind` を `public/` に配置
4. [ ] `src/components/TargetGuide.tsx` を作成
5. [ ] `src/components/MindARCanvas.tsx` を作成
6. [ ] `src/hooks/useARMode.ts` を変更（mindar モード追加 + reset 関数）
7. [ ] `src/components/StartScreen.tsx` を変更（モード選択UI）
8. [ ] `src/App.tsx` を変更（MindAR モード分岐）
9. [ ] PC ブラウザでの動作確認
10. [ ] モバイル（iOS Safari / Android Chrome）での動作確認
11. [ ] 本番用ターゲット画像の作成・コンパイル
12. [ ] ビルド・デプロイ確認
