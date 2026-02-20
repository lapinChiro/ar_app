/**
 * MindAR v1.2.5 互換レイヤー
 *
 * MindAR は Three.js の非推奨シンボルを import しているため、
 * このファイルが実際の three モジュールの全エクスポートに加えて
 * 削除済みの定数を提供する。
 *
 * mind-ar 内部からの `import { ... } from 'three'` のみが
 * vite.config.ts のプラグインによってこのファイルにリダイレクトされる。
 * アプリ本体からの `import ... from 'three'` は通常通り解決される。
 */

// bare specifier 'three' を使用。
// このファイル自体は mind-ar からのみ参照されるが、
// このファイル内の 'three' は vite プラグインの条件（importer に mind-ar を含む）に
// マッチしないため、通常の three モジュールに解決される。
export * from 'three'

// Three.js r152 以降で削除された定数
export const sRGBEncoding = 3001
export const LinearEncoding = 3000
