import { useCamera } from './hooks/useCamera'
import { StartScreen } from './components/StartScreen'
import { CameraBackground } from './components/CameraBackground'
import { ARCanvas } from './components/ARCanvas'

export default function App() {
  const camera = useCamera()

  return (
    <>
      {camera.state.status !== 'active' && (
        <StartScreen
          status={camera.state.status}
          error={
            camera.state.status === 'error' ? camera.state.error : undefined
          }
          onStart={camera.start}
        />
      )}

      {camera.state.status === 'active' && (
        <>
          <CameraBackground stream={camera.state.stream} />
          <ARCanvas />
        </>
      )}
    </>
  )
}
