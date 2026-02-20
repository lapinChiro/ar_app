# iOS上のChrome/GoogleアプリでWebXRは利用可能か？ 調査レポート

## 結論（先に）

**現時点（2026年2月）では、iPhoneのChrome・Googleアプリ・その他ブラウザでWebXR（immersive-ar）は利用できない。**

理由: iOS上のすべてのブラウザは、Appleの方針によりWebKitエンジンの使用を強制されている。
WebKitはWebXR immersive-arに対応しておらず、Chrome・Googleアプリを使っても実質的にSafariと同じ制約を受ける。

---

## 1. iOSのブラウザエンジン制限

### 1.1 WebKit強制ポリシー

AppleはApp Store審査ガイドラインにより、iOS上のすべてのブラウザアプリに**WebKitエンジンの使用を義務付けている**。

つまり:

| ブラウザ | デスクトップ版のエンジン | iOS版のエンジン |
|---|---|---|
| Safari | WebKit | WebKit |
| Google Chrome | Blink | **WebKit**（Blinkではない） |
| Googleアプリ（内蔵ブラウザ） | - | **WebKit**（WKWebView） |
| Firefox | Gecko | **WebKit** |
| Microsoft Edge | Blink | **WebKit** |
| LINE / X等のアプリ内ブラウザ | - | **WebKit**（WKWebView / SFSafariViewController） |

**iOS上のChrome ≠ Android上のChrome**。エンジンが異なるため、Chrome for iOSはWebXRに対応していない。

### 1.2 WKWebViewとWebXR

iOSのWKWebView（アプリ内ブラウザの基盤）はWebXR Device APIを実装していない。
Apple Developer Forumsでも、WKWebView内でのWebXRサポートは公式に提供されていないことが確認されている。

---

## 2. 規制による変化（EU・日本）

近年、各国の規制当局がAppleのブラウザエンジン独占に対して是正を求めている。

### 2.1 EU（デジタル市場法 / DMA）

| 項目 | 状況 |
|---|---|
| 法的根拠 | Digital Markets Act（DMA） |
| 施行時期 | iOS 17.4（2024年3月）から技術的に許可 |
| 対象地域 | EU加盟国のみ |
| 代替エンジンの実際の提供状況 | **2026年2月現在、Blink/Geckoベースのブラウザはまだ1本もリリースされていない** |

**なぜリリースされていないか:**
- Appleが課す技術的・契約的要件が非常に厳しい
- EU版とグローバル版で別のアプリを維持する必要がある
- コンテンツフィルタリングAPIのサポートが不十分（Apple曰く2026年3月にベータ版提供予定）
- 既存ユーザーの移行パスが用意されていない

Open Web Advocacyは「Appleが実質的に代替ブラウザエンジンをブロックし続けている」と報告している。

### 2.2 日本（スマートフォンソフトウェア競争促進法 / MSCA）

| 項目 | 状況 |
|---|---|
| 法的根拠 | モバイル・ソフトウェア競争促進法（MSCA） |
| 施行日 | 2025年12月18日 |
| Apple対応 | iOS 26.2で代替ブラウザエンジンを許可 |
| 対象地域 | 日本のみ |
| 代替エンジンの実際の提供状況 | **2026年2月現在、まだリリースされていない** |

iOS 26.2（2025年12月リリース）でAppleは日本向けに代替ブラウザエンジンの枠組みを整備した。
しかし、Google（Chrome/Blink）やMozilla（Firefox/Gecko）はまだiOS向けの代替エンジンブラウザを出荷していない。

### 2.3 規制変化のまとめ

```
2026年2月時点の状況:

┌──────────────────────────────────────────────────────────┐
│  法律上は許可されている（EU / 日本）                       │
│  しかし実際にBlink/Geckoブラウザは存在しない               │
│  → WebXRを利用できるiOS用ブラウザは今のところない          │
└──────────────────────────────────────────────────────────┘
```

**仮にBlink版Chromeが日本でリリースされた場合:**
- Blink版ChromeはWebXR immersive-arをサポートする可能性が高い
- ただしARCore（Googleの空間認識エンジン）がiOSで動作するかは不明
  - AndroidのWebXR ARはARCoreに依存している
  - iOS版のBlinkブラウザでARCoreが提供されるかは未発表
- Apple ARKitとの連携が必要になる可能性があり、技術的な不確実性が大きい

---

## 3. 現時点で利用可能な代替手段

WebXRをiOSで利用するための代替アプローチを調査した。

### 3.1 Mozilla WebXR Viewer

| 項目 | 内容 |
|---|---|
| 方式 | 専用iOSアプリ（App Storeで配布） |
| 技術 | ARKit + WebXR ポリフィル |
| 対応 | WebXR immersive-ar（6DoF） |
| ライセンス | MPL-2.0 |
| 状態 | App Storeに残存するが、開発は事実上停止状態。最終更新が古い |
| 評価 | **プロダクション利用には推奨できない** |

ユーザーに別途アプリのインストールを要求するため、「ブラウザだけで動くWebアプリ」の前提が崩れる。

### 3.2 wem-technology/ios-webxr（ネイティブシェル方式）

| 項目 | 内容 |
|---|---|
| 方式 | SwiftUI + WKWebView + ARKit ブリッジ |
| 技術 | ARKitの追跡データをJSポリフィル経由でWebXR APIとして注入 |
| 対応 | WebXR Device API, Hit Testing, 6DoF World Tracking |
| ライセンス | GitHub公開（要確認） |
| 状態 | 実験的プロジェクト |
| 評価 | カスタムiOSアプリのビルド・配布が必要。Webアプリ単体では使えない |

仕組み:
```
┌─ iOS ネイティブアプリ ─────────────────────┐
│                                            │
│  ARKit (ARWorldTrackingConfiguration)      │
│      │  カメラ映像 + 6DoF追跡データ         │
│      ↓                                     │
│  WKWebView + JSポリフィル注入              │
│      │  navigator.xr をエミュレート        │
│      ↓                                     │
│  通常のWebXRアプリケーション（Three.js等）  │
│                                            │
└────────────────────────────────────────────┘
```

Three.jsやR3F（react-three/xr）の標準WebXRコードがそのまま動作する可能性がある。
ただし、App Storeへの申請・配布が必要であり、「URLを開くだけ」の体験にはならない。

### 3.3 Variant Launch（商用SDK）

| 項目 | 内容 |
|---|---|
| 方式 | iOS App Clips を活用したハイブリッド方式 |
| 技術 | Androidは通常のWebXR、iOSはApp Clip経由でARKitにアクセス |
| 対応 | カメラトラッキング、ヒットテスト、アンカー、DOMオーバーレイ |
| 料金 | 有償（プロジェクトごとの月額） |
| 評価 | 商用プロダクト向け。iOSユーザーにはApp Clipが自動ダウンロードされる |

iOSでの体験フロー:
```
QR or リンク → App Clip 自動起動 → ARKit による6DoF AR体験
```

アプリのインストールは不要だが、App Clipの仕組みに依存するため、完全なWeb体験とは異なる。

### 3.4 各手段の比較

| 方式 | インストール不要 | 6DoF | iOS対応 | Android対応 | コスト | 実用性 |
|---|---|---|---|---|---|---|
| WebXR (標準) | o | o | **x** | o | 無料 | Androidのみ |
| DeviceOrientation (現計画) | o | x (3DoF) | o | o | 無料 | **最も現実的** |
| Mozilla WebXR Viewer | x (アプリ必要) | o | o | - | 無料 | 開発停止で非推奨 |
| ios-webxr (ネイティブシェル) | x (アプリ必要) | o | o | - | 無料 | 実験的 |
| Variant Launch | △ (App Clip) | o | o | o | 有償 | 商用なら検討可 |

---

## 4. 将来の展望

### 4.1 Blink版Chrome for iOS（日本/EU）

- Googleは Chromium コミュニティ内でiOS向けBlinkの開発を進めている
- iOS SDK 17.4対応のBrowserEngineKit APIを使ったテストが進行中
- しかし、リリース時期は未定
- リリースされてもWebXR AR対応が保証されるわけではない（ARCoreのiOS移植が必要）

### 4.2 Apple自身のWebXR対応

- visionOSのSafariではWebXR immersive-vrが対応済み
- iOSのSafariにWebXR immersive-arが追加される可能性はゼロではないが、Appleの方針は不透明
- Apple Developer Forumsでの要望はあるが、公式なロードマップは存在しない

### 4.3 現実的なタイムライン予測

| 時期 | 見込み |
|---|---|
| 2026年前半 | Blink版Chrome for iOS はまだリリースされない可能性が高い |
| 2026年後半〜2027年 | 日本/EUでBlink版Chromeが登場する可能性。ただしWebXR AR対応は不確実 |
| 不明 | Apple SafariがWebXR immersive-arに対応する時期は予測不能 |

---

## 5. 本プロジェクトへの推奨事項

### 5.1 結論: 「ChromeやGoogleアプリを前提にする」アプローチは現時点では不可

iOS上のChrome/Googleアプリは内部的にWebKitを使用しており、WebXRは利用できない。
EU/日本の規制変化による代替ブラウザエンジンも、2026年2月現在まだ実際にはリリースされていない。

### 5.2 推奨アプローチ（変更なし）

report.md で提案した **Phase 1: DeviceOrientationEvent による3DoF回転追跡** が、
現時点でiOS/Android両対応を実現する最も現実的な方法である。

### 5.3 将来のプログレッシブエンハンスメント

```
if (navigator.xr && await navigator.xr.isSessionSupported('immersive-ar')) {
  // WebXR immersive-ar が使える場合（現状はAndroid Chromeのみ）
  → 6DoF ARセッションを開始
} else if (DeviceOrientationEvent が使える場合) {
  // iOS / WebXR非対応Android
  → 3DoF ジャイロ回転追跡
} else {
  // ジャイロもない場合
  → カメラオーバーレイのみ（現在の実装）
}
```

この段階的アプローチにより:
- Android Chrome: 最高品質のWebXR 6DoF AR体験
- iOS Safari: ジャイロによる3DoF回転追跡（十分なAR感）
- Blink版Chrome for iOSが将来登場した場合: 自動的に6DoFにアップグレード（コード変更不要）

---

## 参考リンク

- [WebXR Device API ブラウザ対応状況 - Can I use](https://caniuse.com/webxr)
- [Apple Developer - Using alternative browser engines in Japan](https://developer.apple.com/support/alternative-browser-engines-jp/)
- [Apple Developer - Using alternative browser engines in the EU](https://developer.apple.com/support/alternative-browser-engines/)
- [Open Web Advocacy - Apple's Browser Engine Ban Persists](https://open-web-advocacy.org/blog/apples-browser-engine-ban-persists-even-under-the-dma/)
- [Apple Newsroom - Changes to iOS in Japan](https://www.apple.com/newsroom/2025/12/apple-announces-changes-to-ios-in-japan/)
- [wem-technology/ios-webxr - GitHub](https://github.com/wem-technology/ios-webxr)
- [Variant Launch - WebXR on iOS and Android](https://launch.variant3d.com/)
- [The state of WebXR on iOS - Variant Launch](https://launch.variant3d.com/blog/23-06-state-webxr-on-ios-beyond)
- [WebXR Viewer - App Store](https://apps.apple.com/us/app/webxr-viewer/id1295998056)
