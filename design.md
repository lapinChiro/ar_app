# AR Fish App - 開発用設計書

## 1. アプリケーション状態遷移

```
[idle] ──(ユーザーがボタン押下)──→ [requesting]
                                      │
                          ┌───────────┴───────────┐
                          ↓                       ↓
                      [active]                [error]
                          │                       │
              (visibilitychange:hidden)    (ユーザーがリトライ)
                          │                       │
                          ↓                       ↓
                     [requesting] ←───────────────┘
```

| 状態 | 表示内容 |
|---|---|
| `idle` | StartScreen（タイトル + 「ARを開始する」ボタン） |
| `requesting` | StartScreen（「カメラを起動中...」テキスト） |
| `active` | CameraBackground + ARCanvas（魚群） |
| `error` | エラー画面（メッセージ + リトライボタン） |

---

## 2. コンポーネントツリーとデータフロー

```
App
├── StartScreen          ... idle / requesting / error 時に表示
│
├── CameraBackground     ... active 時に表示
│   └── <video>          ... useCamera の stream を srcObject に設定
│
└── ARCanvas             ... active 時に表示
    └── <Canvas>         ... R3F (alpha: true, 透過)
        ├── Lighting
        │   ├── <ambientLight>
        │   └── <directionalLight>
        └── FishSchool
            ├── Fish[0]
            ├── Fish[1]
            ├── ...
            └── Fish[n]
```

**データフロー:**
```
App (cameraState)
 │
 ├──→ StartScreen   ... cameraState.status, onStart, onRetry
 │
 ├──→ CameraBackground  ... cameraState.stream
 │
 └──→ ARCanvas
       └──→ FishSchool
             │  useFishMovement(count) → fishStates[]
             │
             └──→ Fish × N  ... position, velocity → rotation 計算
```

---

## 3. ファイル別詳細設計

---

### 3.1 `index.html`

```html
<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>AR Fish</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

---

### 3.2 `vite.config.ts`

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/ar_app/',
})
```

- `base`: GitHub Pages のリポジトリ名。`https://<user>.github.io/ar_app/` に対応。

---

### 3.3 `src/styles/global.css`

```css
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html,
body,
#root {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #000;
  overscroll-behavior: none;
  -webkit-overflow-scrolling: auto;
}
```

- `overscroll-behavior: none`: iOS のラバーバンドスクロール防止
- `overflow: hidden`: スクロール完全無効

---

### 3.4 `src/main.tsx`

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/global.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

---

### 3.5 `src/App.tsx`

**責務:** アプリケーション全体の状態管理、表示切り替え

```tsx
import { useCamera } from './hooks/useCamera'
import { StartScreen } from './components/StartScreen'
import { CameraBackground } from './components/CameraBackground'
import { ARCanvas } from './components/ARCanvas'

export default function App() {
  const camera = useCamera()

  return (
    <>
      {camera.state.status !== 'active' && (
        <StartScreen
          status={camera.state.status}
          error={camera.state.status === 'error' ? camera.state.error : undefined}
          onStart={camera.start}
        />
      )}

      {camera.state.status === 'active' && (
        <>
          <CameraBackground stream={camera.state.stream} />
          <ARCanvas />
        </>
      )}
    </>
  )
}
```

**描画条件:**
- `idle` / `requesting` / `error` → `StartScreen` のみ
- `active` → `CameraBackground` + `ARCanvas`

---

### 3.6 `src/hooks/useCamera.ts`

**責務:** getUserMedia によるカメラストリームのライフサイクル管理

**型定義:**
```ts
type CameraState =
  | { status: 'idle' }
  | { status: 'requesting' }
  | { status: 'active'; stream: MediaStream }
  | { status: 'error'; error: string }

interface UseCameraReturn {
  state: CameraState
  start: () => Promise<void>
  stop: () => void
}
```

**実装仕様:**

```ts
import { useState, useCallback, useEffect, useRef } from 'react'

const CONSTRAINTS: MediaStreamConstraints = {
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
  audio: false,
}

export function useCamera(): UseCameraReturn {
  const [state, setState] = useState<CameraState>({ status: 'idle' })
  const streamRef = useRef<MediaStream | null>(null)

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  const start = useCallback(async () => {
    setState({ status: 'requesting' })
    try {
      stopStream()
      const stream = await navigator.mediaDevices.getUserMedia(CONSTRAINTS)
      streamRef.current = stream
      setState({ status: 'active', stream })
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'カメラへのアクセスが拒否されました。ブラウザの設定から許可してください。'
          : 'カメラの起動に失敗しました。'
      setState({ status: 'error', error: message })
    }
  }, [stopStream])

  const stop = useCallback(() => {
    stopStream()
    setState({ status: 'idle' })
  }, [stopStream])

  // バックグラウンド復帰時のストリーム再取得
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (
        document.visibilityState === 'visible' &&
        streamRef.current
      ) {
        // 既存ストリームのトラックが生きているか確認
        const tracks = streamRef.current.getTracks()
        const allAlive = tracks.every((t) => t.readyState === 'live')
        if (!allAlive) {
          start()
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [start])

  // アンマウント時にストリームを停止
  useEffect(() => {
    return () => stopStream()
  }, [stopStream])

  return { state, start, stop }
}
```

**エラーハンドリング:**

| エラー | `DOMException.name` | メッセージ |
|---|---|---|
| 権限拒否 | `NotAllowedError` | カメラへのアクセスが拒否されました... |
| カメラ未検出 | `NotFoundError` | カメラの起動に失敗しました。 |
| その他 | - | カメラの起動に失敗しました。 |

---

### 3.7 `src/components/StartScreen.tsx`

**責務:** カメラ起動前の初期画面・エラー画面

**Props:**
```ts
interface StartScreenProps {
  status: 'idle' | 'requesting' | 'error'
  error?: string
  onStart: () => void
}
```

**レイアウト:**
```
┌──────────────────────┐
│                      │
│                      │
│      AR Fish         │  ← アプリタイトル
│                      │
│   [ ARを開始する ]    │  ← ボタン（idle時）
│   カメラを起動中...   │  ← テキスト（requesting時）
│   {エラーメッセージ}  │  ← テキスト（error時）
│   [ リトライ ]        │  ← ボタン（error時）
│                      │
│                      │
└──────────────────────┘
```

**スタイル（インライン）:**
```ts
const containerStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'linear-gradient(135deg, #0a1628, #1a3a5c)',
  color: '#fff',
  zIndex: 10,
}

const titleStyle: React.CSSProperties = {
  fontSize: '2rem',
  fontWeight: 'bold',
  marginBottom: '2rem',
  fontFamily: 'system-ui, sans-serif',
}

const buttonStyle: React.CSSProperties = {
  padding: '1rem 2rem',
  fontSize: '1.2rem',
  border: 'none',
  borderRadius: '0.5rem',
  background: '#3b82f6',
  color: '#fff',
  cursor: 'pointer',
  touchAction: 'manipulation',
}

const errorStyle: React.CSSProperties = {
  color: '#f87171',
  fontSize: '0.9rem',
  marginBottom: '1rem',
  textAlign: 'center',
  padding: '0 2rem',
}
```

**描画ロジック:**
- `idle`: タイトル + 「ARを開始する」ボタン。ボタン押下で `onStart()` 呼び出し。
- `requesting`: タイトル + 「カメラを起動中...」テキスト。ボタン非表示。
- `error`: タイトル + エラーメッセージ + 「リトライ」ボタン。ボタン押下で `onStart()` 呼び出し。

---

### 3.8 `src/components/CameraBackground.tsx`

**責務:** カメラ映像のフルスクリーン背景表示

**Props:**
```ts
interface CameraBackgroundProps {
  stream: MediaStream
}
```

**実装仕様:**
```tsx
import { useEffect, useRef } from 'react'

export function CameraBackground({ stream }: CameraBackgroundProps) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.srcObject = stream
    video.play().catch(() => {
      // autoplay失敗時は無視（ユーザー操作後なので通常は成功する）
    })
  }, [stream])

  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        zIndex: 0,
      }}
    />
  )
}
```

**重要:**
- `autoPlay`, `muted`, `playsInline` の3属性は iOS Safari で必須
- `stream` propが変わるたびに `srcObject` を再設定
- `video.play()` は `start()` がユーザージェスチャー起因なので通常成功する

---

### 3.9 `src/components/ARCanvas.tsx`

**責務:** Three.js の透過Canvasレイヤーをセットアップし、子コンポーネントを描画

**実装仕様:**
```tsx
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
```

**Canvas設定の根拠:**
- `alpha: true`: 背景透過（カメラ映像を透かす）
- `antialias: false`: モバイルのフィルレート節約
- `stencil: false`: 不使用のためバッファ節約
- `dpr={[1, 2]}`: devicePixelRatio の下限1、上限2
- `fov: 60`: スマホ縦画面で自然な視野角
- `position: [0, 0, 5]`: カメラをZ=5に配置。魚は Z=-2〜+2 の範囲で泳ぐ

---

### 3.10 `src/components/Lighting.tsx`

**責務:** シーンのライティング

**実装仕様:**
```tsx
export function Lighting() {
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 5, 5]} intensity={0.8} />
    </>
  )
}
```

- `ambientLight`: 全方向からの一様な光。影なし。基礎的な明るさを確保。
- `directionalLight`: 太陽光のような平行光。魚の表面に立体感を与える。

---

### 3.11 `src/components/Fish.tsx`

**責務:** 1匹の魚の3Dモデル描画 + 尾びれアニメーション

**Props:**
```ts
interface FishProps {
  position: [number, number, number]
  velocity: [number, number, number]
  color: string
  scale?: number
}
```

**3Dモデル構成（プロシージャル）:**

魚は4つのパーツで構成し、すべて `<group>` でまとめる。

```
   背びれ (dorsalFin)
     ▲
   ┌─┼─────────┐
   │ │  胴体     │──── 尾びれ (tailFin) ◁
   └─┼─────────┘
     ▽
   胸びれ (pectoralFin) × 2
```

**パーツ別ジオメトリ:**

| パーツ | ジオメトリ | サイズ | 位置 (相対) |
|---|---|---|---|
| 胴体 (body) | `SphereGeometry(1, 12, 8)` に `scale=[1.6, 0.6, 0.5]` | 長径1.6 | `[0, 0, 0]` |
| 尾びれ (tail) | `ConeGeometry(0.4, 0.8, 4)` | 底辺幅0.4, 高さ0.8 | `[-1.2, 0, 0]` Z軸90度回転 |
| 背びれ (dorsal) | `ConeGeometry(0.15, 0.4, 4)` | 底辺幅0.15, 高さ0.4 | `[0.2, 0.45, 0]` |
| 胸びれ (pectoral) | `ConeGeometry(0.1, 0.3, 4)` × 2 | 底辺幅0.1, 高さ0.3 | `[0.3, -0.1, ±0.35]` |

**マテリアル:**
```ts
<meshStandardMaterial
  color={color}
  metalness={0.3}
  roughness={0.4}
/>
```

**アニメーション（useFrame内）:**

1. **尾びれの揺れ:** 尾びれの `rotation.y` を正弦波で制御
   ```ts
   tailRef.current.rotation.y = Math.sin(elapsedTime * 6) * 0.4
   ```
   - 周波数: 6 rad/s（1秒に約1往復）
   - 振幅: 0.4 rad（約23度）

2. **胴体の微揺れ:** 体全体を微かに揺らしてリアリティを出す
   ```ts
   groupRef.current.rotation.z = Math.sin(elapsedTime * 4) * 0.05
   ```

3. **向きの制御:** velocity ベクトルから進行方向の回転を計算
   ```ts
   // Y軸回転（左右の向き）
   const angle = Math.atan2(velocity[2], velocity[0])
   groupRef.current.rotation.y = -angle

   // Z軸回転（上下の傾き）
   const pitch = Math.atan2(velocity[1], horizontalSpeed)
   groupRef.current.rotation.z += -pitch * 0.3
   ```

**ポリゴン数見積もり:**
- SphereGeometry(1, 12, 8): 約 192 三角形
- ConeGeometry × 3: 約 48 三角形
- 合計: 約 240 三角形/匹
- 8匹: 約 1,920 三角形（モバイル予算の2%以下）

---

### 3.12 `src/hooks/useFishMovement.ts`

**責務:** Boidsアルゴリズムによる魚群の位置・速度の毎フレーム更新

**型定義:**
```ts
interface FishState {
  position: [number, number, number]
  velocity: [number, number, number]
}
```

**Boidsアルゴリズム定数:**
```ts
const BOIDS_CONFIG = {
  // 空間の境界
  bounds: {
    x: [-3, 3],      // 左右
    y: [-2, 2],      // 上下
    z: [-2, 2],      // 奥行き
  },

  // 速度制限
  minSpeed: 0.3,     // 最低速度（停止防止）
  maxSpeed: 1.2,     // 最高速度

  // Boidsルールの影響半径
  separationRadius: 0.8,   // この距離以内の魚から離れる
  alignmentRadius: 2.0,    // この距離以内の魚と方向を揃える
  cohesionRadius: 2.5,     // この距離以内の魚の重心に向かう

  // Boidsルールの重み
  separationWeight: 0.05,
  alignmentWeight: 0.02,
  cohesionWeight: 0.01,

  // 境界反発の重み
  boundaryWeight: 0.1,
  // 境界からこの距離以内で反発開始
  boundaryMargin: 0.5,
}
```

**アルゴリズム詳細（毎フレーム実行）:**

```
各魚 i について:
  1. 近隣の魚を検出
  2. Boids 3ルールから加速度ベクトルを計算
  3. 境界反発ベクトルを加算
  4. 速度を更新（加速度を加算）
  5. 速度をクランプ（minSpeed〜maxSpeed）
  6. 位置を更新（速度 × delta）
```

**各ルールの計算:**

**分離 (Separation):**
```
separation = Σ (自分の位置 - 近隣の位置) / 距離²
             (距離 < separationRadius の近隣について)
result = separation * separationWeight
```

**整列 (Alignment):**
```
avgVelocity = Σ 近隣の速度 / 近隣数
              (距離 < alignmentRadius の近隣について)
alignment = avgVelocity - 自分の速度
result = alignment * alignmentWeight
```

**結合 (Cohesion):**
```
centerOfMass = Σ 近隣の位置 / 近隣数
               (距離 < cohesionRadius の近隣について)
cohesion = centerOfMass - 自分の位置
result = cohesion * cohesionWeight
```

**境界反発:**
```
各軸 (x, y, z) について:
  if (位置 > 上限 - margin):
    反発力 = -(位置 - (上限 - margin)) * boundaryWeight
  if (位置 < 下限 + margin):
    反発力 = -(位置 - (下限 + margin)) * boundaryWeight
```

**速度クランプ:**
```
speed = |velocity|
if speed > maxSpeed:
  velocity = velocity / speed * maxSpeed
if speed < minSpeed:
  velocity = velocity / speed * minSpeed
```

**実装仕様:**

```ts
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

export function useFishMovement(count: number): FishState[] {
  const fishRef = useRef<FishState[]>(initializeFish(count))

  useFrame((_, delta) => {
    // delta が大きすぎる場合はスキップ（タブ非アクティブ復帰時など）
    if (delta > 0.1) return

    const fish = fishRef.current
    for (let i = 0; i < fish.length; i++) {
      const acceleration = [0, 0, 0]

      // 1. Boids 3ルール
      // 2. 境界反発
      // 3. 速度更新
      // 4. 速度クランプ
      // 5. 位置更新

      // ... (上記アルゴリズムの実装)
    }
  })

  return fishRef.current
}
```

**初期配置:**
```ts
function initializeFish(count: number): FishState[] {
  return Array.from({ length: count }, () => ({
    position: [
      (Math.random() - 0.5) * 4, // x: -2 〜 2
      (Math.random() - 0.5) * 3, // y: -1.5 〜 1.5
      (Math.random() - 0.5) * 3, // z: -1.5 〜 1.5
    ],
    velocity: [
      (Math.random() - 0.5) * 0.6,
      (Math.random() - 0.5) * 0.3,
      (Math.random() - 0.5) * 0.3,
    ],
  }))
}
```

**パフォーマンス考慮:**
- `useRef` で状態を保持（`useState` だと毎フレームの再レンダリングが発生するため不使用）
- 近隣検索は O(n²) だが n=8 程度なので問題なし（64回の距離計算/フレーム）
- `delta > 0.1` のガード: タブが非アクティブになった後の復帰時に大きな delta が発生し、魚がワープすることを防止

---

### 3.13 `src/components/FishSchool.tsx`

**責務:** 複数の魚の管理、useFishMovement との接続

**Props:**
```ts
interface FishSchoolProps {
  count: number
}
```

**実装仕様:**
```tsx
import { useMemo } from 'react'
import { Fish } from './Fish'
import { useFishMovement } from '../hooks/useFishMovement'

const FISH_COLORS = ['#4fc3f7', '#81d4fa', '#e91e63', '#ff9800']

export function FishSchool({ count }: FishSchoolProps) {
  const fishStates = useFishMovement(count)

  // 色とスケールは初回のみ決定（不変）
  const fishAttributes = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        color: FISH_COLORS[Math.floor(Math.random() * FISH_COLORS.length)],
        scale: 0.25 + Math.random() * 0.15, // 0.25 〜 0.40
      })),
    [count]
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
```

**色パレット:**
| 色名 | Hex | 用途 |
|---|---|---|
| ライトブルー | `#4fc3f7` | 青系の魚 |
| スカイブルー | `#81d4fa` | 薄い青の魚 |
| ピンク | `#e91e63` | アクセント |
| オレンジ | `#ff9800` | アクセント |

**スケール:** 0.25〜0.40 の範囲でランダム。個体差を出すことで群れの自然さを演出。

---

### 3.14 `.github/workflows/deploy.yml`

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - run: npm ci
      - run: npm run build

      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

---

## 4. レンダリングパイプライン（毎フレーム）

```
useFrame(_, delta)
│
├─ useFishMovement: Boids計算
│   ├─ 各魚の近隣検索 (O(n²), n=8)
│   ├─ 分離・整列・結合ベクトル計算
│   ├─ 境界反発計算
│   ├─ 速度更新 & クランプ
│   └─ 位置更新
│
└─ Fish × 8: 描画更新
    ├─ velocity → rotation 変換（atan2）
    ├─ 尾びれ rotation.y = sin(t * 6) * 0.4
    └─ 胴体 rotation.z += sin(t * 4) * 0.05
```

**フレームあたりの計算量:**
- Boids: 8匹 × 7比較 = 56 距離計算（Vec3の引き算 + length）
- Rotation: 8匹 × atan2 × 2 = 16 三角関数呼び出し
- アニメーション: 8匹 × sin × 2 = 16 sin 呼び出し
- 合計: 軽量。モバイルでも問題なし。

---

## 5. 座標系

```
         Y+（上）
         │
         │
         │
         └────── X+（右）
        /
       /
      Z+（手前＝カメラ側）

カメラ位置: (0, 0, 5)    ... Z=5 から原点方向を見る
魚の活動範囲:
  X: -3 〜 +3
  Y: -2 〜 +2
  Z: -2 〜 +2
```

**カメラのfov=60で Z=5 の位置から見た場合の可視範囲:**
- Y方向: 約 ±2.9 (tan(30°) × 5) → bounds ±2 は画面内に収まる
- X方向: アスペクト比 9:16（スマホ縦）で約 ±1.6 → bounds ±3 は画面外にはみ出す余地あり

魚が境界付近で反発し方向転換する動きが見えるため、bounds を少し広めに設定。

---

## 6. エラーケースと対応

| ケース | 検出方法 | 対応 |
|---|---|---|
| カメラ権限拒否 | `getUserMedia` が `NotAllowedError` をthrow | エラーメッセージ + リトライボタン |
| カメラ未検出 | `getUserMedia` が `NotFoundError` をthrow | エラーメッセージ + リトライボタン |
| HTTPS でない | `getUserMedia` が `NotAllowedError` をthrow | エラーメッセージ（GitHub Pages なら発生しない） |
| バックグラウンド復帰 | `visibilitychange` + track.readyState チェック | ストリーム自動再取得 |
| WebGL コンテキスト消失 | R3F が内部でハンドリング | 自動復帰を期待 |
| 大きな delta | `delta > 0.1` チェック | フレームスキップ |

---

## 7. ファイル一覧と依存関係

```
index.html
  └─ src/main.tsx
       └─ src/App.tsx
            ├─ src/hooks/useCamera.ts          (外部依存なし)
            ├─ src/components/StartScreen.tsx   (外部依存なし)
            ├─ src/components/CameraBackground.tsx (外部依存なし)
            └─ src/components/ARCanvas.tsx      (依存: @react-three/fiber)
                 ├─ src/components/Lighting.tsx  (外部依存なし)
                 └─ src/components/FishSchool.tsx (外部依存なし)
                      ├─ src/hooks/useFishMovement.ts (依存: @react-three/fiber の useFrame)
                      └─ src/components/Fish.tsx      (依存: @react-three/fiber の useFrame, three)
```

---

## 8. ビルド成果物

```
dist/
├── index.html
├── assets/
│   ├── index-[hash].js     ... バンドルされたJS
│   └── index-[hash].css    ... バンドルされたCSS
```

- `vite build` により `dist/` に出力
- `base: '/ar_app/'` により、すべてのパスが `/ar_app/` からの相対パスになる
- GitHub Actions が `dist/` を Pages にデプロイ
