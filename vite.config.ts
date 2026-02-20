import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

/**
 * MindAR v1.2.5 は Three.js の非推奨シンボル (sRGBEncoding, LinearEncoding) を
 * import しているが、Three.js v0.152 以降で削除されている。
 * mind-ar からの import 時のみ、互換シムを差し込むプラグイン。
 */
function mindARThreeCompat(): Plugin {
  const compatPath = path.resolve(__dirname, 'src/three-compat.ts')

  return {
    name: 'mindar-three-compat',
    enforce: 'pre',
    resolveId(source, importer) {
      if (
        source === 'three' &&
        importer &&
        importer.includes('mind-ar')
      ) {
        return compatPath
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), mindARThreeCompat()],
  base: '/ar_app/',
  optimizeDeps: {
    exclude: ['mind-ar'],
  },
})
