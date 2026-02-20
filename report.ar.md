# AR実装方式 技術調査レポート

優先度順: **画像トラッキング (MindAR)** > **マーカーAR (AR.js)** > **GPS + コンパス**

---

## 方式比較サマリー

| 特性 | 画像トラッキング (MindAR) | マーカーAR (AR.js) | GPS + コンパス |
|---|---|---|---|
| **精度** | cm単位（近距離） | cm単位（近距離） | 5〜15m（GPS依存） |
| **有効距離** | 0.5〜3m | 0.5〜5m | 50m〜無制限 |
| **マーカー自由度** | 任意の画像（写真・ポスター等） | 白黒パターン or バーコード | マーカー不要 |
| **iOS Safari** | 対応 | 対応 | 対応 |
| **Android Chrome** | 対応 | 対応 | 対応 |
| **処理負荷** | 中（GPU利用） | 低（最も軽量） | 低 |
| **屋内/屋外** | 両方（照明必要） | 両方（照明必要） | 屋外のみ |
| **ライセンス** | MIT | MIT (artoolkit5: LGPLv3) | MIT (AR.js利用時) |

---
---

# 1. 画像トラッキング (MindAR)

## 1.1 概要

MindARは、Webブラウザ上で動作するオープンソースの画像トラッキングARライブラリ。
任意の画像（写真・ポスター・イラスト等）をターゲットとして認識し、その上に3Dオブジェクトを重ねて表示する。

| 項目 | 詳細 |
|---|---|
| GitHub | https://github.com/hiukim/mind-ar-js |
| ライセンス | **MIT** |
| 最新バージョン | **1.2.5**（2025年1月リリース） |
| npm パッケージ名 | `mind-ar` |
| 開発者 | HiuKim Yuen |
| 週間ダウンロード数 | 約650 |

**主な技術的特徴:**
- TensorFlow.jsのWebGLバックエンドを活用したGPU高速化
- Web Workerによるメインスレッドのブロック回避
- A-FrameおよびThree.jsとの統合をネイティブサポート
- WebXR APIに依存しない → iOS Safariでも動作

---

## 1.2 画像トラッキングの仕組み

Natural Feature Tracking (NFT) に基づく。従来のマーカーAR（ARToolKit等の白黒パターン）とは異なり、任意の画像をターゲットとして使用可能。

**動作原理:**
1. **特徴点検出**: ターゲット画像から識別可能な特徴点を抽出
2. **特徴点マッチング**: カメラ映像の各フレームから検出された特徴点と、コンパイル済みターゲットの特徴点を照合
3. **姿勢推定**: マッチした特徴点の位置関係からターゲットの6DoF（位置 + 回転）を算出
4. **トラッキング**: フレーム間で特徴点を追跡。OneEuroFilterで滑らかさを確保

| 特性 | マーカーAR (ARToolKit) | 画像トラッキング (MindAR) |
|---|---|---|
| ターゲット | 白黒の正方形パターン | 任意の画像 |
| 認識方式 | パターン全体の形状マッチング | 特徴点の検出とマッチング |
| 部分隠蔽への耐性 | 低い（枠が隠れると即失敗） | 中程度（約70%が見えれば認識可能） |
| 処理コスト | 低い | 高い |

---

## 1.3 対応プラットフォーム

| プラットフォーム | 対応状況 | 備考 |
|---|---|---|
| **iOS Safari** | 対応 | HTTPS必須。多数ターゲット（6個以上）でクラッシュ報告あり |
| **Android Chrome** | 対応 | 最も安定した環境 |
| **Firefox** | 非推奨 | 画像トラッキングで問題報告あり |
| **iOS Chrome** | 非対応 | WKWebViewがgetUserMediaを制限 |

---

## 1.4 画像ターゲットの準備

### 良い画像ターゲットの条件

**必須条件:**
- **豊富で一意な特徴点**: 他と区別できるパッチが画像全体に均一に分布
- **高コントラスト**: 明暗の**急激な変化**が重要。グラデーションは役に立たない
- **複雑なテクスチャ**: 形、パターン、テクスチャの変化が多いほど良い

**避けるべき画像:**
- 繰り返しパターン（タイル状デザイン）
- 対称的なデザイン
- 大きな空白・無地エリア
- 低コントラスト、グラデーションのみ

**注意:** **色は関係ない**。多くのARエンジンは画像をグレースケールに変換して処理する。

### 使える画像の種類

| 画像タイプ | 適合度 | 備考 |
|---|---|---|
| 写真（風景、人物） | 優秀 | テクスチャが豊富 |
| ポスター・イラスト | 良好 | 細部が多いもの |
| 絵画 | 良好 | 油絵等テクスチャリッチなもの |
| ロゴ（複雑） | 条件付き | 周囲に背景を追加すると改善 |
| ロゴ（シンプル） | 不向き | 特徴点が少なすぎる |
| QRコード | 不向き | 繰り返しパターンが多い |

### 画像ターゲットコンパイラ

MindARはブラウザベースのコンパイラツールを提供。

**手順:**
1. https://hiukim.github.io/mind-ar-js-doc/tools/compile/ にアクセス
2. ターゲット画像をドラッグ＆ドロップ
3. 「Start」をクリック → 特徴点分布が可視化される（品質確認）
4. `targets.mind` ファイルをダウンロード

**プログラマティックAPI:**
```javascript
const compiler = new window.MINDAR.Compiler();
const dataList = await compiler.compileImageTargets(images, (progress) => {
  console.log('Compilation progress:', progress);
});
const exportedBuffer = await compiler.exportData();
```

### 推奨画像解像度

| 項目 | 推奨値 |
|---|---|
| 最小解像度 | 幅/高さ **500px** 以上 |
| 推奨解像度 | **1000px** 以上 |
| 上限 | 1000px以上にしても精度向上は微小（処理コスト増のみ） |
| 推奨アスペクト比 | 1:1が最適。3:4, 2:3, 16:9も可 |

### 複数画像ターゲット

- コンパイラに複数画像を同時アップロード可能
- 全ターゲットが1つの `.mind` ファイルにまとめられる
- 各ターゲットは `targetIndex: 0`, `1`, ... で参照
- 同時トラッキング数は `maxTrack` パラメータで制御（デフォルト: 1）

---

## 1.5 実装例

### Three.js 統合（A-Frameなし）

v1.2.0以降、Three.jsは外部依存として分離。プロジェクトで使用するThree.jsバージョンを選択可能（最低v137以上）。

```html
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script type="importmap">
  {
    "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
      "mindar-image-three": "https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-three.prod.js"
    }
  }
  </script>
</head>
<body>
  <div id="container" style="width:100vw;height:100vh;position:relative;overflow:hidden;"></div>
  <script type="module">
    import * as THREE from 'three';
    import { MindARThree } from 'mindar-image-three';

    const mindarThree = new MindARThree({
      container: document.querySelector("#container"),
      imageTargetSrc: './targets.mind',
      filterMinCF: 0.001,
      filterBeta: 1000,
      missTolerance: 5,
      warmupTolerance: 5,
    });

    const { renderer, scene, camera } = mindarThree;

    // アンカーの追加（targetIndex: 0 = 最初のターゲット）
    const anchor = mindarThree.addAnchor(0);

    // 3Dオブジェクトをアンカーに追加
    const geometry = new THREE.PlaneGeometry(1, 0.55);
    const material = new THREE.MeshBasicMaterial({
      color: 0x00ffff, transparent: true, opacity: 0.5
    });
    const plane = new THREE.Mesh(geometry, material);
    anchor.group.add(plane);

    // AR開始
    await mindarThree.start();
    renderer.setAnimationLoop(() => {
      renderer.render(scene, camera);
    });
  </script>
</body>
</html>
```

### MindARThree API

| メソッド/プロパティ | 説明 |
|---|---|
| `new MindARThree({container, imageTargetSrc, ...})` | インスタンス生成 |
| `.renderer` / `.scene` / `.camera` | Three.jsオブジェクト |
| `.addAnchor(targetIndex)` | アンカー追加。`.group` にオブジェクトを追加 |
| `.start()` | カメラ起動 + トラッキング開始（async） |
| `.stop()` | トラッキング停止 |
| `.switchCamera()` | 前面/背面カメラ切り替え |

### React Three Fiber (R3F) 統合

サードパーティの **react-three-mind** ライブラリで R3F と統合可能。

```bash
npm i react-three-mind
```

```jsx
import { ARView, ARAnchor } from "react-three-mind";

export default function App() {
  return (
    <ARView
      imageTargets="./targets.mind"
      maxTrack={1}
      filterMinCF={0.0001}
      filterBeta={1000}
      warmupTolerance={5}
      missTolerance={5}
      autoplay={true}
    >
      <ARAnchor
        target={0}
        onAnchorFound={() => console.log("ターゲット検出")}
        onAnchorLost={() => console.log("ターゲットロスト")}
      >
        <mesh>
          <planeGeometry args={[1, 0.55]} />
          <meshBasicMaterial color="cyan" transparent opacity={0.5} />
        </mesh>
      </ARAnchor>
    </ARView>
  );
}
```

**注意:** react-three-mindはサードパーティ（51スター、v0.3.0）で小規模。プロダクション利用には十分なテストが必要。

### A-Frame 統合

```html
<html>
<head>
  <script src="https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image.prod.js"></script>
  <script src="https://aframe.io/releases/1.5.0/aframe.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-aframe.prod.js"></script>
</head>
<body>
  <a-scene
    mindar-image="imageTargetSrc: ./targets.mind; maxTrack: 2"
    vr-mode-ui="enabled: false"
    device-orientation-permission-ui="enabled: false">

    <a-camera position="0 0 0" look-controls="enabled: false"></a-camera>

    <a-entity mindar-image-target="targetIndex: 0">
      <a-plane color="blue" opacity="0.5" position="0 0 0"
               height="0.552" width="1"></a-plane>
    </a-entity>

    <a-entity mindar-image-target="targetIndex: 1">
      <a-gltf-model src="#model" scale="0.05 0.05 0.05"
                     position="0 -0.25 0"></a-gltf-model>
    </a-entity>
  </a-scene>
</body>
</html>
```

### トラッキング設定パラメータ

| パラメータ | デフォルト | 説明 |
|---|---|---|
| `filterMinCF` | 0.001 | OneEuroFilterカットオフ周波数。小さくするとジッター減少、遅延増加 |
| `filterBeta` | 1000 | OneEuroFilter速度係数。大きくすると遅延減少、ジッター増加 |
| `warmupTolerance` | 5 | 検出成功と判定するまでの連続検出フレーム数 |
| `missTolerance` | 5 | ロストと判定するまでの連続未検出フレーム数 |
| `maxTrack` | 1 | 同時トラッキングの最大数。**パフォーマンスへの影響大** |

---

## 1.6 現実世界でのマーカー設置方法

### 印刷とデプロイ

- **デジタル元画像と印刷物が一致すること**: コンパイラに入力した画像と同じものを印刷
- **平らで剛性のある素材**: 厚紙、フォームボード、アルミ複合板等。薄い紙は変形しやすい
- **光沢のない仕上げ**: マット仕上げ推奨。光沢素材は反射で特徴点が消える

### 印刷サイズと検出距離の関係

| 印刷サイズ | 推奨最大検出距離 | 用途 |
|---|---|---|
| A5 (148x210mm) | 約0.5〜1m | テーブル上、近接展示 |
| A4 (210x297mm) | 約1〜1.5m | 壁面掲示、ポスター |
| A3 (297x420mm) | 約1.5〜2.5m | 展示パネル |
| A2〜A1 | 約2〜4m | 大型バナー |

**原則:** ターゲットが大きいほど遠くから検出可能。ただしカメラフレーム内にターゲット全体が収まる必要がある。

### 屋外設置・天候対策

| 対策 | 詳細 |
|---|---|
| **ラミネート加工** | **マット仕上げ**のラミネートを推奨。光沢は反射問題 |
| **防水加工** | 屋外掲示では必須。耐水性インクジェットメディア or ラミネート |
| **UVコーティング** | 長期屋外設置では色褪せ防止のためUV保護を検討 |
| **夜間** | 照明なしでは**認識不可**。別途照明の設置が必要 |

### 照明条件

- **十分な照明が必須**: カメラ映像が暗いと特徴点が検出できない
- **均一な照明が理想**: 強い影やスポットライトは避ける
- **逆光**: カメラの自動露出でターゲットが暗くなる可能性

### QRコードとの併用

QRコード自体はARターゲットとして**不向き**（繰り返しパターン）。
ただし**導線として組み合わせ可能**:

1. QRコードをスキャン → WebAR体験のURLに誘導
2. そのページで画像トラッキングを起動
3. **レイアウト**: ターゲット画像の横や下にQRコードを配置（ターゲット画像に重ねない）

---

## 1.7 制限事項

| 制限 | 詳細 |
|---|---|
| トラッキング距離 | A4サイズで約1.5m。印刷サイズとカメラ解像度に依存 |
| 角度耐性 | 約±45〜60度。極端な角度ではトラッキングが外れる |
| オクルージョン | 処理機能なし。ターゲットの30%以上が隠れると認識失敗 |
| ワールドトラッキング | 非対応（平面検出やSLAM機能なし） |
| 同時ターゲット数 | 6個以上でモバイルブラウザがクラッシュする報告あり |
| Firefox | 動作不安定 |

---

## 1.8 npm パッケージ

```bash
npm i mind-ar --save
```

4つの独立ビルド:

| ビルド | CDN パス | 用途 |
|---|---|---|
| Image + A-Frame | `mind-ar/dist/mindar-image-aframe.prod.js` | A-Frameでの画像トラッキング |
| Image + Three.js | `mind-ar/dist/mindar-image-three.prod.js` | Three.jsでの画像トラッキング |
| Face + A-Frame | `mind-ar/dist/mindar-face-aframe.prod.js` | 顔トラッキング |
| Face + Three.js | `mind-ar/dist/mindar-face-three.prod.js` | 顔トラッキング |

---

## 1.9 参照リンク

- [MindAR GitHub](https://github.com/hiukim/mind-ar-js)
- [MindAR 公式ドキュメント](https://hiukim.github.io/mind-ar-js-doc/)
- [画像ターゲットコンパイラ](https://hiukim.github.io/mind-ar-js-doc/tools/compile/)
- [画像ターゲット選定ガイド](https://www.mindar.org/how-to-choose-a-good-target-image-for-tracking-in-ar-part-2/)
- [react-three-mind (R3F統合)](https://github.com/tommasoturchi/react-three-mind)
- [mind-ar-js-react (公式Reactサンプル)](https://github.com/hiukim/mind-ar-js-react)

---
---

# 2. マーカーAR (AR.js)

## 2.1 概要

AR.jsのマーカーモードは、白黒のパターンマーカーやバーコードマーカーを検出してARコンテンツを表示する方式。
内部的には **artoolkit5-js**（ARToolKitのJavaScript/WebAssembly移植）を使用しており、数十年の実績がある検出エンジン。

AR.jsの3つのトラッキングモード:

| モード | 説明 | 用途 |
|---|---|---|
| **Marker-based** | 白黒パターンマーカー / バーコード検出 | チラシ、書籍、屋内AR |
| **Image Tracking (NFT)** | 任意画像の特徴点マッチング | ポスター、パッケージ |
| **Location-based** | GPS + コンパスで座標配置 | 屋外ナビ、観光 |

**マーカーモード vs NFTモード:**
- マーカー: 専用の白黒パターン必要だが**CPU負荷が極めて低い**。バーコードなら数百個同時対応可能
- NFT: 任意画像だが**CPU負荷が高い**。事前に記述子ファイル(.fset, .fset3, .iset)の生成が必要

---

## 2.2 マーカーの種類

### Hiro / Kanji（プリセット）

テスト・デモ用のビルトインマーカー。

```html
<a-marker preset="hiro">
  <a-box color="yellow"></a-box>
</a-marker>

<a-marker preset="kanji">
  <a-sphere color="red" radius="0.5"></a-sphere>
</a-marker>
```

### カスタムパターンマーカー

任意の高コントラスト画像からマーカーを作成。

**マーカートレーニングツール:**
- URL: https://ar-js-org.github.io/studio/
- 出力: 印刷用マーカー画像(PNG) + `.patt` ファイル（パターン記述子）

**.patt ファイル形式:**
- 画像を **16x16 ピクセル** に縮小
- 3色チャンネル(B,G,R)を4回転分(0°, 90°, 180°, 270°)格納
- 16x16解像度のため、**細かいデザインは不可**

```html
<a-marker type="pattern" url="/markers/my-marker.patt">
  <a-entity gltf-model="#myModel"></a-entity>
</a-marker>
```

### バーコードマーカー（マトリクス型）

白黒の正方形グリッドで数値IDをエンコード。**定数時間**で認識されるため、大量マーカーでもパフォーマンス影響が少ない。

```html
<a-marker type="barcode" value="5">
  <a-text value="Marker 5" color="blue"></a-text>
</a-marker>
```

**マトリクスタイプと容量:**

| マトリクスタイプ | 設定値 | 最大マーカー数 | ハミング距離 | 推奨用途 |
|---|---|---|---|---|
| 3x3 | `3x3` | 64 | 0 | 低コスト、信頼性低 |
| 3x3_HAMMING63 | `3x3_HAMMING63` | **8** | 3 | 少数で高信頼性 |
| 3x3_PARITY65 | `3x3_PARITY65` | 32 | 1 | 中間 |
| 4x4_BCH_13_9_3 | `4x4_BCH_13_9_3` | **512** | 3 | 大量マーカー |
| 4x4_BCH_13_5_5 | `4x4_BCH_13_5_5` | 32 | 5 | 高信頼性 |

**ハミング距離**: マーカーコード間の最小ビット差。大きいほど誤認識率が低い。

既製バーコードマーカー集: https://github.com/nicolocarpignoli/artoolkit-barcode-markers-collection

---

## 2.3 カスタムマーカーの設計ガイドライン

1. **高コントラスト**: 黒と白のみ使用（カラー不可）
2. **太い黒枠**: 検出器がまず枠を探す。枠が認識の起点
3. **シンプルなデザイン**: 内部は16x16に縮小されるため、太く大胆な形が有効
4. **回転非対称**: 90°/180°/270°回転で同じに見えないデザインにする（ジッター防止）
5. **枠の外に白い余白**: 背景との区別のため
6. **パターン比率（patternRatio）**: デフォルト0.5。内部パターンがマーカー全体の50%。大きくすると枠が薄くなり検出が不安定に

```html
<!-- patternRatio はマーカー生成時と一致させる必要がある -->
<a-scene arjs="patternRatio: 0.5;">
```

---

## 2.4 対応プラットフォーム

| プラットフォーム | 対応状況 | 備考 |
|---|---|---|
| **iOS Safari** | 対応 | iOS 13+ でDeviceOrientation権限リクエスト必須 |
| **iOS Chrome** | **非対応** | WKWebViewがgetUserMediaを制限 |
| **Android Chrome** | 完全対応 | 最良の環境 |
| **デスクトップブラウザ** | 対応 | Webカメラで開発・テスト可能 |

**必須要件:** HTTPS（localhostは例外）

---

## 2.5 実装例

### A-Frame 統合

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://aframe.io/releases/1.6.0/aframe.min.js"></script>
  <script src="https://raw.githack.com/AR-js-org/AR.js/master/aframe/build/aframe-ar.js"></script>
</head>
<body style="margin: 0; overflow: hidden;">
  <a-scene
    embedded
    arjs="sourceType: webcam; debugUIEnabled: false;
          detectionMode: mono_and_matrix; matrixCodeType: 3x3;"
    vr-mode-ui="enabled: false"
    renderer="logarithmicDepthBuffer: true;">

    <!-- Hiro マーカー -->
    <a-marker preset="hiro">
      <a-box position="0 0.5 0" material="color: yellow;"></a-box>
    </a-marker>

    <!-- カスタムパターンマーカー -->
    <a-marker type="pattern" url="path/to/my-marker.patt">
      <a-entity gltf-model="url(model.glb)" scale="0.1 0.1 0.1"></a-entity>
    </a-marker>

    <!-- バーコードマーカー #5 -->
    <a-marker type="barcode" value="5">
      <a-text value="Barcode #5" position="0 0.5 0" align="center"></a-text>
    </a-marker>

    <a-entity camera></a-entity>
  </a-scene>
</body>
</html>
```

### `arjs` 属性パラメータ

| パラメータ | 値 | 説明 |
|---|---|---|
| `sourceType` | `webcam`, `image`, `video` | 入力ソース |
| `debugUIEnabled` | `true`/`false` | デバッグUI表示 |
| `detectionMode` | `mono`, `mono_and_matrix` | 検出アルゴリズム |
| `matrixCodeType` | `3x3`, `4x4_BCH_13_9_3` 等 | バーコードタイプ |
| `patternRatio` | `0.5`（デフォルト） | パターン比率 |
| `maxDetectionRate` | `60`（デフォルト） | 最大検出頻度 |

### `<a-marker>` 属性

| 属性 | 説明 |
|---|---|
| `type` | `pattern`, `barcode` |
| `preset` | `hiro`, `kanji` |
| `url` | .pattファイルパス（type=pattern時） |
| `value` | バーコードID（type=barcode時） |
| `size` | 物理マーカーサイズ（メートル単位、デフォルト: 1） |
| `emitevents` | markerFound/markerLostイベント発火 |
| `smooth` | スムージング有効化 |
| `smooth-count` | スムージング行列数（デフォルト: 5） |
| `smooth-tolerance` | 距離閾値（デフォルト: 0.01） |
| `smooth-threshold` | 安定性閾値（デフォルト: 2） |

### マーカーイベント

```javascript
const marker = document.getElementById('myMarker');
marker.addEventListener('markerFound', () => {
  console.log('マーカー検出');
});
marker.addEventListener('markerLost', () => {
  console.log('マーカーロスト');
});
```

### Three.js 統合（A-Frameなし）

```html
<script type="importmap">
  { "imports": {
    "threex": "https://raw.githack.com/AR-js-org/AR.js/master/three.js/build/ar-threex.mjs",
    "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js"
  }}
</script>
<script type="module">
import * as THREE from 'three'
import { ArToolkitSource, ArToolkitContext, ArMarkerControls } from 'threex'

ArToolkitContext.baseURL = 'https://raw.githack.com/AR-js-org/AR.js/master/three.js/'

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setClearColor(new THREE.Color('lightgrey'), 0);
renderer.setSize(640, 480);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.Camera();
scene.add(camera);

// Webcam ソース
const arToolkitSource = new ArToolkitSource({ sourceType: 'webcam' });
arToolkitSource.init(() => { /* ready */ });

// 検出エンジン
const arToolkitContext = new ArToolkitContext({
  cameraParametersUrl: ArToolkitContext.baseURL + '../data/data/camera_para.dat',
  detectionMode: 'mono',
  patternRatio: 0.5,
});
arToolkitContext.init(() => {
  camera.projectionMatrix.copy(arToolkitContext.getProjectionMatrix());
});

// マーカーコントロール
const arMarkerControls = new ArMarkerControls(arToolkitContext, camera, {
  type: 'pattern',
  patternUrl: ArToolkitContext.baseURL + '../data/data/patt.hiro',
  changeMatrixMode: 'cameraTransformMatrix',
  smooth: true,
});
scene.visible = false;

// 3Dコンテンツ
const mesh = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshNormalMaterial({ transparent: true, opacity: 0.5 })
);
mesh.position.y = 0.5;
scene.add(mesh);

// レンダリングループ
function animate() {
  requestAnimationFrame(animate);
  if (arToolkitSource.ready) {
    arToolkitContext.update(arToolkitSource.domElement);
    scene.visible = camera.visible;
  }
  renderer.render(scene, camera);
}
animate();
</script>
```

---

## 2.6 現実世界でのマーカー設置方法

### 印刷ガイドライン

- **マット紙に印刷**: 光沢紙はグレア（反射）が検出を妨害
- **レーザープリンター推奨**: シャープなエッジと安定した白黒コントラスト
- **黒枠が完全に印刷されていること**: にじみや薄れがないこと
- **白い余白を確保**: マーカーサイズの25%以上

### マーカーサイズと検出距離の関係

| 物理マーカーサイズ | 有効検出距離 |
|---|---|
| 3 cm | 約40〜50 cm |
| 5 cm | 約1 m |
| 10 cm | 約1.5〜2 m（テーブル用途） |
| 20 cm | 約3〜4 m |
| 30 cm+ | 約5〜6 m（屋内サイネージ） |

**原則:** カメラ画像内でマーカーが約 **40x40ピクセル** 以上必要。これ以下ではARToolKitが認識不可。

**`size` 属性**: AR.jsの `size` はマーカーの物理サイズ（メートル単位）を指定。実際の印刷サイズと一致させることで、距離・スケール推定が正確になる。

### 屋外設置・天候対策

| 課題 | 対策 |
|---|---|
| **雨・水** | 防水ラミネートフィルム。通常のラミネートは防水ではない |
| **UV劣化** | UV保護ラミネート。屋外耐用5年以上 |
| **風** | 剛性素材（フォームボード、アルミ複合板、アクリル板）にマウント |
| **温度** | ラミネート済みなら -20℃〜+60℃ 耐用 |
| **長期屋外** | ビニールステッカーまたはアルミ複合板印刷。3〜5年耐用 |

### 照明条件

- **最良**: 拡散した均一な照明（曇天、均一な室内照明）
- **良好**: 明るい環境光でマーカーに影がない
- **問題あり**: 直射日光によるマーカー上の強い影、低照度、逆光
- **避ける**: 光沢面（ガラス、鏡）からの反射

### 設置のポイント

1. **平面に設置**: 曲面上のマーカーはパターンが歪み検出が不安定
2. **反射素材を避ける**: ガラス、鏡、光沢プラスチックの前に設置しない
3. **正面から見る角度が最適**: 急角度で検出精度が低下
4. **動かない場所に固定**: 風で揺れるとトラッキングがジッター

---

## 2.7 制限事項

| 制限 | 詳細 |
|---|---|
| 検出距離 | マーカーが40x40px以上でないと認識不可 |
| 角度耐性 | 約±45〜60度。60度以上で不安定 |
| 枠の遮蔽 | 黒枠が一部でも隠れると**即座に検出失敗** |
| デザイン制約 | 正方形＋黒枠が必須。自由なデザインはできない |
| 画面表示マーカー | 画面の輝度・リフレッシュレート・反射で検出不安定 |

---

## 2.8 npmパッケージ・CDN

**npm:**
```bash
npm install @ar-js-org/ar.js
```

**CDN:**
```html
<!-- A-Frame: マーカー + ロケーション -->
<script src="https://raw.githack.com/AR-js-org/AR.js/master/aframe/build/aframe-ar.js"></script>

<!-- A-Frame: NFT + ロケーション -->
<script src="https://raw.githack.com/AR-js-org/AR.js/master/aframe/build/aframe-ar-nft.js"></script>

<!-- Three.js: ES module -->
<!-- import from "https://raw.githack.com/AR-js-org/AR.js/master/three.js/build/ar-threex.mjs" -->
```

---

## 2.9 参照リンク

- [AR.js 公式ドキュメント](https://ar-js-org.github.io/AR.js-Docs/)
- [AR.js Marker-Based](https://ar-js-org.github.io/AR.js-Docs/marker-based/)
- [AR.js GitHub](https://github.com/AR-js-org/AR.js/)
- [AR.js Studio（マーカー生成）](https://ar-js-org.github.io/studio/)
- [ARToolKit バーコードマーカー集](https://github.com/nicolocarpignoli/artoolkit-barcode-markers-collection)
- [@ar-js-org/ar.js (npm)](https://www.npmjs.com/package/@ar-js-org/ar.js)

---
---

# 3. GPS + コンパス

## 3.1 概要

GPS座標とコンパス方位を使い、現実世界の緯度・経度にARオブジェクトを配置するアプローチ。
物理マーカーが不要で、屋外の広域AR体験に適する。

**技術スタック:**
- **Geolocation API**: GPS座標の取得
- **DeviceOrientationEvent**: コンパス方位 + デバイス傾き
- **Three.js + getUserMedia**: 3Dレンダリング + カメラ映像背景

**既存の詳細な技術調査は `report.md` を参照。** ここでは現場セットアップを中心にまとめる。

---

## 3.2 精度の期待値（再掲）

### GPS精度

| 環境 | 精度範囲 |
|---|---|
| 屋外（見通し良好） | **3〜5m** |
| 屋外（一般的） | **5〜10m** |
| 屋外（都市部、ビル谷間） | **10〜20m** |
| 屋内（WiFi測位） | **10〜40m** |

### コンパス精度

| 環境 | 精度範囲 |
|---|---|
| 屋外・キャリブ済み | **±5〜10度** |
| 一般的な屋外 | **±10〜15度** |
| 屋内 | **±20度以上** |

### ARでの実質的影響

- **50m先**: GPS 5m誤差 + コンパス 10度誤差 → **合計約10mのずれ**
- **200m先**: コンパス10度誤差 → 表示位置が**約35m**ずれる
- **近距離（50m以内）ではGPS精度が不足する可能性が高い**

---

## 3.3 現実世界でのセットアップ

### GPS座標の測量・記録

**ツール:**

| ツール | 精度 | 用途 |
|---|---|---|
| Google Maps（PC）右クリック→座標コピー | 1〜3m | デスク事前調査 |
| Google Maps（モバイル）長押し→ピンドロップ | GPS精度に依存 | 現場での粗い記録 |
| GPS Coordinates アプリ | GPS精度に依存 | 小数点以下6桁の座標取得 |
| ArcGIS Field Maps | サブメートル | プロフェッショナル用途 |

**精度向上テクニック:**
- **複数回計測の平均**: 5〜10回の計測値の中央値を採用
- 極端な外れ値は除外
- 開けた場所で、同じ地点に数分間滞在して計測

### GPSドリフトへの対策

```javascript
// 移動平均フィルタ
class PositionFilter {
  constructor(windowSize = 5) {
    this.buffer = [];
    this.windowSize = windowSize;
  }
  update(lat, lon) {
    this.buffer.push({ lat, lon });
    if (this.buffer.length > this.windowSize) this.buffer.shift();
    return {
      lat: this.buffer.reduce((s, p) => s + p.lat, 0) / this.buffer.length,
      lon: this.buffer.reduce((s, p) => s + p.lon, 0) / this.buffer.length,
    };
  }
}
```

- AR.jsの `gpsMinDistance` で小さな移動を無視（デフォルト: 5m）
- `gpsMinAccuracy` で精度が悪いGPS測位をスキップ（デフォルト: 100m）
- POIの「スナップ範囲」を設計（例: 10m以内に入ったら表示）

### ユーザーの誘導方法

**物理的サイネージ:**
- AR体験の開始地点に案内看板を設置
- **QRコード**でWebARのURLに誘導（動的QRコード推奨、エラー訂正レベルH）
- QRコード最小サイズ: 2cm x 2cm（15cm距離）、10cm x 10cm（50cm距離）

**ハイブリッドアプローチ:**
1. GPSで大まかな位置に誘導（「あと30m先です」）
2. 到着後、画像マーカーやARマーカーで精密な配置に切り替え

**地面マーカー:**
- 足跡マーク、方向矢印、距離線で立ち位置を案内

### 環境条件

**最適な条件:**
- 空が150度以上見通せる開けた場所
- 高層ビルから離れた場所
- 曇天〜晴天（GPSには影響なし）

**都市部の問題（アーバンキャニオン）:**
- ビル反射によるマルチパス → 5〜30mの誤差
- 衛星遮蔽による精度劣化
- **緩和策**: 開けた広場や公園を体験開始地点にする、ビルから5m以上離れる

**天候の影響:**
- 雨・雲はGPS精度にほぼ影響なし
- 磁気嵐（太陽活動）はコンパスに数十メートルの誤差を与えうる（稀）
- 照明条件はカメラ映像の品質に影響

---

## 3.4 実装方法

### AR.js ロケーションベースモード

最も手軽な実装方法。A-Frame版とThree.js版がある。

**A-Frame版:**
```html
<script src="https://aframe.io/releases/1.3.0/aframe.min.js"></script>
<script src="https://raw.githack.com/AR-js-org/AR.js/master/aframe/build/aframe-ar-nft.js"></script>

<a-scene
  vr-mode-ui="enabled: false"
  arjs="sourceType: webcam; videoTexture: true; debugUIEnabled: false;">

  <a-camera gps-new-camera="gpsMinDistance: 5"></a-camera>

  <!-- 東京タワーの座標に赤い箱を配置 -->
  <a-entity
    gps-new-entity-place="latitude: 35.6586; longitude: 139.7454"
    scale="20 20 20"
    geometry="primitive: box"
    material="color: red">
  </a-entity>
</a-scene>
```

**Three.js版（A-Frameなし）:**
```javascript
import * as THREE from 'three';
import { THREEx } from 'ar-threex';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 10000);
const renderer = new THREE.WebGLRenderer({ alpha: true });

const locationBased = new THREEx.LocationBased(scene, camera, {
  gpsMinDistance: 5,
  gpsMinAccuracy: 100
});
const webcamRenderer = new THREEx.WebcamRenderer(renderer);

// GPS座標にオブジェクト配置
const box = new THREE.Mesh(
  new THREE.BoxGeometry(20, 20, 20),
  new THREE.MeshBasicMaterial({ color: 0xff0000 })
);
locationBased.add(box, 139.7454, 35.6586); // (経度, 緯度)

locationBased.startGps();

function render() {
  webcamRenderer.update();
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}
render();
```

### gps-new-camera 設定オプション

| オプション | デフォルト | 説明 |
|---|---|---|
| `gpsMinDistance` | 5 | GPS更新の最小移動距離(m) |
| `positionMinAccuracy` | 100 | 許容する精度の閾値(m) |
| `gpsTimeInterval` | 0 | GPS更新の最小間隔(ms) |
| `simulateLatitude` | - | テスト用仮緯度 |
| `simulateLongitude` | - | テスト用仮経度 |

### 自前実装アプローチ

AR.jsを使わず、以下を自前で組み合わせることも可能:

1. Geolocation API → GPS座標取得
2. DeviceOrientationEvent → コンパス + ジャイロ
3. Spherical Mercator投影 → GPS→ワールド座標変換
4. Three.js → 3Dレンダリング
5. getUserMedia → カメラ映像背景

**利点:** 依存最小化、完全な制御、バンドルサイズ最適化
**欠点:** プラットフォーム差異のハンドリングが煩雑

（自前実装の詳細コード例は `report.md` セクション11を参照）

---

## 3.5 テスト・デバッグ

### Chrome DevTools GPS シミュレーション

1. DevTools → More tools → Sensors
2. Location ドロップダウン → カスタム座標を入力
3. Geolocation APIが入力座標を返す

**制限:** DeviceOrientationEvent（コンパス）はシミュレートできない

### AR.jsのシミュレーションモード

```html
<a-camera gps-new-camera="simulateLatitude: 35.6762;
                           simulateLongitude: 139.6503">
</a-camera>
```

### フィールドテスト手順

1. **机上テスト**: シミュレート座標でUI・座標変換を確認
2. **単独屋外テスト**: 1デバイスで基本動作確認
3. **複数デバイステスト**: iOS + Android で挙動差を確認
4. **ユーザビリティテスト**: 第三者にARを体験させ、誘導フローを検証
5. **本番環境テスト**: 実際の設置場所で最終確認

---

## 3.6 適する用途 vs 適さない用途

### 適する用途

| 用途 | 理由 |
|---|---|
| **観光案内（大規模POI）** | 建物は大きいので5〜10mの誤差が気にならない |
| **ナビゲーション矢印** | 方向の指し示しが主目的 |
| **ゲーム（Pokemon Go風）** | GPSで大まかに誘導、到着後はタップ操作 |
| **不動産の3D表示** | 大きな建物の可視化 |
| **教育（歴史的建造物復元）** | 広域可視化 |

### 適さない用途

| 用途 | 理由 |
|---|---|
| **テーブル上のAR** | cm精度が必要 |
| **屋内ナビ** | GPSが届かない |
| **精密オーバーレイ** | 数mのずれが明白 |
| **近距離の小さなオブジェクト** | 5m誤差でオブジェクトが見えない |

---

## 3.7 現場セットアップの実例

### 観光ARガイド

- **事前**: Google Maps PCで主要POIの座標を記録
- **現地**: 各POIの正確な座標をGPSアプリで複数回計測・平均化
- **設置**: 体験開始地点にQRコード付き案内看板
- **設計**: POIは50m以上の間隔を確保。建物など大きな対象を選ぶ
- **テスト**: 異なる時間帯・天候で検証

### 屋外展示AR

- **パターン1: スタンプラリー型** — 複数地点を回遊、各地点でARコンテンツ
- **パターン2: ガイドツアー型** — 順路に沿ってナビゲーション
- **パターン3: 自由探索型** — 地図上にPOIを表示、自由に移動

### ハイブリッド（GPS + マーカー）

最も精度が高いアプローチ:
1. GPSで「あと○m先に展示があります」とナビゲーション
2. 到着したら画像マーカー（MindAR）で精密なAR表示
3. **GPSの弱点（近距離精度）をマーカーが補完**

---

## 3.8 参照リンク

- [AR.js Location-Based Documentation](https://ar-js-org.github.io/AR.js-Docs/location-based/)
- [MDN Geolocation API](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API)
- [MDN DeviceOrientationEvent](https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent)
- [Movable Type - Lat/Long Calculations](https://www.movable-type.co.uk/scripts/latlong.html)
- 詳細な技術実装・コード例は `report.md` を参照

---
---

# 4. 推奨戦略

## 第一候補: 画像トラッキング (MindAR)

**採用すべき場面:**
- 特定の場所・対象物にARコンテンツを正確に重ねたい
- cm単位の精度が必要
- 屋内外両方で使いたい
- ターゲット画像のデザイン自由度が欲しい

**現場の準備:**
1. ターゲット画像をデザイン（高コントラスト、豊富な特徴点）
2. MindARコンパイラで `.mind` ファイル生成
3. マット紙に印刷 → ラミネート（屋外の場合）
4. 横にQRコード（WebAR URLへの導線）を配置
5. A4サイズなら約1.5m、A3なら約2.5mの距離で使用

## 第二候補: マーカーAR (AR.js)

**採用すべき場面:**
- 大量のマーカーが必要（バーコードで最大512種類）
- 処理負荷を最小化したい
- マーカーデザインに自由度が不要（白黒パターンで可）
- カードゲーム、スタンプラリー等

**現場の準備:**
1. マーカートレーニングツールまたはバーコードマーカー集を使用
2. マット紙に印刷、白い余白を十分に確保
3. 平面に固定（曲面不可）
4. マーカーサイズ = 使用距離に応じて選定（10cmで約2m）

## 第三候補: GPS + コンパス

**採用すべき場面:**
- 広域の屋外AR体験
- マーカーの設置が物理的に不可能な場所
- 方向の指し示しレベルの精度で十分
- 50m以上離れた大きな対象物

**現場の準備:**
1. POI座標をGoogle Maps + 現地GPS計測で記録
2. 開始地点にQRコード付き案内看板
3. 開けた場所を体験開始地点に選定
4. テスト: 複数デバイス、異なる時間帯で検証
