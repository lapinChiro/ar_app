declare module 'mind-ar/dist/mindar-image-three.prod.js' {
  import type { WebGLRenderer, Scene, Camera, Group } from 'three'

  interface MindARThreeOptions {
    container: HTMLElement
    imageTargetSrc: string
    maxTrack?: number
    filterMinCF?: number
    filterBeta?: number
    missTolerance?: number
    warmupTolerance?: number
  }

  interface MindARAnchor {
    group: Group
    onTargetFound: (() => void) | null
    onTargetLost: (() => void) | null
  }

  export class MindARThree {
    constructor(options: MindARThreeOptions)
    renderer: WebGLRenderer
    scene: Scene
    camera: Camera
    addAnchor(targetIndex: number): MindARAnchor
    start(): Promise<void>
    stop(): void
    switchCamera(): void
  }
}
