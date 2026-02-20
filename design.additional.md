# AR Fish App - 追加開発用設計書（ワールドロック + WebXR）

## 1. 概要と目標

現在の実装ではカメラ映像の上に3Dの魚が描画されるが、魚は画面に貼り付いたまま動かない。
本追加開発では、スマホの向きに応じて魚が空間に固定される「ワールドロック」体験を実現する。

**目指す動作:**
- スマホを左に向けると、魚が右に流れていく（実空間に固定されている感覚）
- スマホを上に向けると、頭上の魚が見える
- 対応デバイスでは6DoFの本格AR体験も提供する

**段階的アプローチ（プログレッシブエンハンスメント）:**

```
WebXR immersive-ar が使える場合（Android Chrome + ARCore）
  → 6DoF AR: ブラウザが提供するカメラパススルー + 空間追跡

DeviceOrientationEvent が使える場合（iOS Safari, ほとんどのモバイルブラウザ）
  → 3DoF AR: getUserMedia + ジャイロによるカメラ回転追跡

どちらも使えない場合（デスクトップ等）
  → カメラオーバーレイ: 現在の実装と同じ
```

---

## 2. ARモードの定義と検出

### 2.1 ARモード定義

```ts
type ARMode = 'webxr' | 'orientation' | 'overlay'
```

| モード | 追跡 | カメラ映像 | 3D空間 | 対応デバイス |
|---|---|---|---|---|
| `webxr` | 6DoF（回転+位置） | ブラウザXRランタイムが管理 | XR空間に直接配置 | Android Chrome (ARCore) |
| `orientation` | 3DoF（回転のみ） | getUserMedia（自前video要素） | ジャイロでカメラ回転 | iOS Safari, Android各種ブラウザ |
| `overlay` | なし | getUserMedia（自前video要素） | 画面に固定（現状） | デスクトップ、ジャイロなし端末 |

### 2.2 検出ロジック

```ts
async function detectARMode(): Promise<ARMode> {
  // 1. WebXR immersive-ar の判定
  if (navigator.xr) {
    try {
      const supported = await navigator.xr.isSessionSupported('immersive-ar')
      if (supported) return 'webxr'
    } catch {
      // WebXR API は存在するが immersive-ar 非対応
    }
  }

  // 2. DeviceOrientationEvent の判定
  if (typeof DeviceOrientationEvent !== 'undefined') {
    return 'orientation'
  }

  // 3. フォールバック
  return 'overlay'
}
```

**注意:**
- `orientation` モードの判定は「APIが存在するか」のみ。実際にジャイロが動作するかはイベント受信後に判明する。
- ジャイロデータが一定時間（1秒）届かない場合、`overlay` にフォールバックする。

### 2.3 検出タイミング

ARモードの検出は**ユーザーがボタンを押した後**に行う。
理由: WebXR の `isSessionSupported` はプロミスで非同期だが、ユーザージェスチャー前に呼べる。
一方、iOSの `DeviceOrientationEvent.requestPermission()` はユーザージェスチャー内で呼ぶ必要がある。

---

## 3. アプリケーション状態遷移（改訂版）

```
[idle] ──(ボタン押下)──→ [requesting]
                             │
                      detectARMode()
                      + カメラ権限取得
                      + ジャイロ権限取得(iOS)
                             │
               ┌─────────────┼─────────────┐
               ↓             ↓             ↓
          [active:webxr] [active:orientation] [active:overlay]
               │             │             │
               │         (ジャイロデータ
               │          1秒間来ない)
               │             │
               │             ↓
               │      [active:overlay]
               │
          (XRセッション終了)
               │
               ↓
        [active:orientation] or [active:overlay]
```

**状態型（改訂版）:**
```ts
type AppState =
  | { status: 'idle' }
  | { status: 'requesting' }
  | { status: 'active'; arMode: ARMode; stream: MediaStream | null }
  // stream は webxr モード時に null（ブラウザがカメラを管理するため）
  | { status: 'error'; error: string }
```

---

## 4. コンポーネントツリーとデータフロー（改訂版）

### 4.1 モード別コンポーネントツリー

```
App (appState, arMode)
│
├── StartScreen                  ... idle / requesting / error 時に表示
│
├── [arMode === 'webxr']
│   └── XRCanvas
│       └── <Canvas>
│           └── <XR store={xrStore}>
│               ├── Lighting
│               └── FishSchool (worldLocked: true)
│
├── [arMode === 'orientation']
│   ├── CameraBackground         ... getUserMediaのstream
│   └── ARCanvas (worldLocked: true)
│       └── <Canvas>
│           ├── WorldLockedCamera
│           ├── Lighting
│           └── FishSchool (worldLocked: true)
│
└── [arMode === 'overlay']
    ├── CameraBackground         ... getUserMediaのstream
    └── ARCanvas (worldLocked: false)
        └── <Canvas>
            ├── Lighting
            └── FishSchool (worldLocked: false)
```

### 4.2 データフロー

```
App
 │  detectARMode() → arMode
 │  useCamera() → stream (webxr時はnull)
 │
 ├──→ StartScreen
 │      status, error, onStart
 │
 ├──→ [webxr] XRCanvas
 │      └──→ FishSchool
 │             useFishMovement(count, WORLD_LOCKED_BOUNDS)
 │
 ├──→ [orientation] CameraBackground + ARCanvas
 │      │                                  │
 │      stream                     WorldLockedCamera
 │                                    useDeviceOrientation() → quaternion
 │                                    useFrame → camera.quaternion を更新
 │                                         │
 │                                  FishSchool
 │                                    useFishMovement(count, WORLD_LOCKED_BOUNDS)
 │
 └──→ [overlay] CameraBackground + ARCanvas（現在の実装と同じ）
        stream                     FishSchool
                                     useFishMovement(count, OVERLAY_BOUNDS)
```

---

## 5. 追加パッケージ

| パッケージ | バージョン | 用途 | 備考 |
|---|---|---|---|
| `@react-three/xr` | ^6.6.29 | WebXR統合 | peer dep: R3F >=8, React >=18（現在のプロジェクトと互換） |

```bash
npm install @react-three/xr@^6.6.29
```

他の既存パッケージへの変更は不要。

---

## 6. ディレクトリ構成（変更箇所）

```
src/
├── App.tsx                        # 【変更】ARモード分岐を追加
├── components/
│   ├── ARCanvas.tsx               # 【変更】worldLocked prop追加、WorldLockedCamera統合
│   ├── CameraBackground.tsx       # 変更なし
│   ├── Fish.tsx                   # 変更なし
│   ├── FishSchool.tsx             # 【変更】worldLocked propでboundsを切り替え
│   ├── Lighting.tsx               # 変更なし
│   ├── StartScreen.tsx            # 【変更】リセンターボタン追加（orientation時）
│   ├── WorldLockedCamera.tsx      # 【新規】ジャイロ→カメラ回転
│   ├── XRCanvas.tsx               # 【新規】WebXR用Canvas
│   └── RecenterButton.tsx         # 【新規】リセンターUIボタン
├── hooks/
│   ├── useARMode.ts               # 【新規】ARモード検出+起動
│   ├── useCamera.ts               # 変更なし
│   ├── useDeviceOrientation.ts    # 【新規】ジャイロデータ取得
│   └── useFishMovement.ts         # 【変更】bounds をパラメータ化
└── styles/
    └── global.css                 # 変更なし
```

---

## 7. ファイル別詳細設計

---

### 7.1 `src/hooks/useARMode.ts`【新規】

**責務:** ARモードの検出、権限リクエスト、起動フローの統括

**型定義:**
```ts
type ARMode = 'webxr' | 'orientation' | 'overlay'

type ARState =
  | { status: 'idle' }
  | { status: 'requesting' }
  | { status: 'active'; mode: ARMode; stream: MediaStream | null }
  | { status: 'error'; error: string }

interface UseARModeReturn {
  state: ARState
  start: () => Promise<void>
  recenter: () => void
}
```

**起動フロー（`start()` の処理）:**

```
start()
│
├─ setState('requesting')
│
├─ detectARMode()
│   ├─ navigator.xr?.isSessionSupported('immersive-ar')
│   └─ typeof DeviceOrientationEvent !== 'undefined'
│
├─ [webxr の場合]
│   ├─ getUserMedia は不要（XRランタイムがカメラを管理）
│   ├─ XRStore.enterAR() は XRCanvas コンポーネント側で実行
│   └─ setState({ status: 'active', mode: 'webxr', stream: null })
│
├─ [orientation の場合]
│   ├─ getUserMedia でカメラストリーム取得
│   ├─ iOS: DeviceOrientationEvent.requestPermission() を呼ぶ
│   │   └─ 'granted' 以外 → orientation ではなく overlay にフォールバック
│   └─ setState({ status: 'active', mode: 'orientation', stream })
│
└─ [overlay の場合]
    ├─ getUserMedia でカメラストリーム取得
    └─ setState({ status: 'active', mode: 'overlay', stream })
```

**iOS ジャイロ権限リクエスト:**
```ts
async function requestOrientationPermission(): Promise<boolean> {
  // iOS 13+ のみ requestPermission が存在する
  const DOE = DeviceOrientationEvent as unknown as {
    requestPermission?: () => Promise<'granted' | 'denied' | 'default'>
  }
  if (typeof DOE.requestPermission === 'function') {
    try {
      const result = await DOE.requestPermission()
      return result === 'granted'
    } catch {
      return false
    }
  }
  // Android等: 権限リクエスト不要、常に利用可能
  return true
}
```

**重要:** `requestPermission()` はユーザージェスチャー（ボタンクリック）のイベントハンドラ内で呼ぶ必要がある。`start()` はボタンの `onClick` から同期的に呼ばれるためこの条件を満たす。

**`recenter` 関数:**
- `orientation` モード時のみ有効
- 現在のジャイロ alpha 値をオフセットとして保存し、以降の回転計算でその値を引く
- 詳細は `useDeviceOrientation.ts` のセクション参照

**バックグラウンド復帰:**
- `useCamera.ts` の既存ロジック（visibilitychange）をそのまま活用する
- `useARMode` は内部で `useCamera` を呼び出す（委譲パターン）

**エラーハンドリング:**

| ケース | 処理 |
|---|---|
| getUserMedia 失敗 | error 状態に遷移（既存の useCamera と同じメッセージ） |
| ジャイロ権限拒否（iOS） | `orientation` → `overlay` にフォールバック（エラーにはしない） |
| WebXR セッション開始失敗 | `orientation` or `overlay` にフォールバック |

---

### 7.2 `src/hooks/useDeviceOrientation.ts`【新規】

**責務:** DeviceOrientationEvent からジャイロデータを取得し、Three.js用のQuaternionを提供する

**型定義:**
```ts
import { Quaternion } from 'three'

interface DeviceOrientationData {
  alpha: number  // Z軸回転（コンパス方位）0〜360
  beta: number   // X軸回転（前後の傾き）-180〜180
  gamma: number  // Y軸回転（左右の傾き）-90〜90
}

interface UseDeviceOrientationReturn {
  quaternion: Quaternion        // Three.jsカメラに適用するクォータニオン
  hasData: boolean              // ジャイロデータが受信されたか
  recenter: () => void          // 現在の向きを正面にリセット
}
```

**実装仕様:**

```ts
import { useRef, useEffect, useCallback } from 'react'
import { Quaternion, Euler, MathUtils, Vector3 } from 'three'

// 事前計算定数
const ZAxis = new Vector3(0, 0, 1)
const q1 = new Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)) // -90° X軸回転

// 作業用オブジェクト（毎フレームのアロケーション回避）
const _euler = new Euler()
const _q0 = new Quaternion()

export function useDeviceOrientation(): UseDeviceOrientationReturn {
  const quaternionRef = useRef(new Quaternion())
  const hasDataRef = useRef(false)
  const alphaOffsetRef = useRef<number | null>(null) // recenter用
  const latestDataRef = useRef<DeviceOrientationData | null>(null)

  useEffect(() => {
    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (event.alpha == null || event.beta == null || event.gamma == null) return

      hasDataRef.current = true
      latestDataRef.current = {
        alpha: event.alpha,
        beta: event.beta,
        gamma: event.gamma,
      }

      // 初回データ受信時に自動リセンター
      if (alphaOffsetRef.current === null) {
        alphaOffsetRef.current = event.alpha
      }

      const alpha = event.alpha - (alphaOffsetRef.current ?? 0)
      const beta = event.beta
      const gamma = event.gamma

      setQuaternionFromOrientation(
        quaternionRef.current,
        alpha,
        beta,
        gamma,
        getScreenOrientation(),
      )
    }

    window.addEventListener('deviceorientation', handleOrientation)
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation)
    }
  }, [])

  const recenter = useCallback(() => {
    if (latestDataRef.current) {
      alphaOffsetRef.current = latestDataRef.current.alpha
    }
  }, [])

  return {
    quaternion: quaternionRef.current,
    hasData: hasDataRef.current,
    recenter,
  }
}
```

**クォータニオン変換（核心部分）:**

```ts
function setQuaternionFromOrientation(
  target: Quaternion,
  alpha: number, // degrees, recentered
  beta: number,  // degrees
  gamma: number, // degrees
  screenOrientation: number, // degrees (0, 90, 180, 270)
): void {
  // 1. デバイスのオイラー角をラジアンに変換
  const alphaRad = MathUtils.degToRad(alpha)
  const betaRad = MathUtils.degToRad(beta)
  const gammaRad = MathUtils.degToRad(gamma)
  const orientRad = MathUtils.degToRad(screenOrientation)

  // 2. オイラー角 → クォータニオン
  //    'YXZ' 順: ヨー(alpha) → ピッチ(beta) → ロール(gamma)
  _euler.set(betaRad, alphaRad, -gammaRad, 'YXZ')
  target.setFromEuler(_euler)

  // 3. デバイス座標系（Z上向き）→ Three.js座標系（Y上向き）への変換
  //    スマホを垂直に持った状態を「正面を向いている」に変換する
  //    -90° のX軸回転に相当
  target.multiply(q1)

  // 4. 画面の向き（portrait / landscape）に応じた補正
  //    screen.orientation.angle が 0 でない場合（横持ち等）の対応
  target.multiply(_q0.setFromAxisAngle(ZAxis, -orientRad))
}

function getScreenOrientation(): number {
  if (screen.orientation && typeof screen.orientation.angle === 'number') {
    return screen.orientation.angle
  }
  // フォールバック（古いブラウザ）
  return 0
}
```

**変換の数学的説明:**

```
デバイスの座標系（画面が天井を向いた状態）:
  X → 右
  Y → 上（端末の長手方向）
  Z → 画面から手前（垂直上方）

Three.js の座標系:
  X → 右
  Y → 上
  Z → カメラの方向（手前）

変換:
  Step 1: euler(beta, alpha, -gamma, 'YXZ')
    → デバイスの向きをクォータニオンに変換

  Step 2: × q1 (-90° X回転)
    → デバイスが水平な状態を「正面を見上げている」にマッピングすることで、
      垂直に持った状態が「正面を向いている」になる

  Step 3: × q0 (screen orientation 補正)
    → 画面が回転している場合（横持ち等）の補正
```

**スクリーンオリエンテーション変化への対応:**
- `screen.orientation.angle` を毎回取得する（イベントリスナー不要、値の参照のみ）
- 本アプリは縦画面前提だが、正しく処理するために常に補正する

**ジャイロデータ未受信の検出:**
- `hasData` が `false` のまま1秒経過した場合、呼び出し元で `overlay` モードにフォールバック
- フォールバック判定は `WorldLockedCamera` コンポーネント側で行う

---

### 7.3 `src/components/WorldLockedCamera.tsx`【新規】

**責務:** `useDeviceOrientation` のクォータニオンを毎フレーム Three.js カメラに適用する

**Props:**
```ts
interface WorldLockedCameraProps {
  onFallbackToOverlay: () => void  // ジャイロデータが来ない場合のフォールバック通知
}
```

**実装仕様:**

```tsx
import { useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Quaternion } from 'three'
import { useDeviceOrientation } from '../hooks/useDeviceOrientation'

const SLERP_FACTOR = 0.6             // 補間の強さ（0=動かない, 1=即時追従）
const GYRO_TIMEOUT_MS = 1000          // ジャイロデータ待ちのタイムアウト
const _targetQ = new Quaternion()     // 作業用

export function WorldLockedCamera({ onFallbackToOverlay }: WorldLockedCameraProps) {
  const { camera } = useThree()
  const { quaternion: deviceQ, hasData } = useDeviceOrientation()
  const mountTimeRef = useRef(Date.now())
  const fallbackCalledRef = useRef(false)

  // カメラ位置を原点に移動（ワールドロックモード）
  useEffect(() => {
    camera.position.set(0, 0, 0)
  }, [camera])

  useFrame(() => {
    // ジャイロデータが届いていない場合
    if (!hasData) {
      if (
        !fallbackCalledRef.current &&
        Date.now() - mountTimeRef.current > GYRO_TIMEOUT_MS
      ) {
        fallbackCalledRef.current = true
        onFallbackToOverlay()
      }
      return
    }

    // SLERP補間でカメラ回転を滑らかに更新
    _targetQ.copy(deviceQ)
    camera.quaternion.slerp(_targetQ, SLERP_FACTOR)
  })

  return null // 描画要素なし（カメラ制御のみ）
}
```

**SLERP補間の根拠:**
- `SLERP_FACTOR = 0.6`: ジャイロの生データはノイズを含むため、そのまま適用すると細かいブレが生じる。SLERP補間で平滑化する。
- 0.6 は「やや即時追従寄り」のバランス。値を上げると反応が鋭くなるが、ブレも増える。
- 60fpsの場合、約3フレーム（50ms）で目標の95%に収束する計算。

**カメラ位置の変更:**
- 現在の実装: `position: [0, 0, 5]`（カメラがZ=5から原点方向を見る）
- ワールドロック時: `position: [0, 0, 0]`（カメラは原点に配置し、ジャイロで回転）
- 理由: カメラが空間の中心にあることで、全方向を見回せる

**フォールバック処理:**
- マウント後 1 秒間ジャイロデータが来ない場合、`onFallbackToOverlay` を呼ぶ
- デスクトップブラウザ等で `DeviceOrientationEvent` APIは存在するがジャイロ非搭載の場合に対応
- フォールバック通知は1回だけ呼ぶ（`fallbackCalledRef` で制御）

**`recenter` の呼び出し:**
- `useDeviceOrientation` の `recenter()` は `useARMode` フック経由で `RecenterButton` に渡す
- `WorldLockedCamera` 自身は `recenter` を呼ばない

---

### 7.4 `src/components/XRCanvas.tsx`【新規】

**責務:** WebXR immersive-ar セッションの管理と3Dシーンの描画

**実装仕様:**

```tsx
import { useRef, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { createXRStore, XR } from '@react-three/xr'
import { Lighting } from './Lighting'
import { FishSchool } from './FishSchool'

const FISH_COUNT = 8

interface XRCanvasProps {
  onSessionEnd: () => void  // XRセッション終了時の通知
}

export function XRCanvas({ onSessionEnd }: XRCanvasProps) {
  const storeRef = useRef(createXRStore())

  // マウント時に自動でARセッション開始
  useEffect(() => {
    const store = storeRef.current
    // enterAR は XR コンポーネントが Canvas 内にマウントされた後に呼ぶ
    const timer = setTimeout(() => {
      store.enterAR()
    }, 100) // Canvas の初期化を待つための最小遅延
    return () => clearTimeout(timer)
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
      <XR store={storeRef.current} onSessionEnd={onSessionEnd}>
        <Lighting />
        <FishSchool count={FISH_COUNT} worldLocked />
      </XR>
    </Canvas>
  )
}
```

**WebXR Canvas の特徴（ARCanvas との違い）:**
- `alpha: true` は不要（XRランタイムがカメラパススルーを管理）
- `camera` propは不要（XRランタイムがカメラポーズを制御）
- `<XR>` コンポーネントが Three.js の WebGLRenderer にXRセッションを接続する
- `onSessionEnd`: ユーザーがXRセッションを終了した場合、`orientation` or `overlay` にフォールバック

**XRセッション内の座標系:**
- XRセッション開始時のデバイス位置が原点
- Y軸上向き、重力方向が -Y
- 魚は原点付近の空間に配置される

**注意事項:**
- `enterAR()` はCanvasの初期化完了後に呼ぶ必要がある（`setTimeout` で対応）
- XRセッション中はブラウザが全画面表示を制御する
- `CameraBackground` コンポーネントは使用しない（XRランタイムがカメラ映像を提供）

---

### 7.5 `src/components/RecenterButton.tsx`【新規】

**責務:** ワールドロック時のリセンターボタンUI

**Props:**
```ts
interface RecenterButtonProps {
  onRecenter: () => void
}
```

**実装仕様:**

```tsx
import type { CSSProperties } from 'react'

interface RecenterButtonProps {
  onRecenter: () => void
}

const buttonStyle: CSSProperties = {
  position: 'fixed',
  bottom: '2rem',
  left: '50%',
  transform: 'translateX(-50%)',
  padding: '0.6rem 1.5rem',
  fontSize: '0.9rem',
  border: '1px solid rgba(255, 255, 255, 0.3)',
  borderRadius: '2rem',
  background: 'rgba(0, 0, 0, 0.5)',
  color: '#fff',
  cursor: 'pointer',
  touchAction: 'manipulation',
  zIndex: 2,
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
}

export function RecenterButton({ onRecenter }: RecenterButtonProps) {
  return (
    <button style={buttonStyle} onClick={onRecenter}>
      リセンター
    </button>
  )
}
```

**配置:** 画面下部中央、z-index: 2（Canvasの上）

**用途:**
- ジャイロのヨー（方位）ドリフトが蓄積した場合に、現在の向きを正面にリセットする
- iOSではジャイロのみで方位を推定するため、時間とともにヨーがずれていく
- ボタンを押すと `useDeviceOrientation.recenter()` が呼ばれ、現在の alpha 値がオフセットとして保存される

---

### 7.6 `src/App.tsx`【変更】

**変更内容:** `useCamera` → `useARMode` に置き換え、ARモード別の描画分岐を追加

**改訂版:**

```tsx
import { useARMode } from './hooks/useARMode'
import { StartScreen } from './components/StartScreen'
import { CameraBackground } from './components/CameraBackground'
import { ARCanvas } from './components/ARCanvas'
import { XRCanvas } from './components/XRCanvas'
import { RecenterButton } from './components/RecenterButton'

export default function App() {
  const { state, start, recenter, handleXRSessionEnd, handleFallbackToOverlay } = useARMode()

  if (state.status !== 'active') {
    return (
      <StartScreen
        status={state.status}
        error={state.status === 'error' ? state.error : undefined}
        onStart={start}
      />
    )
  }

  // WebXR モード
  if (state.mode === 'webxr') {
    return <XRCanvas onSessionEnd={handleXRSessionEnd} />
  }

  // Orientation / Overlay モード
  return (
    <>
      <CameraBackground stream={state.stream!} />
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

**変更点まとめ:**
- `useCamera` → `useARMode` に置き換え（useARMode が内部で useCamera を使用）
- ARモード別の3分岐レンダリング
- `orientation` モード時に `RecenterButton` を表示
- `handleXRSessionEnd`: WebXRセッション終了時に `orientation` or `overlay` にフォールバック
- `handleFallbackToOverlay`: ジャイロ未検出時の `orientation` → `overlay` フォールバック

---

### 7.7 `src/components/ARCanvas.tsx`【変更】

**変更内容:** `worldLocked` propの追加、`WorldLockedCamera` の条件付き描画

**改訂版:**

```tsx
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
```

**変更点:**
- `worldLocked` prop: `true` でジャイロカメラを有効化
- カメラ位置: `worldLocked` 時は `[0, 0, 0]`、そうでなければ `[0, 0, 5]`
- `WorldLockedCamera` コンポーネントを条件付き描画
- `onFallbackToOverlay` をパススルー

---

### 7.8 `src/components/FishSchool.tsx`【変更】

**変更内容:** `worldLocked` propを追加し、`useFishMovement` に渡す bounds を切り替え

**改訂版:**

```tsx
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
```

**変更点:**
- `worldLocked` propを追加
- `useFishMovement(count, worldLocked)` に引数を追加

---

### 7.9 `src/hooks/useFishMovement.ts`【変更】

**変更内容:** `worldLocked` パラメータに応じて境界と初期配置を切り替え

**追加する定数:**

```ts
// 現在の定数はオーバーレイモード用（名前変更のみ）
const OVERLAY_BOUNDS = {
  x: [-3, 3] as const,
  y: [-2, 2] as const,
  z: [-2, 2] as const,
}

// ワールドロック用の境界
// カメラが原点にあり、ユーザーが全方向を見回せるため、
// 魚を球体状に広く配置する
const WORLD_LOCKED_BOUNDS = {
  x: [-4, 4] as const,
  y: [-3, 3] as const,
  z: [-4, 4] as const,
}
```

**シグネチャ変更:**

```ts
export function useFishMovement(count: number, worldLocked: boolean = false): FishState[]
```

**内部での分岐:**
```ts
const bounds = worldLocked ? WORLD_LOCKED_BOUNDS : OVERLAY_BOUNDS
```

`bounds` を定数参照ではなく変数として Boids 計算に渡す。

**初期配置の変更:**

```ts
function initializeFish(count: number, worldLocked: boolean): FishState[] {
  if (worldLocked) {
    // ワールドロック: カメラ正面（-Z方向）付近に集中配置
    // ユーザーが最初に見る方向に魚がいるようにする
    return Array.from({ length: count }, () => ({
      position: [
        (Math.random() - 0.5) * 4,       // x: -2 〜 2
        (Math.random() - 0.5) * 3,       // y: -1.5 〜 1.5
        -(Math.random() * 2 + 1),        // z: -3 〜 -1（カメラ正面）
      ] as [number, number, number],
      velocity: [
        (Math.random() - 0.5) * 0.6,
        (Math.random() - 0.5) * 0.3,
        (Math.random() - 0.5) * 0.3,
      ] as [number, number, number],
    }))
  }

  // オーバーレイ: 現在の実装と同じ
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
```

**初期配置のポイント（ワールドロック）:**
- Three.js のデフォルトカメラは -Z 方向を向く
- ジャイロのリセンター（初回自動）により、AR開始時のスマホの向き = -Z 方向
- よって魚を Z: -3〜-1 に配置すれば、AR開始直後に魚が正面に見える
- Boids の境界反発により、時間とともに魚は全方向に広がっていく

---

### 7.10 `src/components/StartScreen.tsx`【変更】

変更は軽微。Props の型は変わらない（`useARMode` が `useCamera` と同じインターフェースの `start` を提供するため）。

追加の検討事項:
- `orientation` モードで起動する場合、iOSでは「モーションセンサーへのアクセスを許可してください」等のガイダンスがあると親切
- ただしMVPでは追加しない。`useARMode.start()` が内部でジャイロ権限リクエストを処理し、拒否された場合は自動的に `overlay` にフォールバックするため、ユーザーへの説明は不要

---

## 8. 座標系（モード別）

### 8.1 オーバーレイモード（既存・変更なし）

```
         Y+（上）
         │
         │            カメラ: (0, 0, 5)
         │            向き: -Z方向（原点を見る）
         └────── X+
        /
       Z+

魚の活動範囲:
  X: [-3, +3]
  Y: [-2, +2]
  Z: [-2, +2]
```

### 8.2 オリエンテーションモード

```
         Y+（上）
         │
         │     カメラ: (0, 0, 0)（原点に固定）
         │     向き: ジャイロに連動して360°回転
         └────── X+
        /
       Z+

魚の活動範囲:
  X: [-4, +4]
  Y: [-3, +3]
  Z: [-4, +4]

初期配置: Z: -3〜-1（カメラ正面の-Z方向）
```

### 8.3 WebXRモード

```
XR空間座標（ARCore/ARKit提供）:
  原点 = セッション開始時のデバイス位置
  Y+ = 上（重力の逆方向）
  スケール = 現実世界のメートル

魚の活動範囲:
  X: [-4, +4] メートル
  Y: [-3, +3] メートル
  Z: [-4, +4] メートル

→ ユーザーの周囲 約8m四方に魚が泳ぐ
```

---

## 9. レイヤー構成（モード別）

### 9.1 オーバーレイ / オリエンテーションモード（変更なし）

```
┌────────────────────────────┐  z-index: 2  ← HTML UI（RecenterButton等）
│  pointer-events: none      │     ※ ボタンのみ pointer-events: auto
├────────────────────────────┤  z-index: 1  ← R3F Canvas（背景透過）
│  gl={{ alpha: true }}      │     ※ ワールドロック時は WorldLockedCamera あり
├────────────────────────────┤  z-index: 0  ← <video>要素
│  getUserMediaのカメラ映像   │
└────────────────────────────┘
```

### 9.2 WebXRモード

```
┌────────────────────────────────────────────┐
│  ブラウザのXRランタイムが全体を管理         │
│                                            │
│  カメラパススルー映像（ARCore提供）         │
│     +                                      │
│  Three.js シーン（XRランタイムが合成）      │
│                                            │
│  ※ video要素、alpha設定、z-indexは不要      │
└────────────────────────────────────────────┘
```

---

## 10. レンダリングパイプライン（改訂版）

### 10.1 オリエンテーションモード（新規部分）

```
useFrame(_, delta)
│
├─ WorldLockedCamera:
│   ├─ useDeviceOrientation → deviceQuaternion（イベントリスナーで更新済み）
│   ├─ camera.quaternion.slerp(deviceQuaternion, 0.6)
│   └─ hasData チェック → タイムアウトでフォールバック
│
├─ useFishMovement: Boids計算（WORLD_LOCKED_BOUNDSで計算）
│   ├─ 各魚の近隣検索 (O(n²), n=8)
│   ├─ 分離・整列・結合ベクトル計算
│   ├─ 境界反発計算（拡大された境界）
│   ├─ 速度更新 & クランプ
│   └─ 位置更新
│
└─ Fish × 8: 描画更新（既存と同じ）
```

### 10.2 WebXRモード

```
XR Animation Frame
│
├─ XRランタイム:
│   ├─ カメラポーズの更新（6DoF: 回転+位置）
│   ├─ カメラパススルー映像の合成
│   └─ Three.js シーンのレンダリング
│
├─ useFishMovement: Boids計算（WORLD_LOCKED_BOUNDSで計算）
│
└─ Fish × 8: 描画更新（既存と同じ）
```

---

## 11. 権限フローの詳細

### 11.1 起動シーケンス図

```
ユーザー                    App              useARMode           ブラウザ
  │                         │                   │                  │
  │──[ボタン押下]──────────→│                   │                  │
  │                         │──start()─────────→│                  │
  │                         │                   │                  │
  │                         │                   │──detectARMode()─→│
  │                         │                   │  (WebXR判定)     │
  │                         │                   │←─ supported ─────│
  │                         │                   │                  │
  │  [WebXR対応の場合]       │                   │                  │
  │                         │←─{mode:'webxr'}───│                  │
  │                         │                   │                  │
  │  [WebXR非対応の場合]     │                   │                  │
  │                         │                   │──getUserMedia()─→│
  │←─[カメラ権限ダイアログ]──│──────────────────│──────────────────│
  │──[許可]─────────────────→│                   │←─ stream ────────│
  │                         │                   │                  │
  │                         │                   │──requestPerm()──→│ (iOS のみ)
  │←─[モーション権限ダイアログ]│─────────────────│──────────────────│
  │──[許可]─────────────────→│                   │←─ 'granted' ─────│
  │                         │                   │                  │
  │                         │←─{mode:'orientation',stream}─────────│
  │                         │                   │                  │
  │  [ジャイロ権限拒否の場合] │                   │                  │
  │                         │←─{mode:'overlay',stream}─────────────│
```

### 11.2 権限リクエストの順序（orientation モード）

1. **カメラ権限** (`getUserMedia`): 先にリクエスト。失敗した場合はエラー表示。
2. **ジャイロ権限** (`DeviceOrientationEvent.requestPermission`): カメラ成功後にリクエスト。iOS のみ。失敗しても overlay にフォールバック（エラーにはしない）。

**根拠:** カメラがないとアプリが成立しないため、カメラ権限は必須。ジャイロ権限はオプション（なくても overlay モードで動作する）。

---

## 12. エラーケースとフォールバック

| ケース | 検出方法 | 対応 |
|---|---|---|
| カメラ権限拒否 | getUserMedia → NotAllowedError | エラー画面 + リトライボタン |
| ジャイロ権限拒否（iOS） | requestPermission → 'denied' | 静かに overlay にフォールバック |
| ジャイロ非搭載 | deviceorientation イベントが1秒来ない | 静かに overlay にフォールバック |
| WebXRセッション開始失敗 | enterAR() → catch | orientation or overlay にフォールバック |
| WebXRセッション中断 | onSessionEnd コールバック | orientation or overlay に遷移 |
| ヨードリフト（方位ずれ） | ユーザーが気づく | リセンターボタンで手動修正 |
| 大きな delta | delta > 0.1 チェック | フレームスキップ（既存） |
| バックグラウンド復帰 | visibilitychange | カメラストリーム再取得（既存） |

**フォールバック方針:** ジャイロ・WebXR関連の問題は「静かなフォールバック」。ユーザーにエラーは見せず、利用可能な最良のモードに自動遷移する。カメラ関連の問題のみ「明示的エラー」としてリトライを促す。

---

## 13. パフォーマンス考慮

### 13.1 ジャイロ処理の負荷

| 処理 | 頻度 | 計算量 |
|---|---|---|
| deviceorientation イベント処理 | 60〜100 Hz | Euler→Quaternion変換（軽量） |
| クォータニオン SLERP 補間 | 60 fps (useFrame内) | Quaternion.slerp（4成分の線形補間＋正規化） |
| screen.orientation.angle 読み取り | イベントごと | プロパティ参照のみ |

**合計: 既存のBoids計算と比較して無視できるレベル。**

### 13.2 メモリ

- `useDeviceOrientation` のワーキングオブジェクト（Euler, Quaternion, Vector3）は `const` で宣言し再利用
- 毎フレームのオブジェクト生成なし

### 13.3 WebXR固有

- XRセッション中はブラウザがレンダリングパイプラインを管理するため、カメラパススルーの合成コストがある
- ただしこれはネイティブレイヤーの処理であり、JSの負荷にはならない
- GPU負荷はオーバーレイモードと同等（魚の描画のみ）

---

## 14. ファイル一覧と依存関係（改訂版）

```
index.html
  └─ src/main.tsx
       └─ src/App.tsx
            ├─ src/hooks/useARMode.ts              【新規】
            │    └─ src/hooks/useCamera.ts          (内部で使用、変更なし)
            │
            ├─ src/components/StartScreen.tsx       (変更なし)
            │
            ├─ src/components/CameraBackground.tsx  (変更なし)
            │
            ├─ src/components/RecenterButton.tsx    【新規】(外部依存なし)
            │
            ├─ src/components/XRCanvas.tsx          【新規】
            │    │  (依存: @react-three/fiber, @react-three/xr)
            │    ├─ src/components/Lighting.tsx      (変更なし)
            │    └─ src/components/FishSchool.tsx    【変更】
            │         ├─ src/hooks/useFishMovement.ts  【変更】
            │         └─ src/components/Fish.tsx        (変更なし)
            │
            └─ src/components/ARCanvas.tsx          【変更】
                 ├─ src/components/WorldLockedCamera.tsx  【新規】
                 │    └─ src/hooks/useDeviceOrientation.ts 【新規】
                 │         (依存: three の Quaternion, Euler, MathUtils, Vector3)
                 ├─ src/components/Lighting.tsx      (変更なし)
                 └─ src/components/FishSchool.tsx    【変更】
                      ├─ src/hooks/useFishMovement.ts  【変更】
                      └─ src/components/Fish.tsx        (変更なし)
```

---

## 15. 実装ステップ

### Step 1: useDeviceOrientation フックの実装

**作業内容:**
1. `src/hooks/useDeviceOrientation.ts` の新規作成
2. クォータニオン変換ロジックの実装
3. iOS 権限リクエスト処理の実装
4. recenter 機能の実装

**成果物:** ジャイロデータを Three.js クォータニオンとして取得できるフック

---

### Step 2: WorldLockedCamera の実装

**作業内容:**
1. `src/components/WorldLockedCamera.tsx` の新規作成
2. SLERP 補間によるカメラ回転制御
3. ジャイロ未検出時のフォールバック処理

**検証:** ローカルでモバイルブラウザを使い、スマホの向きに応じてカメラが回転することを確認。
開発時のローカルテストには `vite --host` + ngrok 等でHTTPS環境を用意する必要がある（getUserMediaとDeviceOrientationEventはセキュアコンテキスト必須）。

**成果物:** Canvas 内のカメラがジャイロに追従して回転する

---

### Step 3: useARMode フックと ARCanvas の改修

**作業内容:**
1. `src/hooks/useARMode.ts` の新規作成
2. `src/components/ARCanvas.tsx` に `worldLocked` prop を追加
3. `src/App.tsx` のレンダリング分岐を改修
4. `src/components/RecenterButton.tsx` の新規作成

**成果物:** ARモードの自動検出とフォールバックが動作する

---

### Step 4: useFishMovement の境界パラメータ化

**作業内容:**
1. `src/hooks/useFishMovement.ts` に `worldLocked` パラメータを追加
2. `WORLD_LOCKED_BOUNDS` と `OVERLAY_BOUNDS` の定義
3. 初期配置の条件分岐（カメラ正面配置）
4. `src/components/FishSchool.tsx` に `worldLocked` prop を追加

**成果物:** ワールドロック時は魚が広い3D空間を泳ぎ、カメラ正面付近から開始される

---

### Step 5: WebXR 対応（XRCanvas）

**作業内容:**
1. `@react-three/xr` のインストール
2. `src/components/XRCanvas.tsx` の新規作成
3. `useARMode` の WebXR 検出・起動ロジック
4. XR セッション終了時のフォールバック処理

**検証:** Android Chrome + ARCore 対応端末で immersive-ar セッションが開始し、魚が空間に配置されることを確認。

**成果物:** Android Chrome で6DoF AR が動作する

---

### Step 6: 統合テスト・仕上げ

**作業内容:**
1. iOS Safari でのオリエンテーションモード動作確認
2. Android Chrome での WebXR モード動作確認
3. デスクトップブラウザでのオーバーレイモード動作確認
4. フォールバック遷移の確認（ジャイロ非搭載→overlay、XR終了→orientation）
5. GitHub Pages にデプロイして実機テスト

**テストマトリクス:**

| デバイス | ブラウザ | 期待モード | テスト項目 |
|---|---|---|---|
| iPhone | Safari | orientation | ジャイロ権限ダイアログ、カメラ回転、リセンター |
| Android (ARCore対応) | Chrome | webxr | 6DoF追跡、XRセッション終了→フォールバック |
| Android (ARCore非対応) | Chrome | orientation | ジャイロカメラ回転 |
| デスクトップ | Chrome/Safari | overlay | 現在の動作と同じ |

**成果物:** 全プラットフォームで最適な体験が自動選択される
