import { useARMode } from './hooks/useARMode'
import { StartScreen } from './components/StartScreen'
import { CameraBackground } from './components/CameraBackground'
import { ARCanvas } from './components/ARCanvas'
import { XRCanvas } from './components/XRCanvas'
import { RecenterButton } from './components/RecenterButton'
import { MindARCanvas } from './components/MindARCanvas'

export default function App() {
  const {
    state,
    start,
    reset,
    recenter,
    handleXRSessionEnd,
    handleFallbackToOverlay,
  } = useARMode()

  if (state.status !== 'active') {
    return (
      <StartScreen
        status={state.status}
        error={state.status === 'error' ? state.error : undefined}
        onStart={start}
      />
    )
  }

  // MindAR モード
  if (state.mode === 'mindar') {
    return <MindARCanvas onBack={reset} />
  }

  // WebXR モード
  if (state.mode === 'webxr') {
    return <XRCanvas onSessionEnd={handleXRSessionEnd} />
  }

  // Orientation / Overlay モード
  return (
    <>
      {state.stream && <CameraBackground stream={state.stream} />}
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
