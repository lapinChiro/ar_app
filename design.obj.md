# AR 海底世界オブジェクト改善 - 開発用設計書

## 1. 概要・目標

`report.obj.md` の推奨案 C に基づき、MindAR 画像トラッキングモードのシーンを
「マーカーの上に小さな海底世界が出現する」体験に改善する。

**ゴール:**
- プリミティブ魚 → GLTF ローポリ魚モデルに置き換え、一目で「魚」とわかるようにする
- マーカー面（Y=0）から揺れる海藻が生え、「海底」の世界観を成立させる
- 泡パーティクルで水中の空気感を演出する
- マーカー検出時にスケール 0→1 のイージングで「湧き出る」出現アニメーションを追加する

**変更しないもの:**
- Boid シミュレーションのロジック（`updateBoids`, `initializeFish`, 定数群）
- フリーAR モード（R3F 版 Fish.tsx, FishSchool.tsx）
- useARMode.ts, StartScreen.tsx, App.tsx

---

## 2. 変更対象ファイル

| ファイル | 操作 | 概要 |
|---------|------|------|
| `src/components/MindARCanvas.tsx` | **変更** | 魚生成を GLTF に、海藻・泡・出現アニメ追加 |
| `public/models/fish.glb` | **新規** | ローポリ魚 GLTF モデル |

**変更 1 ファイル、新規 1 ファイルのみ。** 他のファイルへの影響なし。

---

## 3. 構成要素の詳細設計

### 3.1 GLTF 魚モデル

#### モデル選定基準

| 基準 | 要件 |
|------|------|
| ポリゴン数 | 1 モデルあたり 500-2,000 tri 以下 |
| ファイルサイズ | GLB 全体で 500KB 以下 |
| ライセンス | CC0 または CC BY（アトリビューション可） |
| テクスチャ | なし or 1枚 (256x256 以下) が理想。頂点カラーまたは単色でもよい |
| アニメーション | なくてよい（Boid で位置・回転を制御するため） |

#### モデル入手方法

1. **Poly.pizza** で "fish low poly" を検索 → GLB を直接ダウンロード
2. **Sketchfab** で CC ライセンスの魚モデルを検索 → GLTF でダウンロード
3. ダウンロードした `.glb` を `public/models/fish.glb` に配置

**フォールバック:** モデルが見つからない/ロードに失敗した場合は、
既存の `createFishMesh()` をフォールバックとして残す。

#### GLTFLoader の利用

```typescript
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const loader = new GLTFLoader()

function loadFishModel(): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    loader.load(
      `${import.meta.env.BASE_URL}models/fish.glb`,
      (gltf) => resolve(gltf.scene),
      undefined,
      reject,
    )
  })
}
```

**注意:** `GLTFLoader` は `three/examples/jsm/` からの import。
Three.js v0.183 で正常に利用可能。追加パッケージ不要。

#### 魚の複製とカラーバリエーション

1 つの GLTF モデルをロードし、`clone()` で 8 匹分を複製する。
カラーバリエーションはマテリアルの `color` を上書きして実現する。

```typescript
const template = await loadFishModel()

const fishMeshes = fishStates.map((_, i) => {
  const clone = template.clone()
  const scale = 0.05 + Math.random() * 0.03
  clone.scale.setScalar(scale)

  // カラーバリエーション: マテリアルの色を上書き
  const color = new THREE.Color(FISH_COLORS[i % FISH_COLORS.length])
  clone.traverse((child) => {
    if (child instanceof THREE.Mesh && child.material) {
      child.material = child.material.clone() // 共有マテリアルを個別化
      child.material.color = color
    }
  })

  return clone
})
```

#### GLTF モデルの向き調整

GLTF モデルの向きは作成者によって異なる。
現在の `updateFishMeshes()` は X+ 方向を正面として `rotation.y = -atan2(vz, vx)` で回転する。
モデルの正面方向が X+ でない場合、ラッパー Group で補正する。

```typescript
// モデルの正面が Z+ の場合の例
const wrapper = new THREE.Group()
const model = template.clone()
model.rotation.y = -Math.PI / 2  // Z+ → X+ に回転
wrapper.add(model)
// wrapper を fishMeshes に格納し、updateFishMeshes で wrapper の位置・回転を操作
```

実際のモデルを見て調整する。定数 `MODEL_ROTATION_Y` として切り出す。

---

### 3.2 揺れる海藻（プロシージャル生成）

#### 設計方針

- マーカー面（Y=0）から上に向かって生やす
- `TubeGeometry` + `CatmullRomCurve3` で茎を生成
- 高さに応じた sin 波揺れを `onBeforeRender` で適用（頂点シェーダーではなく JS 側で頂点操作）
- 5-8 本をランダムな位置・高さ・色で配置

#### 定数

```typescript
const SEAWEED_COUNT = 6
const SEAWEED_COLORS = ['#2d8a4e', '#3cb371', '#228b22', '#1a6b3c']
const SEAWEED_HEIGHT_MIN = 0.15
const SEAWEED_HEIGHT_MAX = 0.35
const SEAWEED_RADIUS = 0.005       // 茎の太さ
const SEAWEED_SEGMENTS = 12        // 曲線の分割数
const SEAWEED_SWAY_SPEED = 2.0     // 揺れの速度
const SEAWEED_SWAY_AMOUNT = 0.03   // 揺れの最大振幅
```

#### 海藻の生成

```typescript
interface SeaweedState {
  mesh: THREE.Mesh
  basePositions: Float32Array  // 揺れ前の頂点位置を保持
  phaseOffset: number          // 各海藻の揺れ位相オフセット
}

function createSeaweed(
  x: number,
  z: number,
  height: number,
  color: string,
): SeaweedState {
  // 制御点: 根元(0,0,0) → 先端(0,height,0)、途中で微妙にカーブ
  const points = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.01, height * 0.33, 0),
    new THREE.Vector3(-0.01, height * 0.66, 0),
    new THREE.Vector3(0.005, height, 0),
  ]
  const curve = new THREE.CatmullRomCurve3(points)
  const geometry = new THREE.TubeGeometry(
    curve, SEAWEED_SEGMENTS, SEAWEED_RADIUS, 5, false,
  )

  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.8,
    metalness: 0.0,
    side: THREE.DoubleSide,
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(x, 0, z)

  // 揺れアニメーション用に元の頂点位置を保存
  const basePositions = new Float32Array(
    geometry.attributes.position.array,
  )

  return {
    mesh,
    basePositions,
    phaseOffset: Math.random() * Math.PI * 2,
  }
}
```

#### 海藻の配置

マーカー領域（X: -0.5〜0.5, Z: -0.3〜0.1）の端寄り（海底の縁）に配置。
魚の遊泳領域と重ならないように、境界付近に配置する。

```typescript
function createSeaweeds(): SeaweedState[] {
  const seaweeds: SeaweedState[] = []
  for (let i = 0; i < SEAWEED_COUNT; i++) {
    const angle = (i / SEAWEED_COUNT) * Math.PI * 2
    const radius = 0.35 + Math.random() * 0.15
    const x = Math.cos(angle) * radius
    const z = Math.sin(angle) * radius * 0.5 - 0.15
    const height = SEAWEED_HEIGHT_MIN +
      Math.random() * (SEAWEED_HEIGHT_MAX - SEAWEED_HEIGHT_MIN)
    const color = SEAWEED_COLORS[i % SEAWEED_COLORS.length]
    seaweeds.push(createSeaweed(x, z, height, color))
  }
  return seaweeds
}
```

#### 揺れアニメーション

毎フレーム、頂点の Y 座標（高さ）に応じた sin 波で X, Z を揺らす。
根元（Y=0）は動かず、先端ほど大きく揺れる。

```typescript
function updateSeaweeds(seaweeds: SeaweedState[], time: number): void {
  for (const sw of seaweeds) {
    const positions = sw.mesh.geometry.attributes.position
    const base = sw.basePositions

    for (let i = 0; i < positions.count; i++) {
      const baseX = base[i * 3]
      const baseY = base[i * 3 + 1]
      const baseZ = base[i * 3 + 2]

      // 高さに比例した揺れ（根元は 0、先端ほど大きい）
      const heightRatio = baseY / SEAWEED_HEIGHT_MAX
      const sway = Math.sin(time * SEAWEED_SWAY_SPEED + sw.phaseOffset + baseY * 8)
        * heightRatio * SEAWEED_SWAY_AMOUNT

      positions.setXYZ(i, baseX + sway, baseY, baseZ + sway * 0.3)
    }

    positions.needsUpdate = true
  }
}
```

**パフォーマンス:** 海藻 6 本 × 各 12 セグメント × 5 円周 ≒ 360 頂点程度。
`needsUpdate = true` のコストは極めて低い。

---

### 3.3 泡パーティクル

#### 設計方針

- `THREE.Points` で 200 個の半透明パーティクルを描画
- 海藻の根元付近からランダムに発生し、ゆっくり上昇
- 上端に達したらリセット（ループ）
- AdditiveBlending で淡く光る

#### 定数

```typescript
const BUBBLE_COUNT = 200
const BUBBLE_AREA = { x: [-0.5, 0.5], z: [-0.3, 0.1] }
const BUBBLE_Y_MIN = 0.0
const BUBBLE_Y_MAX = 0.6
const BUBBLE_RISE_SPEED = 0.03  // 上昇速度（単位/秒）
const BUBBLE_SIZE = 0.008
```

#### 泡の生成

```typescript
interface BubbleSystem {
  points: THREE.Points
  velocities: Float32Array  // 各パーティクルの上昇速度
}

function createBubbles(): BubbleSystem {
  const positions = new Float32Array(BUBBLE_COUNT * 3)
  const velocities = new Float32Array(BUBBLE_COUNT)

  for (let i = 0; i < BUBBLE_COUNT; i++) {
    positions[i * 3] = BUBBLE_AREA.x[0] +
      Math.random() * (BUBBLE_AREA.x[1] - BUBBLE_AREA.x[0])
    positions[i * 3 + 1] = BUBBLE_Y_MIN +
      Math.random() * (BUBBLE_Y_MAX - BUBBLE_Y_MIN)
    positions[i * 3 + 2] = BUBBLE_AREA.z[0] +
      Math.random() * (BUBBLE_AREA.z[1] - BUBBLE_AREA.z[0])
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
```

#### 泡の更新

```typescript
function updateBubbles(bubbles: BubbleSystem, delta: number): void {
  const positions = bubbles.points.geometry.attributes.position
  const arr = positions.array as Float32Array

  for (let i = 0; i < BUBBLE_COUNT; i++) {
    const yi = i * 3 + 1
    arr[yi] += bubbles.velocities[i] * delta

    // 横方向の微揺れ
    arr[i * 3] += Math.sin(arr[yi] * 20 + i) * 0.0002

    // 上端を超えたら下にリセット
    if (arr[yi] > BUBBLE_Y_MAX) {
      arr[yi] = BUBBLE_Y_MIN
      arr[i * 3] = BUBBLE_AREA.x[0] +
        Math.random() * (BUBBLE_AREA.x[1] - BUBBLE_AREA.x[0])
      arr[i * 3 + 2] = BUBBLE_AREA.z[0] +
        Math.random() * (BUBBLE_AREA.z[1] - BUBBLE_AREA.z[0])
    }
  }

  positions.needsUpdate = true
}
```

**パフォーマンス:** 200 Points、AdditiveBlending、ドローコール 1 回。影響なし。

---

### 3.4 出現アニメーション

#### 設計方針

- `anchor.onTargetFound` でアニメーション開始
- `anchor.group` 全体のスケールを 0→1 にイージング（easeOutBack）
- 所要時間: 0.8 秒
- `anchor.onTargetLost` では即座にスケール 0 に戻す（再検出で再度アニメ発火）

#### 状態管理

```typescript
interface AppearAnimation {
  active: boolean
  startTime: number
  duration: number
}

const APPEAR_DURATION = 0.8

// easeOutBack: 少しバウンドして収まるイージング
function easeOutBack(t: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}
```

#### アンカーイベントとの連携

```typescript
let appearAnim: AppearAnimation = {
  active: false, startTime: 0, duration: APPEAR_DURATION,
}

anchor.group.scale.setScalar(0) // 初期状態: 非表示

anchor.onTargetFound = () => {
  appearAnim = {
    active: true,
    startTime: performance.now() / 1000,
    duration: APPEAR_DURATION,
  }
  if (!cancelled) setTargetFoundRef.current(true)
}

anchor.onTargetLost = () => {
  anchor.group.scale.setScalar(0) // 即座に消す
  appearAnim.active = false
  if (!cancelled) setTargetFoundRef.current(false)
}
```

#### アニメーションループ内での更新

```typescript
// renderer.setAnimationLoop 内:
const elapsed = now / 1000

if (appearAnim.active) {
  const progress = Math.min(
    (elapsed - appearAnim.startTime) / appearAnim.duration,
    1,
  )
  const scale = easeOutBack(progress)
  anchor.group.scale.setScalar(scale)
  if (progress >= 1) {
    appearAnim.active = false
  }
}
```

---

## 4. MindARCanvas.tsx の変更設計

### 4.1 変更箇所の概要

| セクション | 変更内容 |
|-----------|---------|
| import | `GLTFLoader` を追加 |
| 定数 | 海藻・泡・出現アニメの定数を追加 |
| 型 | `SeaweedState`, `BubbleSystem`, `AppearAnimation` を追加 |
| 魚メッシュ生成 | `createFishMesh()` → `loadFishModel()` + `clone()` に変更 |
| 新規関数 | `createSeaweed()`, `createSeaweeds()`, `updateSeaweeds()` |
| 新規関数 | `createBubbles()`, `updateBubbles()` |
| 新規関数 | `easeOutBack()` |
| setup() 内 | GLTF ロード → 海藻生成 → 泡生成 → 出現アニメ設定 |
| アニメーションループ | 出現アニメ更新 + 海藻更新 + 泡更新を追加 |

### 4.2 変更しないもの

| セクション | 理由 |
|-----------|------|
| `FishState` 型 | 変更不要 |
| `initializeFish()` | 変更不要 |
| `fishDist()` | 変更不要 |
| `clampSpeed()` | 変更不要 |
| `updateBoids()` | 変更不要 |
| `updateFishMeshes()` | 基本ロジックは同じ。tail アニメ部分のみ調整が必要な場合あり |
| コンポーネント JSX | 変更不要 |
| スタイル | 変更不要 |

### 4.3 setup() 内の処理フロー（変更後）

```
MindARThree インスタンス生成
  ↓
ライティング追加
  ↓
アンカー追加
  ↓
★ GLTF 魚モデルをロード（非同期）
  ↓
  ├── 成功: clone() × 8 でカラーバリエーション生成
  └── 失敗: createFishMesh() でフォールバック
  ↓
魚メッシュを anchor.group に追加
  ↓
★ 海藻を生成 → anchor.group に追加
  ↓
★ 泡パーティクルを生成 → anchor.group に追加
  ↓
★ anchor.group.scale.setScalar(0)  // 初期非表示
  ↓
★ onTargetFound: 出現アニメ開始
★ onTargetLost:  即座に scale=0
  ↓
MindARThree.start()
  ↓
アニメーションループ開始
  毎フレーム:
  ├── ★ 出現アニメーション更新
  ├── updateBoids()
  ├── updateFishMeshes()
  ├── ★ updateSeaweeds(time)
  ├── ★ updateBubbles(delta)
  └── renderer.render()
```

★ = 今回追加する部分

### 4.4 updateFishMeshes の調整

GLTF モデルを使う場合、モデル内に `tail` という名前のオブジェクトがない可能性がある。
尾びれアニメーション部分を条件付きにする（既存通り `getObjectByName('tail')` で null チェック済みなので変更不要）。

ただし GLTF モデルの正面方向が X+ でない場合のために、
ラッパー Group 方式で回転オフセットを適用する:

```typescript
// GLTF モデルの正面方向の補正（モデルに応じて調整）
const MODEL_FORWARD_ROTATION_Y = 0 // モデルが X+ 正面なら 0
```

---

## 5. ファイル配置

### 変更後のファイル構成

```
public/
  models/
    fish.glb            ← 新規: ローポリ魚モデル
  targets.mind          ← 既存（変更なし）
  target-image.jpg      ← 既存（変更なし）

src/
  components/
    MindARCanvas.tsx     ← 変更
    TargetGuide.tsx      ← 既存（変更なし）
    Fish.tsx             ← 既存（変更なし、R3F 版）
    ...
```

---

## 6. パフォーマンス見積もり

| 要素 | ドローコール | ポリゴン数 | 備考 |
|------|-----------|----------|------|
| GLTF 魚 × 8 | 8 | ~8,000 (1,000/匹) | マテリアル個別化のため結合不可 |
| 海藻 × 6 | 6 | ~360 (60/本) | 毎フレーム頂点更新 |
| 泡パーティクル | 1 | 200 (点) | AdditiveBlending |
| ライト (Ambient + Dir) | 0 | 0 | - |
| **合計** | **15** | **~8,560** | 目標 100 / 50,000 に対し余裕 |

**モバイルでの FPS 予測:** 60fps（余裕あり）

---

## 7. エッジケースと対処

| ケース | 対処 |
|--------|------|
| GLTF ロード失敗（ネットワークエラー等） | `createFishMesh()` でフォールバック |
| GLTF モデルの正面方向が不明 | `MODEL_FORWARD_ROTATION_Y` 定数で調整 |
| GLTF モデルのスケールが想定外 | ロード後にバウンディングボックスを計算し正規化 |
| 海藻が魚の遊泳領域と重なる | 海藻は境界付近（半径 0.35-0.5）に配置、魚は中心で泳ぐ |
| マーカーの高速な検出/ロスト繰り返し | 出現アニメは毎回 0 からスタートで問題なし |

---

## 8. GLTF モデルの正規化

ダウンロードしたモデルのサイズ・位置がバラバラの可能性があるため、
ロード後にバウンディングボックスで正規化する。

```typescript
function normalizeModel(model: THREE.Group): void {
  const box = new THREE.Box3().setFromObject(model)
  const size = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z)

  // 最大寸法が 1 になるようスケール
  if (maxDim > 0) {
    model.scale.multiplyScalar(1 / maxDim)
  }

  // 中心をオフセット（原点に合わせる）
  const center = box.getCenter(new THREE.Vector3())
  model.position.sub(center.multiplyScalar(1 / maxDim))
}
```

これにより、どんなモデルでも「1 単位に収まるサイズ、原点中心」に統一される。
その上で `fishMesh.scale.setScalar(0.05 + random * 0.03)` で最終サイズを決定する。

---

## 9. 実装手順チェックリスト

1. [ ] Poly.pizza / Sketchfab からローポリ魚モデル（GLB）を入手
2. [ ] `public/models/fish.glb` に配置
3. [ ] `MindARCanvas.tsx` に `GLTFLoader` の import を追加
4. [ ] `loadFishModel()` + `normalizeModel()` を実装
5. [ ] `createFishMesh()` をフォールバックとして残しつつ、GLTF 優先に変更
6. [ ] 海藻の定数・型・生成関数 (`createSeaweed`, `createSeaweeds`) を追加
7. [ ] 海藻の揺れ更新関数 (`updateSeaweeds`) を追加
8. [ ] 泡パーティクルの定数・型・生成関数 (`createBubbles`) を追加
9. [ ] 泡の更新関数 (`updateBubbles`) を追加
10. [ ] 出現アニメーション (`easeOutBack`, `AppearAnimation`) を追加
11. [ ] `setup()` 内で GLTF ロード → 海藻生成 → 泡生成 → 出現アニメ設定
12. [ ] アニメーションループに海藻・泡・出現アニメの更新を追加
13. [ ] PC ブラウザで動作確認（魚の向き、海藻の揺れ、泡の動き、出現アニメ）
14. [ ] モバイル（iOS Safari / Android Chrome）での FPS 確認
15. [ ] ビルド確認 (`npm run build`)
