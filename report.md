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

---
---

# GPS + コンパスによるロケーションベースAR 技術調査レポート

GPS座標とコンパス方位を使い、現実世界の緯度・経度にARオブジェクトを配置するアプローチの技術調査。

---

## 1. Web Geolocation API: 精度・プラットフォーム差・更新頻度

### 基本API

```js
// 一度だけ位置を取得
navigator.geolocation.getCurrentPosition(successCb, errorCb, options);

// 継続的に位置を監視
const watchId = navigator.geolocation.watchPosition(successCb, errorCb, options);

// 監視を停止
navigator.geolocation.clearWatch(watchId);
```

### オプション設定

```js
const options = {
  enableHighAccuracy: true,  // GPS使用を要求（trueでないとWiFi/セルのみになりうる）
  maximumAge: 0,             // キャッシュされた位置を使わない（0 = 常に新規取得）
  timeout: 10000             // 10秒でタイムアウト
};
```

| オプション | 説明 | AR推奨値 |
|---|---|---|
| `enableHighAccuracy` | GPSチップの使用を要求 | `true`（必須） |
| `maximumAge` | キャッシュ位置の最大許容年齢(ms) | `0`（常にリアルタイム） |
| `timeout` | 位置取得のタイムアウト(ms) | `5000`〜`10000` |

### コールバックで得られるデータ

```js
function successCb(position) {
  const { latitude, longitude, accuracy,
          altitude, altitudeAccuracy,
          heading, speed } = position.coords;
  const timestamp = position.timestamp;
}
```

- `accuracy`: 緯度・経度の95%信頼区間（メートル）
- `heading`: 移動方向（北から時計回りの度数）。**静止時はnull**（コンパスではない）
- `speed`: 移動速度（m/s）。静止時はnull

### iOS Safari vs Android Chrome の精度差

| 条件 | iOS Safari | Android Chrome |
|---|---|---|
| 屋外・開けた場所 | 3〜10m（GPS + GLONASS） | 3〜10m（GPS + GLONASS） |
| 屋外・都市部 | 5〜15m（ビル反射で劣化） | 5〜15m（ビル反射で劣化） |
| 屋内 | 10〜40m（WiFi測位に依存） | 10〜40m（WiFi測位に依存） |
| GPS不可の場合 | WiFi + セルタワー測位 | WiFi + セルタワー + BLE測位 |

**iOS固有の問題:**
- iOS 14以降、ユーザーが「おおよその位置情報」を選択可能。この場合、精度は**数km単位**に劣化し、APIでは判別不可能
- Safari では位置情報の権限設定と `navigator.permissions.query` の結果が一致しないバグがある（Denyでも "prompt" を返す場合がある）

**Android固有の問題:**
- Android 12以降、iOS同様に「おおよその位置情報」設定あり（ただしPWAではアプリ単位で設定可能）
- HTTPSが必須（HTTPでは位置情報機能が無効化される）

### 更新頻度

`watchPosition` はイベント駆動型で、**固定の更新レート(Hz)は指定できない**。

- ブラウザが「位置が変化した」と判断した時点でコールバックが呼ばれる
- 実測では**0.5〜2秒間隔**程度（デバイスと環境に依存）
- 標準Web APIには `frequency` パラメータはない（Apache Cordovaには独自実装あり）
- `maximumAge: 0` にすることで最新データの取得を強制できる

---

## 2. DeviceOrientationEvent によるコンパス方位の取得

### プラットフォーム間の重大な違い

| プラットフォーム | alpha の意味 | コンパス方位の取得方法 |
|---|---|---|
| **Android Chrome** | `event.absolute === true` の場合、`alpha === 0` が北 | `compassHeading = (360 - event.alpha) % 360` |
| **iOS Safari** | `alpha` はデバイス初期化時の向きからの相対値（ゲームベース） | `event.webkitCompassHeading`（非標準だが唯一の手段） |

**重要:** `alpha` の解釈がiOSとAndroidで根本的に異なる。クロスプラットフォーム対応にはプラットフォーム検出が必須。

### Android Chrome でのコンパス取得

```js
// Android: deviceorientationabsolute イベントを使う（推奨）
window.addEventListener('deviceorientationabsolute', (event) => {
  // event.absolute === true が保証される
  // alpha === 0 → 北を向いている
  const compassHeading = (360 - event.alpha) % 360;
  console.log('Compass heading:', compassHeading);
});

// フォールバック: deviceorientation で event.absolute === true を確認
window.addEventListener('deviceorientation', (event) => {
  if (event.absolute) {
    const compassHeading = (360 - event.alpha) % 360;
  }
});
```

### iOS Safari でのコンパス取得

```js
// iOS 13+: ユーザージェスチャー内で権限リクエストが必須
async function requestCompassPermission() {
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      const result = await DeviceOrientationEvent.requestPermission();
      if (result === 'granted') {
        window.addEventListener('deviceorientation', handleOrientation);
      }
    } catch (err) {
      console.error('Permission denied:', err);
    }
  } else {
    // Android: 権限不要
    window.addEventListener('deviceorientation', handleOrientation);
  }
}

function handleOrientation(event) {
  let compassHeading;

  if (event.webkitCompassHeading !== undefined) {
    // iOS: webkitCompassHeading を使用（0〜360度、北=0）
    compassHeading = event.webkitCompassHeading;
  } else if (event.absolute && event.alpha !== null) {
    // Android: alpha から計算
    compassHeading = (360 - event.alpha) % 360;
  }

  // webkitCompassAccuracy: 精度（度数）。通常 ±10度
  const accuracy = event.webkitCompassAccuracy; // iOS のみ
}
```

### コンパス精度

| 条件 | 精度 |
|---|---|
| 理想的な条件（屋外、磁場干渉なし、キャリブレーション済み） | **±5〜10度** |
| 一般的な屋外使用 | **±10〜15度** |
| 屋内（金属・電子機器の近く） | **±20度以上** |
| キャリブレーション未実施 | **±30度以上も** |

- `webkitCompassAccuracy` の値は通常 **10** （±10度の偏差を意味）
- 磁場干渉源: 金属ケース、磁石、電子機器、鉄筋コンクリートの建物内
- キャリブレーション: 8の字運動でデバイスを様々な向きに動かすことでハードアイアン/ソフトアイアン誤差を補正

---

## 3. GPS座標間の方位角と距離の計算

### Haversine公式による距離計算

```js
const R = 6371e3; // 地球の半径（メートル）

function haversineDistance(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => deg * Math.PI / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const lat1Rad = toRad(lat1);
  const lat2Rad = toRad(lat2);

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1Rad) * Math.cos(lat2Rad) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // メートル単位の距離
}
```

### 方位角（Bearing）の計算

```js
function calculateBearing(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => deg * Math.PI / 180;
  const toDeg = (rad) => rad * 180 / Math.PI;

  const lat1Rad = toRad(lat1);
  const lat2Rad = toRad(lat2);
  const dLon = toRad(lon2 - lon1);

  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
            Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);

  const bearing = toDeg(Math.atan2(y, x));
  return (bearing + 360) % 360; // 0〜360度に正規化（北=0、東=90、南=180、西=270）
}
```

**注意:** Haversine公式は地球を球体と近似するため、短距離（数km以内）では十分な精度だが、
長距離ではVincenty公式（楕円体モデル）の方が正確。AR用途の近距離ではHaversineで十分。

**参照:** [Movable Type Scripts - Latitude/Longitude Calculations](https://www.movable-type.co.uk/scripts/latlong.html)

---

## 4. GPS位置をカメラビューに投影する方法

### 基本的な流れ

1. **ユーザーのGPS位置**と**対象物のGPS位置**から**方位角**と**距離**を算出
2. **コンパス方位**と**方位角の差**から画面上の水平位置を決定
3. **距離**と**FOV（視野角）**を使って奥行き・スケールを決定

### 方位角からスクリーン座標への変換

```js
function gpsToScreenPosition(userLat, userLon, targetLat, targetLon, compassHeading, fovDeg) {
  // 1. ユーザーから対象物への方位角を計算
  const bearing = calculateBearing(userLat, userLon, targetLat, targetLon);

  // 2. コンパス方位との差 = カメラ中央からの水平角度オフセット
  let angleDiff = bearing - compassHeading;
  // -180〜180度に正規化
  if (angleDiff > 180) angleDiff -= 360;
  if (angleDiff < -180) angleDiff += 360;

  // 3. 画面幅に対するX座標（-1〜1、0が中央）
  const halfFov = fovDeg / 2;
  const screenX = angleDiff / halfFov; // -1〜1 の範囲（FOV外ならはみ出す）

  // 4. 距離を計算
  const distance = haversineDistance(userLat, userLon, targetLat, targetLon);

  return {
    screenX,              // -1〜1（画面中央=0）
    isVisible: Math.abs(screenX) <= 1, // FOV内かどうか
    distance,             // メートル
    bearing,              // 度
    angleDifference: angleDiff
  };
}
```

### Three.js / WebGL での3Dワールド座標への変換

AR.js が採用する**Spherical Mercator投影**の手法:

```js
// Spherical Mercator (EPSG:3857) 投影
function lonLatToMercator(lon, lat) {
  const EARTH_RADIUS = 6378137; // WGS84 赤道半径
  const x = EARTH_RADIUS * lon * Math.PI / 180;
  const y = EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
  return { x, y };
}

// GPS座標をThree.jsワールド座標に変換（ユーザー位置を原点とする）
function gpsToWorldCoords(userLat, userLon, targetLat, targetLon) {
  const userMerc = lonLatToMercator(userLon, userLat);
  const targetMerc = lonLatToMercator(targetLon, targetLat);

  return {
    x: targetMerc.x - userMerc.x,     // 東がプラス
    y: 0,                               // 高度（簡略化のため0）
    z: -(targetMerc.y - userMerc.y)    // 北がマイナスZ（WebGL座標系）
  };
}
```

**ポイント:**
- Spherical Mercatorの単位は**メートルに近似**するため、そのままWebGLワールド座標として使用可能
- 極地付近では歪みが大きくなるが、日本の緯度（約35度）では実用上問題なし
- Z軸を反転する（northing増加方向とWebGLのZ軸が逆）

---

## 5. AR.js ロケーションベースモード

### 概要

AR.jsはロケーションベースARモードを**正式にサポート**している。元々 GeoAR.js として開発され、AR.js v3に統合された。

**3つのバリアント:**
1. `gps-camera` / `gps-entity-place` (レガシー)
2. `gps-projected-camera` / `gps-projected-entity-place` (投影版)
3. `gps-new-camera` / `gps-new-entity-place` (**推奨**, AR.js 3.4.0+)

### A-Frame 版の使用例

```html
<script src="https://aframe.io/releases/1.3.0/aframe.min.js"></script>
<script src="https://raw.githack.com/AR-js-org/AR.js/master/aframe/build/aframe-ar-nft.js"></script>

<a-scene
  vr-mode-ui="enabled: false"
  arjs="sourceType: webcam; videoTexture: true; debugUIEnabled: false;">

  <a-camera gps-new-camera="gpsMinDistance: 5"></a-camera>

  <a-entity
    gps-new-entity-place="latitude: 35.6762; longitude: 139.6503"
    scale="20 20 20"
    geometry="primitive: box"
    material="color: red">
  </a-entity>

</a-scene>
```

### Three.js 版（A-Frameなし）

AR.js 3.4.0以降、**A-Frameなしで Three.js のみでロケーションベースAR**を使用可能。

```js
import * as THREE from 'three';
import { THREEx } from 'ar-threex'; // ar-threex.mjs

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 10000);
const renderer = new THREE.WebGLRenderer({ alpha: true });

// AR.js ロケーションベースの初期化
const locationBased = new THREEx.LocationBased(scene, camera, {
  gpsMinDistance: 5,      // GPS更新の最小距離（メートル）
  gpsMinAccuracy: 100     // 許容する最小精度（メートル）
});

const webcamRenderer = new THREEx.WebcamRenderer(renderer);

// GPS座標にオブジェクトを配置
const box = new THREE.Mesh(
  new THREE.BoxGeometry(20, 20, 20),
  new THREE.MeshBasicMaterial({ color: 0xff0000 })
);
locationBased.add(box, -0.72, 51.05); // (経度, 緯度)

// GPS追跡の開始
locationBased.startGps();

// レンダリングループ
function render() {
  webcamRenderer.update();
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}
render();
```

### AR.js の内部動作

1. `LocationBased` が `watchPosition` でGPSを監視
2. GPS座標を**Spherical Mercator投影**でワールド座標に変換
3. カメラのx, z座標をGPS位置に連動して更新
4. `DeviceOrientationEvent` でカメラの回転を更新
5. 配置されたオブジェクトはワールド座標に固定されているため、カメラ移動で相対位置が変化

### AR.js の設定オプション

| オプション | デフォルト | 説明 |
|---|---|---|
| `gpsMinDistance` | 5 | GPS更新トリガーの最小移動距離(m) |
| `gpsMinAccuracy` | 100 | 許容する精度の閾値(m)。これより大きい精度はスキップ |
| `simulateLatitude` | - | テスト用の仮の緯度 |
| `simulateLongitude` | - | テスト用の仮の経度 |

**参照:** [AR.js Location-Based Documentation](https://ar-js-org.github.io/AR.js-Docs/location-based/)

---

## 6. GPSベースのWebARに使えるライブラリ・アプローチ

### ライブラリ比較

| ライブラリ/アプローチ | A-Frame依存 | Three.js対応 | GPS AR | ライセンス | 状態 |
|---|---|---|---|---|---|
| **AR.js** (location-based) | オプション | 対応 (3.4.0+) | 対応 | MIT | アクティブ |
| **GeoAR.js** | A-Frame必須 | 不可 | 対応 | MIT | AR.jsに統合済み |
| **compass.js** | なし | なし | コンパスのみ | MIT | メンテなし |
| **Hololink** | なし | なし | GPSトリガー | 商用 | サービス提供中 |
| **Google ARCore Geospatial API** | なし | なし | VPS+GPS | 無料(利用制限) | ネイティブのみ |

### 自前実装アプローチ

AR.jsを使わずに自前で実装する場合のコア技術スタック:

1. **Three.js**: 3Dレンダリング
2. **Geolocation API**: GPS座標の取得
3. **DeviceOrientationEvent**: コンパス方位 + デバイス傾き
4. **Spherical Mercator投影** または **Haversine + Bearing計算**: 座標変換
5. **getUserMedia**: カメラ映像の背景表示

自前実装の利点:
- フレームワーク依存がない
- プロジェクト固有の最適化が可能
- バンドルサイズの最小化

自前実装の欠点:
- プラットフォーム差異のハンドリングが煩雑
- GPS精度フィルタリング等の実装が必要

---

## 7. iOS Safari 固有の問題

### Geolocation API の権限

1. **HTTPS必須**: HTTPではGeolocation APIが無効化される
2. **初回アクセス時に権限ダイアログ**: "Allow" / "Don't Allow" の2択
3. **「おおよその位置情報」（iOS 14+）**: 設定 > プライバシー > 位置情報サービスで変更可能。Web APIからはこのモードを検出不可能
4. **権限状態の不一致バグ**: `navigator.permissions.query({name: 'geolocation'})` が "Deny" 設定でも "prompt" を返す場合がある
5. **一度拒否するとリセットが面倒**: Safari設定 > Webサイトデータから削除する必要がある

### コンパス / DeviceOrientation の権限

```js
// iOS 13+: 必ずユーザージェスチャー（ボタンクリック等）の中で呼ぶ
document.getElementById('startBtn').addEventListener('click', async () => {
  // 1. DeviceOrientation 権限
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    const permission = await DeviceOrientationEvent.requestPermission();
    if (permission !== 'granted') {
      alert('コンパスの権限が必要です');
      return;
    }
  }

  // 2. Geolocation 権限（getCurrentPosition/watchPositionの呼び出しで暗黙的にリクエスト）
  navigator.geolocation.getCurrentPosition(
    (pos) => { /* 成功: ARを開始 */ },
    (err) => { alert('位置情報の権限が必要です'); }
  );
});
```

**重要:** `DeviceOrientationEvent.requestPermission()` は必ず**ユーザーアクション（タップ/クリック）のイベントハンドラ内**で呼ばなければならない。ページロード時に呼ぶとエラーになる。

### コンパスキャリブレーション

- iOS は磁気コンパスの精度が低下すると自動的にキャリブレーションダイアログを表示する（ネイティブアプリ）
- **Web ブラウザではキャリブレーションダイアログが表示されない**
- ユーザーに「8の字にスマホを動かしてください」と案内するUIを自前で実装する必要がある
- 干渉源: スマホケースの金属パーツ、磁石、近くの電子機器、建物内の鉄筋

---

## 8. 実用的な精度の期待値

### GPS精度

| 環境 | 精度範囲 | 備考 |
|---|---|---|
| 屋外（見通し良好、GNSS受信良好） | **3〜5m** | 最良条件 |
| 屋外（一般的） | **5〜10m** | 典型的なスマートフォン精度 |
| 屋外（都市部、ビル谷間） | **10〜20m** | マルチパス反射で劣化 |
| 屋内（WiFi測位） | **10〜40m** | GPSほぼ不可、WiFi AP密度に依存 |
| 「おおよその位置情報」設定時 | **数km** | AR用途では使い物にならない |

### コンパス精度

| 環境 | 精度範囲 |
|---|---|
| 屋外・キャリブ済み | **±5〜10度** |
| 一般的な屋外 | **±10〜15度** |
| 屋内 | **±20度以上** |

### ARでの実質的影響

**50m先のオブジェクトの場合:**
- GPS誤差 5m → オブジェクト位置が**約5m**ずれる
- コンパス誤差 10度 → 表示位置が**約8.7m**ずれる（50m × tan(10°)）
- **合計ずれ: 10m前後**

**200m先のオブジェクトの場合:**
- GPS誤差 5m → 影響は相対的に小さい
- コンパス誤差 10度 → 表示位置が**約35m**ずれる
- **遠距離の方が角度誤差の影響が大きい**

### 結論

- **近距離（50m以内）**: GPSの絶対精度が支配的。オブジェクトが「正確な位置」にはならない
- **中距離（50〜500m）**: コンパス精度が支配的。方向の指し示しとしては有用
- **遠距離（500m+）**: ナビゲーション的なガイドとしては機能する

---

## 9. GPSベースARが適する用途 vs 適さない用途

### 適する用途

| 用途 | 理由 |
|---|---|
| **大規模POI（観光案内）** | 建物・ランドマークは大きいので5〜10mの誤差が気にならない |
| **ナビゲーション矢印表示** | 方向の指し示しが主目的。精度はそこまで要求されない |
| **ゲーム（Pokemon Go風）** | GPSで大まかな位置に誘導し、到着後はARマーカーやタップで操作 |
| **不動産・建築物の3D表示** | 大きな建物の可視化であれば数mの誤差は許容範囲 |
| **教育（歴史的建造物のAR復元）** | 広域の可視化で十分 |

### 適さない用途

| 用途 | 理由 |
|---|---|
| **テーブル上のAR配置** | cm精度が必要。GPS では不可能 |
| **屋内ナビゲーション（棚単位）** | GPSが届かない、WiFi測位でも精度不足 |
| **精密なオーバーレイ（看板に重ねる等）** | 数mの誤差でずれが明白になる |
| **近距離での小さなオブジェクト配置** | 5m 誤差 = オブジェクトが全く見えない位置に |
| **密集した複数POIの区別** | 隣り合うPOIが入れ替わって表示されうる |

### 精度改善のハイブリッドアプローチ

1. **GPS + ビジュアルマーカー**: GPSで大まかな位置に誘導し、マーカーで精密配置
2. **GPS + VSLAM**: Google ARCore Geospatial APIが採用。VPS（Visual Positioning System）でストリートビュー画像と照合
3. **GPS + Bluetooth Beacon**: 屋内でBLEビーコンによる測位を併用
4. **GPS + WiFi Fingerprinting**: 屋内でWiFi信号パターンによる測位

---

## 10. バッテリー消費への影響

### GPS の消費電力

| モード | 消費電力 | バッテリーへの影響 |
|---|---|---|
| GPSチップ連続稼働 | 約135mA | 約6時間で電池切れ（GPS単体） |
| 信号良好時 | バッテリーの約13%/時間 | 比較的効率的 |
| 信号不良時 | バッテリーの約38%/時間 | 衛星サーチで消費増大 |

### コンパス（磁気センサー）の消費電力

- 電子コンパス（磁気センサー）は**極めて低消費電力**
- GPSやカメラと比較して無視できるレベル

### AR アプリ全体の消費要素

| 要素 | 消費レベル | 備考 |
|---|---|---|
| カメラ映像（getUserMedia） | **高** | 常時バックカメラ稼働 |
| GPS（watchPosition） | **高** | 連続衛星通信 |
| 3Dレンダリング（WebGL） | **中〜高** | GPU負荷 |
| DeviceOrientation | **低** | IMUセンサーのみ |
| ディスプレイ（常時ON） | **高** | AR体験中は画面消灯不可 |

### 最適化戦略

```js
// 1. GPS更新を必要最小限に
const watchId = navigator.geolocation.watchPosition(onPosition, onError, {
  enableHighAccuracy: true,
  maximumAge: 5000,     // 5秒間はキャッシュを許容（0ではなく）
  timeout: 10000
});

// 2. 一定距離移動するまで更新をスキップ（AR.jsのgpsMinDistance相当）
let lastPosition = null;
function onPosition(pos) {
  if (lastPosition) {
    const dist = haversineDistance(
      lastPosition.lat, lastPosition.lon,
      pos.coords.latitude, pos.coords.longitude
    );
    if (dist < 5) return; // 5m未満の移動は無視
  }
  lastPosition = { lat: pos.coords.latitude, lon: pos.coords.longitude };
  updateARScene(lastPosition);
}

// 3. AR非表示時はGPSを停止
function pauseAR() {
  navigator.geolocation.clearWatch(watchId);
}
```

### 実測の目安

- ロケーションベースAR（GPS + カメラ + 3D）の連続使用: **1.5〜2.5時間**で50%消費（機種による）
- `enableHighAccuracy: false` に切り替えると消費を**最大50%削減**できるが、精度は大幅に劣化

---

## 11. コード例: GPS + コンパス + 3D座標変換の統合実装

### 完全なクロスプラットフォーム実装例

```js
// ============================================================
// GPS + コンパス + 3D変換 統合実装
// ============================================================

class LocationAR {
  constructor() {
    this.userPosition = null;       // { lat, lon, accuracy }
    this.compassHeading = null;     // 0〜360度（北=0）
    this.deviceOrientation = null;  // { alpha, beta, gamma }
    this.watchId = null;
    this.poiList = [];              // { lat, lon, mesh, ... }
  }

  // ---- 権限リクエスト（iOS対応） ----
  async requestPermissions() {
    // 1. DeviceOrientation 権限（iOS 13+）
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      const result = await DeviceOrientationEvent.requestPermission();
      if (result !== 'granted') {
        throw new Error('DeviceOrientation permission denied');
      }
    }

    // 2. Geolocation はwatchPosition呼び出し時に自動リクエスト
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(pos),
        (err) => reject(err),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  }

  // ---- GPS追跡の開始 ----
  startGPS() {
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        this.userPosition = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp
        };
        this.updatePOIPositions();
      },
      (err) => console.error('GPS error:', err),
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000
      }
    );
  }

  // ---- コンパス追跡の開始 ----
  startCompass() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

    if (isIOS) {
      window.addEventListener('deviceorientation', (e) => {
        if (e.webkitCompassHeading !== undefined) {
          this.compassHeading = e.webkitCompassHeading;
        }
        this.deviceOrientation = {
          alpha: e.alpha,
          beta: e.beta,
          gamma: e.gamma
        };
      });
    } else {
      // Android: deviceorientationabsolute を優先
      const handler = (e) => {
        if (e.absolute || e.alpha !== null) {
          this.compassHeading = (360 - e.alpha) % 360;
        }
        this.deviceOrientation = {
          alpha: e.alpha,
          beta: e.beta,
          gamma: e.gamma
        };
      };

      if ('ondeviceorientationabsolute' in window) {
        window.addEventListener('deviceorientationabsolute', handler);
      } else {
        window.addEventListener('deviceorientation', handler);
      }
    }
  }

  // ---- 座標変換: GPS → ワールド座標 ----
  gpsToWorld(targetLat, targetLon) {
    if (!this.userPosition) return null;

    // Spherical Mercator 投影
    const R = 6378137;
    const toRad = (d) => d * Math.PI / 180;

    const userX = R * toRad(this.userPosition.lon);
    const userY = R * Math.log(Math.tan(Math.PI / 4 + toRad(this.userPosition.lat) / 2));
    const targetX = R * toRad(targetLon);
    const targetY = R * Math.log(Math.tan(Math.PI / 4 + toRad(targetLat) / 2));

    return {
      x: targetX - userX,       // 東がプラス
      y: 0,                     // 高さ（地表面）
      z: -(targetY - userY)     // WebGL: 北がマイナスZ
    };
  }

  // ---- POI配置の更新 ----
  updatePOIPositions() {
    for (const poi of this.poiList) {
      const worldPos = this.gpsToWorld(poi.lat, poi.lon);
      if (worldPos && poi.mesh) {
        poi.mesh.position.set(worldPos.x, worldPos.y, worldPos.z);
      }
    }
  }

  // ---- POIの追加 ----
  addPOI(lat, lon, mesh) {
    this.poiList.push({ lat, lon, mesh });
    if (this.userPosition) {
      const worldPos = this.gpsToWorld(lat, lon);
      if (worldPos) {
        mesh.position.set(worldPos.x, worldPos.y, worldPos.z);
      }
    }
  }

  // ---- 方位角と距離（デバッグ/UI用） ----
  getBearingAndDistance(targetLat, targetLon) {
    if (!this.userPosition) return null;

    const toRad = (d) => d * Math.PI / 180;
    const toDeg = (r) => r * 180 / Math.PI;

    const lat1 = toRad(this.userPosition.lat);
    const lat2 = toRad(targetLat);
    const dLon = toRad(targetLon - this.userPosition.lon);

    // Bearing
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) -
              Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    const bearing = (toDeg(Math.atan2(y, x)) + 360) % 360;

    // Distance (Haversine)
    const R = 6371e3;
    const dLat = lat2 - lat1;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return { bearing, distance };
  }

  // ---- クリーンアップ ----
  stop() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }
}
```

### Three.js との統合例

```js
import * as THREE from 'three';

// シーンのセットアップ
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 10000);
const renderer = new THREE.WebGLRenderer({ alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// カメラ背景にウェブカメラ映像を表示
const video = document.createElement('video');
video.setAttribute('playsinline', '');
navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
  .then(stream => { video.srcObject = stream; video.play(); });

// LocationAR の初期化
const locationAR = new LocationAR();

// DeviceOrientation → カメラ回転の適用
function updateCameraRotation(alpha, beta, gamma) {
  const euler = new THREE.Euler();
  const q = new THREE.Quaternion();
  const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // -90° X補正

  const alphaRad = THREE.MathUtils.degToRad(alpha);
  const betaRad = THREE.MathUtils.degToRad(beta);
  const gammaRad = THREE.MathUtils.degToRad(gamma);

  euler.set(betaRad, alphaRad, -gammaRad, 'YXZ');
  q.setFromEuler(euler);
  q.multiply(q1);

  // 画面の向き補正
  const screenOrientation = window.screen.orientation ?
    window.screen.orientation.angle : window.orientation || 0;
  const q2 = new THREE.Quaternion();
  q2.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -THREE.MathUtils.degToRad(screenOrientation));
  q.multiply(q2);

  camera.quaternion.copy(q);
}

// POI を追加（例: 東京タワー）
const poiMesh = new THREE.Mesh(
  new THREE.ConeGeometry(5, 20, 4),
  new THREE.MeshBasicMaterial({ color: 0xff4444 })
);
scene.add(poiMesh);
locationAR.addPOI(35.6586, 139.7454, poiMesh); // 東京タワーの座標

// 開始
async function start() {
  await locationAR.requestPermissions();
  locationAR.startGPS();
  locationAR.startCompass();

  function animate() {
    requestAnimationFrame(animate);

    // カメラ回転の更新
    if (locationAR.deviceOrientation) {
      const { alpha, beta, gamma } = locationAR.deviceOrientation;
      if (alpha !== null) {
        updateCameraRotation(alpha, beta, gamma);
      }
    }

    renderer.render(scene, camera);
  }
  animate();
}

// ボタンクリックで開始（iOS権限のため）
document.getElementById('startBtn').addEventListener('click', start);
```

---

## まとめ: ロケーションベースAR の判断基準

### 技術選択のフローチャート

1. **AR.jsを使うか、自前実装か？**
   - AR.jsの利点: 実績あり、Three.js対応、GPSフィルタリング内蔵
   - 自前実装の利点: 依存最小化、完全な制御、バンドルサイズ最適化

2. **対象オブジェクトの距離は？**
   - 近距離（50m以内）: GPS精度が不足する可能性大。マーカーARやWebXR併用を検討
   - 中距離（50〜500m）: GPSベースARの最適レンジ
   - 遠距離（500m+）: ナビゲーション用途なら有効

3. **屋内か屋外か？**
   - 屋外のみ: GPSベースAR が有効
   - 屋内含む: GPSベースARは不適。BLEビーコンやマーカーARを検討

4. **精度要求は？**
   - 「だいたいの方向」で十分: GPSベースARが適する
   - 「正確な位置にオーバーレイ」: GPSベースARでは困難。VSLAM/VPS併用が必要

### 参照リンク

- [MDN Geolocation API](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API)
- [MDN DeviceOrientationEvent](https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent)
- [AR.js Location-Based Documentation](https://ar-js-org.github.io/AR.js-Docs/location-based/)
- [AR.js GitHub](https://github.com/AR-js-org/AR.js/)
- [Movable Type - Lat/Long Calculations](https://www.movable-type.co.uk/scripts/latlong.html)
- [Apple DeviceOrientationEvent Documentation](https://developer.apple.com/documentation/webkitjs/deviceorientationevent)
- [W3C DeviceOrientation Compass Issue #137](https://github.com/w3c/deviceorientation/issues/137)
- [Ubilabs - Geolocation and Compass Implementation](https://ubilabs.com/en/insights/implement-geolocation-and-compass-heading)
- [GPS Accuracy - Tracki](https://tracki.com/blogs/post/gps-accuracy)
- [MDN watchPosition()](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/watchPosition)
- [MDN deviceorientationabsolute Event](https://developer.mozilla.org/en-US/docs/Web/API/Window/deviceorientationabsolute_event)

---
---

# GPS + コンパスARの現場セットアップ・実運用ガイド

コード実装を補完する、実世界でのGPSベースAR体験を構築・展開するための実践的なガイド。

---

## 1. GPS座標の測量・記録方法（POI配置のための現地作業）

### 1.1 座標取得ツール

AR体験で仮想オブジェクトを配置するためのPOI（Point of Interest）座標を正確に取得する方法を以下にまとめる。

#### Google Maps を使った簡易座標取得

最も手軽な方法。精度は中程度（衛星画像の解像度に依存、都市部で約1〜3m）。

**PC版:**
1. Google Maps で対象地点を右クリック
2. 表示された緯度・経度の数値をクリックしてコピー
3. 小数点以下6桁（例: 35.658580, 139.745380）で十分な精度

**スマートフォン版:**
1. Google Maps アプリで対象地点を長押し
2. ドロップされたピンの情報に緯度・経度が表示される
3. 数値をタップしてコピー

**注意点:**
- 衛星画像モードで建物の正確な位置を確認すること
- 高層ビルの場合、衛星画像の撮影角度によるオフセットがある
- 地表面の座標であり、建物の高さ情報は含まない

#### 専用GPS座標取得アプリ

現地で直接座標を記録する場合に使用。精度はデバイスのGPSチップ性能に依存。

| アプリ名 | プラットフォーム | 主な機能 | 用途 |
|---|---|---|---|
| **GPS Coordinates** | Android | 座標表示・コピー・共有 | 現地での簡易記録 |
| **Coordinates - GPS Converter** | iOS | 多フォーマット対応（UTM, MGRS等）、GPX/KML出力 | 測量級の記録 |
| **GPS & Maps** | iOS/Android | POIウェイポイント記録、Google Maps/OSM連携 | ルート付きPOI管理 |
| **GPSLogger** | Android | GPX/KML形式でのGPSトレース記録 | バッチ処理向け |
| **My GPS Coordinates** | Android | 保存位置のマップ表示、ファイルエクスポート | チーム共有 |

#### 測量用ツール（高精度が必要な場合）

| ツール | 精度 | コスト | 用途 |
|---|---|---|---|
| **ArcGIS Field Maps** | cm〜サブメートル | ライセンス必要 | プロフェッショナル測量 |
| **RTK GPS受信機** | 1〜2cm | 高額（数十万円〜） | 建築・土木連携AR |
| **DGNSS（ディファレンシャルGPS）アプリ** | 0.5〜1m | 中程度 | 中精度の要件 |

### 1.2 座標精度を高めるためのテクニック

#### 複数回測定の平均化

スマートフォンのGPSは単一測定で3〜10mの誤差がある。複数回の測定を平均化することで精度を向上できる。

```
手順:
1. 対象地点に立ち、GPSアプリで座標を記録（1回目）
2. 30秒〜1分待機し、再度記録（2回目）
3. これを5〜10回繰り返す
4. 全測定値の平均を計算
5. 標準偏差を確認（σ > 5m なら環境条件が悪い）
```

**統計的根拠:**
- 標準偏差(σ)は個々の測定のばらつきを示す
- 平均値の標準誤差 = σ / √n （nは測定回数）
- 10回測定で理論上の誤差は 1/√10 ≒ 0.32倍に低減
- RMS（二乗平均平方根）誤差で精度を評価するのが一般的

#### 時間帯を変えた測定

- GPS衛星の配置（GDOP: Geometric Dilution of Precision）は時間帯によって変化する
- **朝・夕方**に測定すると衛星配置が異なるため、系統的誤差を検出できる
- 異なる時間帯の測定値の平均はさらに信頼性が高い

#### デバイスの設定確認

```
Android の場合:
設定 > 位置情報 > 高精度モード（GPS + WiFi + モバイルネットワーク）を有効にする
※ Android Chrome で High Accuracy が OFF の場合、GPSが使われず精度が大幅に低下する

iOS の場合:
設定 > プライバシーとセキュリティ > 位置情報サービス > ON
※「正確な位置情報」がOFFだと数km単位の誤差になる
```

### 1.3 GPSドリフトへの対処

GPSドリフトとは、静止していても受信するGPS座標が数メートル範囲で変動する現象。

**ドリフトの原因:**
- 衛星の幾何学的配置の変化
- 大気（電離層・対流圏）の影響
- マルチパス（建物等からの反射信号）
- 受信機のノイズ

**AR配置での対策:**

| 対策 | 効果 | 実装難易度 |
|---|---|---|
| `gpsMinDistance` フィルタ（5m以上の移動のみ反応） | ジッター抑制 | 低 |
| 移動平均フィルタ（直近5回の座標を平均） | 平滑化 | 低 |
| カルマンフィルタ | 最適推定 | 中 |
| GPS精度閾値（accuracy > 20m の測定を破棄） | 低品質データ排除 | 低 |
| POIの「スナップ範囲」設定（10m以内に入ったら固定位置に表示） | UX改善 | 低 |

```js
// 移動平均フィルタの例
class GPSMovingAverage {
  constructor(windowSize = 5) {
    this.buffer = [];
    this.windowSize = windowSize;
  }

  addReading(lat, lon) {
    this.buffer.push({ lat, lon });
    if (this.buffer.length > this.windowSize) {
      this.buffer.shift();
    }
    return this.getAverage();
  }

  getAverage() {
    const n = this.buffer.length;
    const avgLat = this.buffer.reduce((sum, p) => sum + p.lat, 0) / n;
    const avgLon = this.buffer.reduce((sum, p) => sum + p.lon, 0) / n;
    return { lat: avgLat, lon: avgLon };
  }
}
```

---

## 2. 現場でのユーザー誘導（案内標識・QRコード）

### 2.1 物理的な案内標識の設置

AR体験は「ユーザーが正しい場所・正しい向き」にいることが前提。物理的なガイダンスが重要。

#### 看板・表示の設計原則

| 要素 | 推奨 | 理由 |
|---|---|---|
| 設置場所 | AR開始地点から5〜10m手前 | 移動中に発見しやすい |
| サイズ | A3以上（QRコード部分は10cm角以上） | 1〜2m距離からスキャン可能 |
| 色・コントラスト | 暗色前景 + 明色背景 | QRコード読取精度の確保 |
| テキスト | 「ここでスマホをかざしてAR体験」等の具体的指示 | ユーザーの行動を明確化 |
| マージン | QRコードの周囲にモジュール4個分以上の余白 | スキャン失敗の防止 |
| 防水加工 | ラミネートまたは防水ケース | 屋外設置必須 |

#### QRコードの設計ベストプラクティス

```
QRコード設置チェックリスト:

□ ダイナミックQRコードを使用（URLを後から変更可能）
□ サイズ: 読取距離の1/10以上（10m先なら1m角）
□ 色: 暗い前景色 + 明るい背景色（白黒推奨）
□ エラー訂正レベル: H（30%復元可能）- 屋外汚損対策
□ テスト: 設置予定の場所で、想定端末で実際にスキャン確認
□ コンテキスト: 「このQRコードをスキャンしてAR体験を開始」等のCTA文言
□ アクセシビリティ: 車椅子利用者が届く高さ（120cm以下に中心）
□ 複数のQRコードを異なる距離に設置（近距離用小サイズ + 遠距離用大サイズ）
```

**ダイナミックQRコードの利点:**
- 印刷済みのQRコードを変更せずに、リンク先のAR体験をアップデート可能
- アクセス統計（スキャン回数、時間帯、デバイス種別）の取得が可能
- A/Bテストによるユーザー体験の最適化

### 2.2 GPS AR + 物理マーカーのハイブリッドアプローチ

GPSだけでは精度が不足する場面で、物理マーカーと組み合わせる方法。

```
ハイブリッドフロー:

1. ユーザーがQRコードをスキャン → WebARアプリが起動
2. GPSで大まかな位置を取得 → 最寄りのAR体験ポイントを特定
3. アプリ画面に「あと50m先の赤い看板まで進んでください」と案内表示
4. 到着後、看板上のARマーカーを認識 → 精密なAR配置を実行
5. マーカーから離れた後もGPS + コンパスで大まかなAR表示を継続
```

**利点:**
- GPSの粗い精度でのナビゲーション + マーカーの精密な配置を両立
- マーカーが見えない距離でもGPSでAR体験を継続できる
- マーカーが設置困難な場所（公園の中央等）でもGPSのみで対応可能

### 2.3 地面への設置物

- **足跡マーク**: AR体験の最適な立ち位置を地面にペイントまたはステッカーで表示
- **方向矢印**: 「この方向を向いてAR体験を開始」
- **距離マーカー**: 建物から特定の距離に立ってもらうためのライン

---

## 3. 環境条件がGPS精度に与える影響

### 3.1 最適な屋外条件

#### 理想的な環境

```
最良条件チェックリスト:

□ 頭上が開けている（空の見通し角 > 150度）
□ 周囲に高層建物がない（最低でも建物から建物高さの2倍以上離れる）
□ 金属構造物（鉄塔、大型車両等）から10m以上離れている
□ 電磁波干渉源（変電所、大型送電線）から離れている
□ 晴天または薄曇り
□ 地磁気の乱れが少ない日（太陽フレア活動が低い）
```

**精度目安:**
- 理想条件: **3〜5m**（スマートフォン）
- 一般的な屋外: **5〜10m**
- デュアルバンドGNSS搭載スマートフォン（Pixel 5以降、iPhone 12以降）: **2〜5m**

### 3.2 アーバンキャニオン効果（都市部の高層ビル群）

高層ビル群に囲まれた環境（アーバンキャニオン）では、GPS精度が著しく劣化する。

**劣化メカニズム:**

| 現象 | 説明 | 精度への影響 |
|---|---|---|
| **マルチパス** | GPS信号がビル壁面で反射し、直接信号と反射信号が混在 | 5〜30m の誤差増大 |
| **NLOS (Non-Line-of-Sight)** | 直接波が遮断され反射波のみ受信 | 測位不能または大誤差 |
| **衛星遮蔽** | ビルが衛星を遮り、受信可能な衛星数が減少 | GDOP悪化、15m以上の誤差 |
| **GNSS影（GNSSシャドウ）** | ビル群が衛星信号を完全に遮断する領域 | 測位不可 |

**緩和策:**

1. **デュアルバンド受信機**: L1/L5（GPS）、E1/E5a（Galileo）の二周波で受信し、マルチパスの影響を軽減
2. **3D都市モデル活用（シャドウマッチング）**: 3D建物モデルを使ってNLOS信号を特定・除外
3. **WiFi + BLE併用**: GPS信号が弱い場所でWiFi/BLEによる測位で補完
4. **POI配置の工夫**: ビル谷間ではなく、交差点や広場にPOIを設定
5. **精度インジケーター**: ユーザーに現在のGPS精度を表示し、精度が悪い場合は開けた場所への移動を促す

**AR設計上の対策:**
```
アーバンキャニオン対策:

- POIの表示範囲を広く設定（±20mの範囲に入ったら表示開始）
- 精度値(accuracy)をリアルタイム表示し、ユーザーに状況を伝える
- accuracy > 30m の場合は「GPS精度が低下しています。開けた場所に
  移動してください」と案内
- ビル群の間ではGPS座標ではなくコンパス方位を主軸にした表示に切り替え
```

### 3.3 天候の影響

| 天候条件 | GPS精度への影響 | 詳細 |
|---|---|---|
| **晴天** | 影響なし | 最良条件 |
| **曇り** | ほぼ影響なし | 雲はGPS信号（1.5GHz帯）をほぼ減衰させない |
| **雨** | 軽微（通常使用では無視可能） | 豪雨時に若干の信号減衰あり |
| **雪** | 軽微 | 降雪自体の影響は小さいが、積雪によるアンテナ遮蔽に注意 |
| **雷雨** | 間接的影響あり | 電離層擾乱による短時間の精度劣化の可能性 |
| **磁気嵐（太陽フレア）** | **重大な影響** | 電離層の乱れにより**数十メートル**の誤差増大。NOAA Space Weather Prediction Centerで確認可能 |

**AR体験設計への示唆:**
- 通常の天候（晴れ〜小雨）ではGPS精度は実質的に変わらない
- 磁気嵐の時期は事前にチェック（https://www.swpc.noaa.gov/）
- 豪雨・暴風時はそもそも屋外AR体験の実施が困難（ユーザーの安全・端末の防水）
- **コンパス精度は天候よりも周囲の金属・電子機器の影響の方が遥かに大きい**

### 3.4 時間帯の影響

| 時間帯 | GPS精度 | 備考 |
|---|---|---|
| **早朝（5:00〜8:00）** | 良好 | GPS衛星配置による（変動あり） |
| **日中（8:00〜17:00）** | 良好〜普通 | 電離層活動がピーク（微小影響） |
| **夕方〜夜間（17:00〜）** | 良好 | 電離層活動低下 |
| **深夜（0:00〜5:00）** | 良好 | 最も安定する傾向 |

**実用上の注意:**
- GPS精度の時間帯変動は一般的に**1〜2m程度**であり、AR体験では無視できるレベル
- むしろ重要なのは**照明条件**: カメラ映像が暗いとAR体験の質が低下する
- 日没後は画面の明るさで周囲が見えにくくなり、安全上の問題がある
- **推奨時間帯: 日の出〜日没の間**

---

## 4. 実用的な展開事例

### 4.1 観光ARガイド

**事例: 歴史的建造物のAR復元**

| 項目 | 詳細 |
|---|---|
| コンセプト | 史跡・遺跡の往時の姿をGPS位置ベースで3D表示 |
| 技術構成 | GPS + コンパス + WebAR（Three.js / AR.js） |
| POI数 | 通常10〜30箇所 |
| 体験距離 | POIから50〜200m（中距離向き） |
| 座標取得 | Google Maps衛星画像 + 現地測量（平均化） |

**具体例:**
- **ザールブルク・ローマ砦（ドイツ）**: SPIRITプロジェクトによるロケーションベースARストーリーテリング。歴史上の人物の霊がその場所で起きた物語を語る
- **バイキング・ゴーストハント（ダブリン）**: ロケーションベースの冒険ARゲーム。ゴシックホラーをバイキング時代のダブリンを舞台に展開
- **ポルトの歴史ガイド「Unlocking Porto」**: ゲーミフィケーション + ストーリーテリング。主要観光スポットを巡りミニゲームをプレイ

**設計のポイント:**
```
観光ARガイド設計チェックリスト:

□ POIは見通しの良い場所（広場、交差点）に設定
□ 各POIに半径20〜30mの「アクティベーション範囲」を設定
□ テキスト情報は多言語対応（最低でも現地語 + 英語）
□ オフラインキャッシュ対応（圏外エリアを考慮）
□ ウォーキングルートを設定し、自然な順路でPOIを巡れるようにする
□ 各POI間の距離は徒歩3〜5分（200〜400m）が理想
□ 安全な歩行者エリアにPOIを配置（車道沿いは避ける）
```

### 4.2 博物館・屋外展示のAR

**事例: 屋外博物館 / 公園のAR展示**

| 施設 | AR内容 | 技術 |
|---|---|---|
| **金沙遺跡博物館（成都）** | 出土品の3D表示・回転閲覧 | ロケーションベースAR |
| **スミソニアン骨格ホール** | 骨格標本に皮膚・動作をオーバーレイ | マーカーベースAR |
| **サンシャイン水族館（東京）** | ARペンギンが街中を案内して水族館へ誘導 | GPS AR + ナビゲーション |
| **ロンドン博物館 StreetMuseum** | 現在の街並みに歴史的写真をオーバーレイ | GPS AR |
| **パワーハウス博物館 Around Sydney** | シドニー市内でロケーションベースAR展示 | GPS AR |

**屋外展示でのGPS AR利用パターン:**

```
パターンA: スタンプラリー型
- 園内の各展示にGPS座標を設定
- ユーザーが近づくと展示説明がAR表示される
- 全ポイント制覇でデジタルスタンプを付与

パターンB: ガイドツアー型
- 順路に沿ってPOIを配置
- 各POIでナレーション付きAR展示
- 次のPOIへのナビゲーション矢印を表示

パターンC: 自由探索型
- 園内のマップにPOIを表示
- ユーザーが自由に巡回
- 発見した展示をコレクション化
```

### 4.3 ゲーム（Pokemon Go型）

**Pokemon Goの技術的要点と教訓:**

| 要素 | Pokemon Goの実装 | WebARでの応用 |
|---|---|---|
| 位置検出 | GPS + WiFi + セルタワー | Geolocation API（同等） |
| マップ表示 | Google Maps / OSM | Mapbox GL JS / Leaflet |
| ARモード | ARCore / ARKit | DeviceOrientation + getUserMedia |
| ジオフェンシング | サーバーサイド | クライアントサイド（Haversine距離判定） |
| POI密度 | 都市部で高密度 | プロジェクト要件に応じて調整 |

**Niantic のジオスパーシャルマッピング:**
- 世界中の**1,000万箇所以上**のスキャンデータを保有
- 毎週**100万件**の新規スキャンをPokemon Goプレイヤーから収集
- 歩行者視点のマッピング（車がアクセスできない小径や公園を含む）
- Large Geospatial Model（LGM）の構築に活用

**Web AR ゲームへの示唆:**
```
GPS ARゲーム設計のベストプラクティス:

1. 出現範囲を大きく設定（半径20m以上）
   → GPS誤差でイベントが発火しない問題を回避

2. 「近づく」アクションと「精密操作」を分離
   → GPSで大まかに誘導 → 到着後はタップ/スワイプで操作

3. 移動中はマップビュー、到着後にカメラビュー（AR）
   → 歩きスマホの安全対策

4. オフライン対応
   → 圏外エリアでもキャッシュしたPOIデータで動作

5. 体力消耗への配慮
   → 15〜30分の体験で完結するセッション設計
   → バッテリー残量の警告表示
```

### 4.4 不動産・建築物の可視化

**GPS ARを使った不動産プレビュー:**

| 用途 | 説明 | 必要精度 |
|---|---|---|
| 未開発地での建物可視化 | 建設予定地に3Dモデルを配置 | 5〜10m（建物サイズで許容） |
| 周辺環境からの眺望確認 | 複数地点から建物の見え方を確認 | 方位角精度が重要 |
| 建設進捗の可視化 | 現在の状態と完成予想の比較 | 中程度 |
| 景観シミュレーション | 周辺の景観への影響を確認 | 低〜中程度 |

**実装上のポイント:**
- 建物のスケールが大きいため、GPS精度の5〜10m誤差は相対的に小さく見える
- 地面の高さ（標高）情報が重要 → 国土地理院の標高APIや Google Elevation API を活用
- 建物の向き（方位）はコンパスの精度に依存 → ±10度の誤差を考慮した設計が必要
- 複数地点からの閲覧を前提とし、各地点で最適なスケール・向きを事前設定

---

## 5. AR.js ロケーションベースモード vs 自前実装

### 5.1 使い分けの判断基準

| 判断基準 | AR.js を使う | 自前実装 |
|---|---|---|
| **開発速度** | 高速（数時間でプロトタイプ） | 数日〜数週間 |
| **プロジェクト規模** | 小〜中（POI 50個以下） | 大規模・長期運用 |
| **カスタマイズ** | AR.jsの枠内 | 完全自由 |
| **バンドルサイズ** | AR.js + A-Frame で約500KB〜 | 必要最小限 |
| **依存管理** | AR.jsのアップデートに追従必要 | 自己管理 |
| **既存フレームワーク** | A-Frame / Three.js 前提 | React / Vue 等と柔軟に統合 |
| **GPS フィルタリング** | 内蔵（gpsMinDistance等） | 自前実装 |
| **コンパス処理** | 内蔵（iOS/Android対応） | プラットフォーム差異を自前で吸収 |

**結論:**
- **プロトタイプ・検証**: AR.js を使う（工数最小化）
- **製品レベルの独自体験**: 自前実装（Three.js + Geolocation API + DeviceOrientation）
- **React/Vue プロジェクト**: 自前実装の方が統合しやすい

### 5.2 AR.js gps-new-camera コンポーネント詳細

AR.js 3.4.0以降で推奨される `gps-new-camera` / `gps-new-entity-place` コンポーネントの技術的詳細。

#### gps-new-camera プロパティ

| プロパティ | 型 | デフォルト | 説明 |
|---|---|---|---|
| `gpsMinDistance` | number | 5 | GPS更新をトリガーする最小移動距離(m)。この値より小さい移動はスキップされ、コンテンツの「ジャンプ」を抑制 |
| `positionMinAccuracy` | number | 100 | GPSの精度(m)がこの値より大きい場合、その測定値をスキップ |
| `gpsTimeInterval` | number | 0 | GPSキャッシュの最大保持時間(ms)。0=常に新規取得。値を設定すると、指定時間内はキャッシュ値を使用 |
| `simulateLatitude` | number | - | テスト用の仮緯度。設定するとGPSの代わりにこの値を使用 |
| `simulateLongitude` | number | - | テスト用の仮経度 |
| `simulateAltitude` | number | - | テスト用の仮高度 |

#### gps-new-entity-place プロパティ

| プロパティ | 型 | 説明 |
|---|---|---|
| `latitude` | string | エンティティのGPS緯度（必須） |
| `longitude` | string | エンティティのGPS経度（必須） |
| `distance` | number (読取専用) | カメラからの現在距離(m)。GPS位置更新に応じて動的に変化 |

#### イベント

| イベント | 発火元 | データ | 用途 |
|---|---|---|---|
| `gps-camera-update-position` | gps-new-camera | `{ position: { latitude, longitude } }` | GPS位置が更新されるたびに発火。POIの動的追加に使用 |

### 5.3 キャリブレーションワークフロー

AR.js のロケーションベースARでは、以下のキャリブレーション手順が重要。

```
キャリブレーションワークフロー:

1. 事前準備
   a. Google Mapsで対象地点のGPS座標を取得（小数点6桁）
   b. 現地で実際にGPSアプリで座標を確認し、Google Maps値と比較
   c. 差異がある場合は現地測定値を優先

2. テスト配置
   a. 現在地から約0.001度（約100m）離れた位置にテストオブジェクトを配置
   b. simulateLatitude / simulateLongitude で室内テスト
   c. 実際の屋外でオブジェクトの表示位置を確認

3. コンパスキャリブレーション
   a. スマートフォンを8の字に動かして磁気センサーをキャリブレーション
   b. 既知の方角（太陽の位置、地図上の方角）と表示を比較
   c. 一部デバイスではセンサーの誤キャリブレーションにより
      北がずれる問題あり（AR.jsの既知の制限事項）

4. 距離の調整
   a. オブジェクトが近すぎる場合 → scaleを大きく、距離感を調整
   b. 50m以内のPOIはGPS誤差で位置がずれやすい
   c. gpsMinDistance を適切に設定（推奨: 5〜10m）

5. 現地での微調整
   a. 複数地点から表示を確認
   b. 必要に応じて座標を±0.00001度（約1m）単位で調整
   c. 複数デバイスで表示の一貫性を確認
```

**AR.js の既知の制限事項:**
- 一部のデバイスでセンサーの誤キャリブレーションにより、北の方向が正しくない場合がある（ハードウェアの制限）
- カメラフィードが画面中央から離れた部分で歪む現象がある（配置精度の低下）
- Firefox モバイル版はDevice Orientation APIの制限により非対応。**Android Chrome を推奨**

---

## 6. テスト・デバッグの方法論

### 6.1 Chrome DevTools による位置シミュレーション

屋内での開発・テスト時に、GPSの仮座標を設定する方法。

#### 手順

```
1. Chrome DevToolsを開く（F12 / Ctrl+Shift+I / Cmd+Opt+I）
2. Ctrl+Shift+P（Mac: Cmd+Shift+P）でコマンドメニューを開く
3. 「Sensors」と入力してEnter
4. Sensorsパネルが表示される

Geolocation セクション:
- プリセット都市（Tokyo, London等）を選択、または
- 「Other...」を選択して任意の緯度・経度を手動入力
- 「Location unavailable」で GPS無効状態をエミュレート

Orientation セクション:
- alpha, beta, gamma の値を手動設定可能
- デバイスの傾きをマウスドラッグでシミュレート
```

**テスト手順の例:**
```js
// テスト用座標の例（東京タワー付近）
// Chrome DevTools > Sensors > Geolocation に以下を入力:
// Latitude: 35.6586
// Longitude: 139.7454

// AR.js 使用時は simulateLatitude/simulateLongitude も利用可能:
// <a-camera gps-new-camera="simulateLatitude: 35.6586; simulateLongitude: 139.7454">
```

#### 制限事項

- Chrome DevToolsの位置シミュレーションは**静的な位置のみ**（移動のシミュレーション不可）
- `DeviceOrientationEvent` のシミュレーションは**限定的**（実際のセンサーの挙動とは異なる）
- **実機テストの代替にはならない**: ハードウェア固有の挙動、バッテリー消費、実際のGPS精度は実機でしか検証できない

### 6.2 シミュレート座標を使った屋内テスト

#### AR.js のシミュレーション機能

```html
<!-- テスト用: simulateLatitude/simulateLongitude を使用 -->
<a-camera gps-new-camera="
  simulateLatitude: 35.6586;
  simulateLongitude: 139.7454;
  gpsMinDistance: 5
"></a-camera>

<!-- この座標から約100m離れた位置にテストオブジェクトを配置 -->
<a-entity
  gps-new-entity-place="latitude: 35.6596; longitude: 139.7454"
  geometry="primitive: box"
  material="color: red"
  scale="20 20 20">
</a-entity>
```

#### 自前実装でのシミュレーション

```js
class LocationAR {
  // テストモードの追加
  constructor(options = {}) {
    this.testMode = options.testMode || false;
    this.simulatedPosition = options.simulatedPosition || null;
  }

  startGPS() {
    if (this.testMode && this.simulatedPosition) {
      // テストモード: 固定座標を使用
      this.userPosition = {
        lat: this.simulatedPosition.lat,
        lon: this.simulatedPosition.lon,
        accuracy: 5,
        timestamp: Date.now()
      };
      this.updatePOIPositions();
      console.log('[TEST MODE] Using simulated position:', this.userPosition);
      return;
    }

    // 本番モード: 実際のGPSを使用
    this.watchId = navigator.geolocation.watchPosition(/* ... */);
  }
}

// 使用例
const ar = new LocationAR({
  testMode: true,
  simulatedPosition: { lat: 35.6586, lon: 139.7454 }
});
```

### 6.3 フィールドテスト手法

#### テスト計画テンプレート

```
フィールドテスト計画書

1. テスト環境
   - 場所: [住所・施設名]
   - 日時: [日付] [時間帯]
   - 天候: [晴れ/曇り/雨]
   - 衛星状況: [GPS Status アプリで確認]
   - テストデバイス: [機種名、OS バージョン、ブラウザバージョン]

2. テスト項目
   □ GPS座標の精度（既知の地点で誤差を測定）
   □ コンパス方位の精度（既知の方角と比較）
   □ AR オブジェクトの表示位置の正確性
   □ 複数デバイス間の表示一貫性
   □ 歩行中のオブジェクト位置の安定性
   □ 異なるGPS精度条件での挙動
   □ バッテリー消費（30分テストでの消費率）
   □ ページロード〜AR表示までの時間

3. 測定手順
   a. テスト地点に立ち、GPS座標をGPSアプリで記録
   b. 同地点でAR アプリを起動
   c. ARオブジェクトの表示位置と実際の位置の差をm単位で目測
   d. コンパスを既知の方角に向け、表示のずれを度単位で記録
   e. 10m, 20m, 50m 離れた地点から同一POIの見え方を確認
   f. 5分間静止してドリフトの有無を確認

4. 記録フォーマット
   | テスト# | 地点 | GPS精度(m) | 位置ずれ(m) | 方位ずれ(度) | 備考 |
   |---------|------|-----------|------------|-------------|------|
   | 1       |      |           |            |             |      |
```

#### 段階的テスト手法

```
Phase 1: デスクテスト（開発環境）
- Chrome DevTools のセンサーシミュレーション
- 座標変換ロジックの単体テスト
- UI/UX のレスポンシブ確認
→ 目的: コードの基本動作確認

Phase 2: 屋外単体テスト（開発者1名）
- テスト場所: 開けた公園、広場
- 1台のデバイスで基本動作確認
- 座標・方位の精度を測定
- 既知の問題を記録
→ 目的: 実環境での基本動作確認

Phase 3: 多デバイステスト
- 3〜5台の異なるデバイスで同時テスト
- iOS / Android の両方をテスト
- デバイス間の表示差異を記録
→ 目的: クロスプラットフォーム互換性の確認

Phase 4: ユーザビリティテスト（5〜10名）
- 非技術者を含むテスターを招集
- タスク完了率（POIを見つけられたか）を測定
- 操作に迷った箇所を記録
- SUS（System Usability Scale）で満足度を定量化
→ 目的: UXの検証と改善点の特定

Phase 5: 本番環境テスト
- 実際の展開場所でのテスト
- 時間帯を変えて複数回テスト
- ネットワーク状況（4G/5G/WiFi）の影響を確認
- ピーク時間帯の同時アクセス負荷テスト
→ 目的: 本番リリース前の最終確認
```

#### デバッグ用ユーティリティ

```js
// GPS ARデバッグオーバーレイ
class ARDebugOverlay {
  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = `
      position: fixed; top: 10px; left: 10px; z-index: 9999;
      background: rgba(0,0,0,0.7); color: #0f0; padding: 10px;
      font-family: monospace; font-size: 12px; max-width: 300px;
      pointer-events: none;
    `;
    document.body.appendChild(this.overlay);
  }

  update(data) {
    this.overlay.innerHTML = `
      <b>GPS AR Debug</b><br>
      Lat: ${data.lat?.toFixed(6) || 'N/A'}<br>
      Lon: ${data.lon?.toFixed(6) || 'N/A'}<br>
      Accuracy: ${data.accuracy?.toFixed(1) || 'N/A'}m<br>
      Compass: ${data.compass?.toFixed(1) || 'N/A'}°<br>
      POIs visible: ${data.visiblePOIs || 0}<br>
      Nearest POI: ${data.nearestDistance?.toFixed(0) || 'N/A'}m<br>
      FPS: ${data.fps || 'N/A'}<br>
      ${data.accuracy > 20 ? '<span style="color:red">⚠ LOW GPS ACCURACY</span>' : ''}
    `;
  }
}
```

---

## 参照リンク

### GPS測量・座標取得
- [GIS Geography - GPS Coordinate Apps](https://gisgeography.com/gps-coordinate-apps-gps-location/)
- [ArcGIS Field Maps - High Accuracy Data Collection](https://doc.arcgis.com/en/field-maps/latest/prepare-maps/high-accuracy-data-collection.htm)
- [7 Ways to Field Test GPS Accuracy with Control Points](https://www.maplibrary.org/10913/how-to-field-test-gps-accuracy-with-control-points/)

### アーバンキャニオン・GPS精度
- [Satellite Positioning Accuracy Improvement in Urban Canyons (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12349109/)
- [Shadow Matching: Improved GNSS Accuracy in Urban Canyons - GPS World](https://www.gpsworld.com/wirelesspersonal-navigationshadow-matching-12550/)
- [u-blox - GNSS Multipath Mitigation](https://www.u-blox.com/en/technologies/multipath-mitigation)
- [7 Approaches to Calibrating GPS in Urban Environments](https://www.maplibrary.org/10495/7-approaches-to-calibrating-gps-in-urban-environments/)

### 天候・環境の影響
- [How Weather Affects GNSS Accuracy - My Surveying Direct](https://www.mysurveyingdirect.com/blogs/surveying/how-weather-affects-gnss-accuracy)
- [NOAA Space Weather and GPS Systems](https://www.swpc.noaa.gov/impacts/space-weather-and-gps-systems)
- [Do Weather Conditions Affect GPS Accuracy - Frotcom](https://www.frotcom.com/blog/2016/11/do-weather-conditions-affect-gps-accuracy)

### AR.js / ロケーションベースAR
- [AR.js Location-Based Documentation](https://ar-js-org.github.io/AR.js-Docs/location-based/)
- [AR.js A-Frame Location-Based Tutorial](https://ar-js-org.github.io/AR.js-Docs/location-based-aframe/)
- [AR.js GitHub](https://github.com/AR-js-org/AR.js/)
- [GeoAR.js GitHub](https://github.com/nicolocarpignoli/GeoAR.js/)
- [Build Location Based AR on the Web - Medium](https://medium.com/@vivianlii/build-location-based-ar-on-the-web-using-ar-js-b9b9ea006819)

### 展開事例
- [Location-Based AR Games in Tourism (MDPI)](https://encyclopedia.pub/entry/52091)
- [Location-Based AR for Cultural Heritage (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC10222302/)
- [AR in Tourism & Travel - Rock Paper Reality](https://rockpaperreality.com/insights/ar-use-cases/augmented-reality-in-tourism-and-travel/)
- [Five AR Experiences in Museums - Smithsonian](https://www.smithsonianmag.com/travel/expanding-exhibits-augmented-reality-180963810/)
- [Pokemon Go - AR Game and Geospatial Mapping](https://www.vgis.io/2025/08/19/how-pokemon-go-is-quietly-helping-build-a-smarter-world-map/)

### QRコード・ユーザー誘導
- [QR Code Design Best Practices - Blue Bite](https://academy.bluebite.com/posts/qr-code-design-best-practices)
- [13 QR-Code Usability Guidelines - NN/g](https://www.nngroup.com/articles/qr-code-guidelines/)
- [QR Codes for Digital Display - QR Code Generator](https://www.qr-code-generator.com/blog/qr-codes-digital-display/)

### テスト・デバッグ
- [Chrome DevTools Sensors Documentation](https://developer.chrome.com/docs/devtools/sensors)
- [Simulate Geolocation - DevTools Tips](https://devtoolstips.org/tips/en/simulate-geolocation/)
- [BrowserStack - Geolocation Testing on Chrome](https://www.browserstack.com/guide/test-geolocation-chrome)
