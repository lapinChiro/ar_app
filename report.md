# AR ワールドロック（空間固定）実現方法の調査レポート

## 現状の問題

現在の実装では、3Dの魚はThree.jsのカメラ空間に固定されている。
スマホを動かしてもカメラ映像だけが動き、魚は画面に貼り付いたまま動かない。

**目指す動作:**
- スマホを左に向けると、魚は右方向に流れていく（実空間に固定されている）
- 魚を追いかけてカメラを動かすと、魚を捉え続けられる
- 魚の裏側に回り込むと、裏面が見える

---

## 調査した5つのアプローチ

### 1. DeviceOrientationEvent API（ジャイロスコープ）

**概要:** スマホのジャイロスコープ・加速度センサーから端末の向き（回転）を取得し、Three.jsカメラの回転に反映する。

**仕組み:**
- `deviceorientation` イベントで3つの角度を取得:
  - `alpha`: Z軸回転（コンパス方位）0〜360度
  - `beta`: X軸回転（前後の傾き）-180〜180度。スマホを縦に持つと約90度
  - `gamma`: Y軸回転（左右の傾き）-90〜90度
- これらをクォータニオンに変換し、Three.jsカメラの回転に適用
- スマホを動かすと、3D空間のカメラも連動して回転する → 魚が空間に固定される

**対応プラットフォーム:**
| プラットフォーム | 対応状況 | 備考 |
|---|---|---|
| iOS Safari | 対応 | iOS 13+ で権限リクエスト必須（ボタン押下時に呼ぶ） |
| Android Chrome | 対応 | 権限リクエスト不要、自動的に利用可能 |

**iOS の権限リクエスト:**
```ts
// iOS 13+ では DeviceOrientationEvent.requestPermission() を
// ユーザージェスチャー（ボタンクリック）のハンドラ内で呼ぶ必要がある
const result = await DeviceOrientationEvent.requestPermission()
// result === 'granted' で利用可能
```

**座標系変換のポイント:**
- デバイスの座標系（Z軸上向き）とThree.jsの座標系（Y軸上向き）が異なる
- オイラー角のままだとジンバルロック（スマホを垂直に持つとき）が発生する
- **クォータニオン**による回転表現が必須
- `euler.set(beta, alpha, -gamma, 'YXZ')` + 2つの補正クォータニオンで変換

**ドリフト（角度のずれ）:**
- pitch/roll（上下左右の傾き）: 加速度センサーの重力検出で補正されるためドリフトなし
- yaw（コンパス方位）: iOSではジャイロのみで積分するため**時間とともにずれる**
- 対策: 「リセンター」ボタンで現在の向きを基準にリセット可能

**実現できること / できないこと:**
| 動作 | 実現可否 |
|---|---|
| スマホを左右に向ける → 魚が空間に固定 | **可能** |
| スマホを上下に傾ける → 魚が空間に固定 | **可能** |
| スマホを回転 → 魚の向きが安定 | **可能** |
| スマホを持って歩く → 魚に近づく/遠ざかる | **不可能**（位置追跡なし） |
| 魚の裏に回り込む（歩いて） | **不可能**（位置追跡なし） |

**評価:** 回転追跡のみ（3DoF）だが、iOS/Android両対応で実装が軽量。カジュアルなAR体験には十分。

---

### 2. DeviceMotionEvent API（加速度センサーによる位置追跡）

**概要:** 加速度センサーの値を二重積分して位置（移動量）を推定する。

**結論: 実用的ではない。**

- 加速度 → 速度（1回目の積分） → 位置（2回目の積分）と計算する
- センサーのノイズ（±0.01〜0.05 m/s²）が積分で増幅される
- 10秒間で**数メートル**の誤差が蓄積する
- 静止状態でもセンサーノイズにより位置が勝手にドリフトする

**評価:** AR の位置追跡には使えない。シェイク検出等の粗い動作検知にのみ有用。

---

### 3. WebXR（immersive-ar）

**概要:** ブラウザのWebXR APIでARCore/ARKitの6DoFトラッキングを利用する。

**対応状況:**
| プラットフォーム | 対応状況 |
|---|---|
| Android Chrome + ARCore | **完全対応** |
| iOS Safari | **非対応**（2026年2月現在） |

**提供機能:**
- **6DoF追跡**: 回転 + 位置の両方を追跡。歩き回っても魚が空間に固定される
- **ヒットテスト**: 現実の面にレイキャストして魚を配置可能
- **平面検出**: 床・壁を検出
- **アンカー**: 特定の現実空間位置にオブジェクトを固定

**@react-three/xr での統合:**
```tsx
import { createXRStore, XR } from '@react-three/xr'
const xrStore = createXRStore()
// <XR store={xrStore}> 内でARコンテンツを配置
```

**評価:** 最高品質のAR体験だが、iOS非対応が致命的。Android限定なら最善の選択。

---

### 4. ビジュアルSLAM（JavaScript実装）

**概要:** カメラ映像をフレーム間で解析し、端末の位置・回転を推定する。

**主なライブラリ:**

| ライブラリ | 方式 | ライセンス | 評価 |
|---|---|---|---|
| AlvaAR | WebAssembly (OV²SLAM + ORB-SLAM2) | GPLv3 | 研究レベル、モバイル性能に懸念 |
| 8th Wall | 商用SLAM | 有償（**2026年2月末にサービス終了**） | 品質は高いが選択不可 |

**AlvaAR の課題:**
- 初期化が不安定（カメラを動かしてキーフレームを確立する必要がある）
- CPU上で特徴点抽出（GPU非使用）のためモバイルでの性能が不明確
- GPLv3ライセンス（コピレフト）

**評価:** iOS で6DoFを実現する唯一のオープンソース手段だが、品質・ライセンス面で現時点では推奨しない。

---

### 5. アプローチの組み合わせ（推奨）

**比較表:**

| 能力 | DeviceOrientation | WebXR (Android) | SLAM (AlvaAR) |
|---|---|---|---|
| 回転追跡 (3DoF) | 良好 | 良好 | 良好 |
| 位置追跡 (6DoF) | **不可** | 良好 | 不安定 |
| iOS対応 | 対応 | 非対応 | 対応 (GPLv3) |
| Android対応 | 対応 | 対応 (ARCore) | 対応 |
| 電池/CPU負荷 | 最小 | 中程度 | 高い |
| 実装難易度 | 低い | 中程度 | 高い |

---

## 推奨する実装戦略

### Phase 1（今回実装）: DeviceOrientationEvent による回転追跡

- ジャイロスコープでスマホの向きを検出し、Three.jsカメラの回転に反映
- iOS / Android 両対応
- 魚が空間に固定され、スマホを向けた方向に応じて見え方が変わる
- 位置追跡はないが、「見回す」体験としては十分

**実装方法:**
1. `useDeviceOrientation` フック: ジャイロデータの取得 + iOS権限リクエスト
2. `WorldLockedCamera` コンポーネント: 毎フレーム、ジャイロデータをクォータニオンに変換し、Three.jsカメラに適用（SLERP補間で滑らかに）
3. StartScreenの開始ボタンで、カメラ権限とジャイロ権限を同時にリクエスト

**クォータニオン変換の核心部分:**
```ts
const q1 = new Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)) // -90° X軸補正

function deviceOrientationToQuaternion(out, alpha, beta, gamma, screenOrient) {
  euler.set(betaRad, alphaRad, -gammaRad, 'YXZ')
  out.setFromEuler(euler)
  out.multiply(q1)                                    // スマホ直立補正
  out.multiply(q0.setFromAxisAngle(zAxis, -orientRad)) // 画面回転補正
}
```

### Phase 2（将来の拡張）: WebXR によるプログレッシブエンハンスメント

- `navigator.xr.isSessionSupported('immersive-ar')` で判定
- Android Chrome: WebXR で6DoF（位置追跡あり、歩き回れる）
- iOS: Phase 1 のジャイロ方式にフォールバック

### Phase 3（将来の拡張）: ビジュアルSLAM

- iOS で6DoFが必要になった場合にAlvaAR等を検討
- ライセンス・品質面の課題が解決されてから

---

## 補足: drei の DeviceOrientationControls

`@react-three/drei` (10.7.7) には `<DeviceOrientationControls />` コンポーネントが含まれている。
これは `three-stdlib` の実装をラップしたもので、Canvas内に配置するだけでカメラがジャイロに追従する。

ただし、iOS の権限リクエストは自動では行われないため、
コンポーネントをマウントする前に `DeviceOrientationEvent.requestPermission()` を呼ぶ必要がある。

また、SLERP補間（スムージング）のパラメータ制御ができないため、
より細かい制御が必要な場合は自前の `WorldLockedCamera` コンポーネントを実装する方が良い。
