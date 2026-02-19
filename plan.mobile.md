# AR Fish App - 実装計画

## 概要

スマートフォンのブラウザ（iOS Safari / Android Chrome）で動作する、
カメラ映像の上に3Dの魚が泳ぐWebARアプリケーションを作成する。
フロントエンドのみで完結し、GitHub Pagesにデプロイする。

---

## 1. 技術選定

### 1.1 ARライブラリの比較と結論

| ライブラリ | iOS対応 | Android対応 | マーカー不要 | 評価 |
|---|---|---|---|---|
| Babylon.js (WebXR) | x | o | o | iOS非対応が致命的 |
| Three.js + @react-three/xr (WebXR) | x | o | o | iOS非対応が致命的 |
| A-Frame + AR.js | o | o | x (マーカー必須) | マーカーが必要で体験が制限される |
| MindAR | o | o | x (画像/顔追跡のみ) | 自由に泳ぐ魚には不向き |
| model-viewer | △ | o | - | 単一モデル表示用、動的制御不可 |

**重要: WebXRはiOS Safariで非対応**（2026年2月現在）。
Babylon.jsやThree.js+WebXRではiPhoneで動作しない。

### 1.2 採用方式: Three.js (react-three-fiber) + getUserMedia カメラオーバーレイ

**選定理由:**
- `getUserMedia` APIでカメラ映像を取得（iOS Safari 11+、Android Chrome対応）
- Three.jsで3D魚を描画し、カメラ映像の上に透過レイヤーとして重ねる
- WebXRに依存しないため、iOS/Android両方で動作する
- react-three-fiber (R3F) はThree.jsのReactバインディングとして最も成熟

**制約:**
- 魚はワールドロック（実空間に固定）されない
- ただし「カメラ越しに魚が泳いで見える」という体験には十分

### 1.3 バックエンド: 不要

フロントエンドのみで完結。GitHub Pagesに静的サイトとしてデプロイ。

---

## 2. 技術スタック

### 2.1 パッケージとバージョン（2026年2月時点の最新安定版）

| カテゴリ | パッケージ | バージョン | 備考 |
|---|---|---|---|
| 言語 | TypeScript | 5.9.3 | Vite 7 同梱 |
| フレームワーク | react | 19.2.4 | R3F 9.x が React 19 を必須とする |
| フレームワーク | react-dom | 19.2.4 | react と同一バージョン |
| ビルド | vite | 7.3.1 | **Node.js >= 20.19.0 または >= 22.12.0 が必要** |
| ビルドプラグイン | @vitejs/plugin-react | 5.1.4 | Vite 7 対応済 |
| 3Dエンジン | three | 0.183.0 | 2026-02-18 リリース |
| 3D React統合 | @react-three/fiber | 9.5.0 | peer dep: react >=19, three >=0.156 |
| 3Dヘルパー | @react-three/drei | 10.7.7 | peer dep: R3F ^9, three >=0.159 |
| 型定義 | @types/three | 0.183.0 | three と同一バージョン |
| カメラ | getUserMedia API | - | ブラウザ標準。WebXR不要 |

### 2.2 互換性の確認結果

| 組み合わせ | 状態 |
|---|---|
| React 19.2.4 + R3F 9.5.0 | 互換 (peer dep `>=19 <19.3` を満たす) |
| React 19.2.4 + drei 10.7.7 | 互換 (peer dep `^19`) |
| three 0.183.0 + R3F 9.5.0 | 互換 (peer dep `>=0.156`) |
| three 0.183.0 + drei 10.7.7 | 互換 (peer dep `>=0.159`) |
| Vite 7.3.1 + @vitejs/plugin-react 5.1.4 | 互換 (peer dep `^7.0.0`) |

### 2.3 前提条件

- **Node.js**: >= 20.19.0 または >= 22.12.0（Vite 7 の要件）
- **HTTPS環境**: getUserMedia はセキュアコンテキスト必須（GitHub Pages は HTTPS）

---

## 3. モバイル対応の重要ポイント

### 3.1 iOS Safari の制約と対策

| 制約 | 対策 |
|---|---|
| WebXR immersive-ar 非対応 | getUserMedia + Canvas透過方式を採用（WebXR不使用） |
| video要素に属性が必須 | `autoPlay`, `muted`, `playsInline` を必ず設定 |
| カメラ解像度の上限 (1280x720) | `{ ideal: 1280 }` で指定（`exact` は使わない） |
| facingMode指定方法 | `{ ideal: 'environment' }` で指定（`exact` は使わない） |
| バックグラウンド復帰時にカメラが停止 | `visibilitychange` イベントでストリームを再取得 |
| PWAモードでgetUserMediaが不安定 | PWA化しない。ブラウザで開く前提 |
| getUserMediaにHTTPSが必須 | GitHub Pages（HTTPS標準）にデプロイ |

### 3.2 ビューポートとフルスクリーン

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

- `viewport-fit=cover`: ノッチ付きデバイス対応
- `position: fixed; inset: 0;` でフルスクリーン（`100vh` はアドレスバーの影響を受けるため不使用）
- `overscroll-behavior: none` でiOSのラバーバンドスクロールを防止

### 3.3 WebGL パフォーマンス（モバイル向け）

| 設定 | 値 | 理由 |
|---|---|---|
| devicePixelRatio | 上限2.0 | 3x以上はGPU負荷が9倍になる |
| antialias | false | モバイルのフィルレートを節約 |
| powerPreference | 'default' | iPadOS 17のコンテキスト消失バグ回避 |
| ポリゴン数 | 5万〜10万以下/フレーム | ミッドレンジ端末で60fps維持 |
| テクスチャサイズ | 1024x1024以下 | モバイルGPUメモリ制限 |
| ドローコール | 50以下/フレーム | モバイルの主要ボトルネック |

### 3.4 タッチ操作

- Canvas要素に `touch-action: none` を設定（ブラウザのピンチズーム・スクロールを無効化）
- UI要素には `touch-action: manipulation`（ダブルタップズーム無効化）
- `{ passive: false }` でtouchイベントの `preventDefault()` を有効化

---

## 4. レイヤー構成

```
┌─────────────────────────────────┐  z-index: 2  ← HTML UI（ボタン等）
│  pointer-events: none           │     ※ ボタンのみ pointer-events: auto
├─────────────────────────────────┤  z-index: 1  ← R3F Canvas（背景透過）
│  gl={{ alpha: true }}           │     ※ 3D魚の描画レイヤー
├─────────────────────────────────┤  z-index: 0  ← <video>要素
│  getUserMediaのカメラ映像        │     ※ object-fit: cover
└─────────────────────────────────┘
```

---

## 5. ディレクトリ構成

```
ar_app/
├── .github/
│   └── workflows/
│       └── deploy.yml          # GitHub Actions: GitHub Pagesデプロイ
├── src/
│   ├── main.tsx                # エントリーポイント
│   ├── App.tsx                 # ルートコンポーネント（状態管理）
│   ├── components/
│   │   ├── CameraBackground.tsx  # カメラ映像の表示（video要素）
│   │   ├── ARCanvas.tsx          # R3F Canvas（透過レイヤー）
│   │   ├── Fish.tsx              # 魚の3Dモデル + アニメーション
│   │   ├── FishSchool.tsx        # 魚群の管理（複数の魚を配置・移動）
│   │   ├── Lighting.tsx          # ライティング設定
│   │   └── StartScreen.tsx       # カメラ開始画面（権限リクエスト）
│   ├── hooks/
│   │   ├── useCamera.ts          # getUserMedia管理フック
│   │   └── useFishMovement.ts    # 魚の移動ロジック（Boidsアルゴリズム）
│   └── styles/
│       └── global.css            # グローバルスタイル
├── index.html                  # HTML テンプレート
├── vite.config.ts              # Vite設定（base パス含む）
├── tsconfig.json
├── package.json
└── plan.mobile.md
```

---

## 6. 機能要件

### MVP

1. **カメラ映像表示**: スマホの背面カメラ映像をフルスクリーン表示
2. **3D魚の描画**: カメラ映像の上に3Dの魚を描画
3. **魚のアニメーション**: 魚が自然に泳ぐアニメーション（尾びれの動き、方向転換）
4. **複数の魚**: 画面内に複数の魚が泳ぐ（Boidsアルゴリズム）
5. **モバイル最適化**: スマートフォン縦画面に最適化

### 3Dモデルについて

MVPではThree.jsのジオメトリでプロシージャル生成。外部モデルファイル不要。
将来的にSketchfab等のGLTFモデルに差し替え可能。

---

## 7. 実装ステップ

### Step 1: プロジェクトセットアップ

**作業内容:**
1. Vite + React + TypeScript プロジェクト作成
2. 依存パッケージのインストール
3. Vite設定（GitHub Pages用のbaseパス設定）
4. グローバルCSSの設定

**パッケージ:**
```bash
# プロジェクト作成（Vite 7 の react-ts テンプレート）
npm create vite@latest . -- --template react-ts

# 3D描画（バージョン明示）
npm install three@0.183.0 @react-three/fiber@9.5.0 @react-three/drei@10.7.7
npm install -D @types/three@0.183.0
```

**vite.config.ts:**
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/ar_app/',   // GitHub Pagesのリポジトリ名に合わせる
})
```

**global.css:**
```css
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body, #root {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #000;
  overscroll-behavior: none;
}
```

**成果物:** `npm run dev` でローカル開発サーバーが起動する

---

### Step 2: GitHub Actions によるデプロイ設定

**作業内容:**
1. GitHub Actions ワークフロー作成（`.github/workflows/deploy.yml`）
2. GitHub リポジトリの Pages 設定（Source: GitHub Actions）

**`.github/workflows/deploy.yml`:**
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

**GitHub リポジトリ側の設定:**
- Settings > Pages > Source を「GitHub Actions」に変更

**デプロイURL:** `https://<username>.github.io/ar_app/`
- HTTPS提供のため、getUserMediaが動作する

**成果物:** mainブランチへのpushで自動ビルド&デプロイ。スマホからGitHub PagesのURLにアクセスして確認可能

---

### Step 3: カメラ映像表示

**作業内容:**
1. `useCamera` フックの実装
2. `CameraBackground` コンポーネントの実装
3. `StartScreen` コンポーネントの実装（カメラ開始ボタン）
4. カメラ権限エラーハンドリング
5. バックグラウンド復帰対応

**useCamera.ts の仕様:**
```ts
type CameraState =
  | { status: 'idle' }
  | { status: 'requesting' }
  | { status: 'active'; stream: MediaStream }
  | { status: 'error'; error: string }

function useCamera(): {
  state: CameraState
  start: () => Promise<void>
  stop: () => void
}
```

- `start()`: getUserMediaでカメラストリームを取得
- `stop()`: ストリームの全トラックを停止
- `visibilitychange` でバックグラウンド復帰時にストリーム再取得
- constraints: `{ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }`

**CameraBackground.tsx:**
- video要素に `autoPlay`, `muted`, `playsInline` を必ず設定
- `object-fit: cover` で画面全体をカバー
- `position: fixed; inset: 0; z-index: 0;`

**StartScreen.tsx:**
- 「カメラを起動」ボタンを表示
- ボタン押下で `useCamera.start()` を呼び出し
- カメラが起動したら非表示に

**成果物:** スマホでカメラ映像がフルスクリーン表示される

---

### Step 4: 3Dシーンの透過レイヤー

**作業内容:**
1. `ARCanvas` コンポーネントの実装
2. R3F Canvasの透過設定
3. ライティング設定
4. テスト用3Dオブジェクト（回転する立方体）でカメラ映像との重なりを確認

**ARCanvas.tsx:**
```tsx
<Canvas
  gl={{ alpha: true, antialias: false, powerPreference: 'default' }}
  dpr={[1, 2]}
  camera={{ fov: 60, near: 0.1, far: 100, position: [0, 0, 5] }}
  style={{ position: 'fixed', inset: 0, zIndex: 1, background: 'transparent', touchAction: 'none' }}
>
```

**Lighting.tsx:**
- `ambientLight`: intensity 0.6（全体的な明るさ）
- `directionalLight`: intensity 0.8, position [5, 5, 5]（影の方向性）

**成果物:** カメラ映像の上に透過3Dレイヤーが重なり、テスト用の立方体が表示される

---

### Step 5: 魚の3Dモデル作成

**作業内容:**
1. プロシージャル魚モデルの作成（Three.jsジオメトリで構築）
2. 魚のマテリアル設定（色、光沢）
3. `Fish` コンポーネントの実装

**魚のプロシージャルモデル:**
- 楕円体（胴体） + 三角形（尾びれ） + 小三角形（背びれ、胸びれ）
- Three.jsの `BufferGeometry` でカスタムジオメトリを構築
- `MeshStandardMaterial` でメタリック・光沢のある質感

**Fish.tsx の仕様:**
- props: `position`, `rotation`, `scale`, `color`
- 尾びれは `useFrame` で時間ベースの正弦波で揺らす
- モデルのポリゴン数: 数百程度に抑える（モバイル向け）

**成果物:** 画面に1匹の3D魚が表示され、尾びれが揺れるアニメーションが動作

---

### Step 6: 魚の移動アニメーション（Boidsアルゴリズム）

**作業内容:**
1. `useFishMovement` フックの実装
2. Boidsアルゴリズムの3ルール実装
3. `FishSchool` コンポーネントで複数の魚を管理
4. 画面境界での折り返し処理

**Boidsアルゴリズムの3ルール:**
1. **分離 (Separation)**: 近くの魚から離れる
2. **整列 (Alignment)**: 近くの魚と同じ方向に向く
3. **結合 (Cohesion)**: 群れの中心に向かう

**useFishMovement.ts:**
```ts
interface FishState {
  position: [number, number, number]
  velocity: [number, number, number]
}

function useFishMovement(count: number): FishState[]
```

- `useFrame` で毎フレーム位置を更新
- 魚は3D空間の一定範囲内（カメラの視野範囲）を泳ぐ
- 境界に近づくと緩やかに方向転換
- 速度に上限・下限を設定（自然な泳ぎのため）
- 進行方向に応じて魚の向き（rotation）を自動設定

**FishSchool.tsx:**
- 初期配置: ランダムな位置に5〜10匹を配置
- 各魚の色をランダムに設定（3〜4色からランダム選択）
- `useFishMovement` から取得した位置/速度を各 `Fish` に渡す

**成果物:** カメラ映像の上に5〜10匹の魚が群れで泳ぐ

---

### Step 7: 仕上げ

**作業内容:**
1. 開始画面のUI（アプリタイトル、カメラ起動ボタン）
2. カメラ権限拒否時のエラー画面
3. パフォーマンス最適化の確認
4. mainへpushし、GitHub Actionsでデプロイ
5. iOS Safari / Android Chrome での実機テスト

**UI要素:**
- 開始画面: アプリ名 + 「ARを開始する」ボタン
- エラー画面: 「カメラへのアクセスを許可してください」メッセージ
- 最小限のスタイリング（インラインCSS or CSS modules）

**成果物:** モバイルブラウザで完動するサンプルアプリがGitHub Pagesで公開

---

## 8. デプロイとテストの流れ

```
[ローカル開発] → git push → [GitHub Actions] → [GitHub Pages]
                                  │                    │
                                  ├─ npm ci             └─ https://<user>.github.io/ar_app/
                                  ├─ npm run build           │
                                  └─ upload artifact         └─ スマホでアクセスしてテスト
```

**手順:**
1. ローカルで実装・`npm run dev` で動作確認
2. mainブランチにpush
3. GitHub Actionsが自動でビルド&デプロイ
4. スマホで `https://<username>.github.io/ar_app/` にアクセスしてテスト

---

## 9. 完成イメージ

```
┌──────────────────────┐
│                      │
│  [カメラ映像背景]     │
│                      │
│      🐟  🐟          │
│          🐟          │
│    🐟       🐟       │
│        🐟            │
│                      │
│                      │
│                      │
└──────────────────────┘

※ 魚は3Dモデルで、尾びれを揺らしながら
  群れで泳ぐアニメーションが再生される
```

---

## 10. 将来の拡張ポイント

- **タップインタラクション**: 魚をタップすると逃げる/寄ってくる
- **魚種の追加**: 熱帯魚、クラゲ、サメなど
- **水中エフェクト**: 泡のパーティクル、光の揺らぎ（コースティクス）
- **WebXR対応**: Android限定でワールドロック体験（魚が床に固定される）
- **設定UI**: 魚の数、速度、種類を変更するパネル
- **バックエンド**: 魚の種類管理やユーザー設定保存にLambda+DynamoDBを検討
