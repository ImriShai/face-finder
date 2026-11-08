import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import PauseIcon from '@mui/icons-material/Pause'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'
import VolumeOffIcon from '@mui/icons-material/VolumeOff'
import { chooseVideoFit, type VideoFit } from '../utils/videoFit'

// The blurred fill is drawn from the playing video into a tiny canvas and
// scaled up by CSS — far cheaper than decoding the (often 4K) video twice.
const FILL_CANVAS_WIDTH = 48
const FILL_FPS = 12

interface Props {
  src: string
  poster?: string
  /** Darkness of the scrim over the video (0–1), for contrast. */
  overlayOpacity?: number
}

/**
 * Full-screen decorative background video.
 * - muted + autoPlay + loop + playsInline so it plays silently on load
 *   (browsers block autoplay WITH sound); a tap-to-unmute button turns audio on
 * - honors prefers-reduced-motion (shows the poster still, or a plain backdrop)
 * - keyboard-accessible pause control (WCAG 2.2.2)
 * - aria-hidden: decorative, invisible to screen readers
 * - fills the screen (`cover`) when the video and window shapes are close; when
 *   they differ a lot (e.g. a portrait phone video on a landscape desktop) shows
 *   the whole video (`contain`) over a blurred copy instead of cropping most of it
 */
export default function BackgroundVideo({ src, poster, overlayOpacity = 0.35 }: Props) {
  const { t } = useTranslation()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const [playing, setPlaying] = useState(true)
  const [muted, setMuted] = useState(true)
  const [fit, setFit] = useState<VideoFit>('cover')
  const fillCanvasRef = useRef<HTMLCanvasElement>(null)

  // Pick cover/contain from the video's real dimensions and the window size.
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const update = () =>
      setFit(chooseVideoFit(v.videoWidth, v.videoHeight, window.innerWidth, window.innerHeight))
    update()
    v.addEventListener('loadedmetadata', update)
    window.addEventListener('resize', update)
    return () => {
      v.removeEventListener('loadedmetadata', update)
      window.removeEventListener('resize', update)
    }
  }, [reducedMotion])

  // While letterboxed, keep the blurred fill in sync with the video.
  useEffect(() => {
    if (fit !== 'contain' || reducedMotion) return
    const v = videoRef.current
    const canvas = fillCanvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!v || !canvas || !ctx) return
    let raf = 0
    let last = 0
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw)
      if (now - last < 1000 / FILL_FPS || v.readyState < 2 || !v.videoWidth) return
      last = now
      const h = Math.max(1, Math.round((FILL_CANVAS_WIDTH * v.videoHeight) / v.videoWidth))
      if (canvas.height !== h) canvas.height = h
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [fit, reducedMotion])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReducedMotion(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  function togglePlay() {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      void v.play()
      setPlaying(true)
    } else {
      v.pause()
      setPlaying(false)
    }
  }

  function toggleMute() {
    const v = videoRef.current
    if (!v) return
    const next = !muted
    v.muted = next
    if (!next) void v.play()
    setMuted(next)
  }

  const btnSx = {
    color: '#fff',
    bgcolor: 'rgba(0,0,0,0.4)',
    '&:hover': { bgcolor: 'rgba(0,0,0,0.6)' },
  }

  return (
    <>
      <Box
        aria-hidden
        sx={{ position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden', bgcolor: '#000', pointerEvents: 'none' }}
      >
        {reducedMotion ? (
          <Box
            sx={{
              width: '100%',
              height: '100%',
              ...(poster
                ? { backgroundImage: `url(${poster})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                : { bgcolor: '#111' }),
            }}
          />
        ) : (
          <>
          {fit === 'contain' && (
            <Box
              component="canvas"
              ref={fillCanvasRef}
              width={FILL_CANVAS_WIDTH}
              height={Math.round(FILL_CANVAS_WIDTH * 16 / 9)}
              sx={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                filter: 'blur(24px) brightness(0.7)',
                transform: 'scale(1.15)',
              }}
            />
          )}
          <Box
            component="video"
            ref={videoRef}
            src={src}
            autoPlay
            muted={muted}
            loop
            playsInline
            preload="auto"
            poster={poster}
            sx={{ position: 'relative', width: '100%', height: '100%', objectFit: fit, display: 'block' }}
          />
          </>
        )}
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            background: `linear-gradient(180deg, rgba(0,0,0,${overlayOpacity}) 0%, rgba(0,0,0,${
              overlayOpacity * 0.4
            }) 45%, rgba(0,0,0,${overlayOpacity}) 100%)`,
          }}
        />
      </Box>

      {!reducedMotion && (
        <Box sx={{ position: 'fixed', bottom: 12, insetInlineStart: 12, zIndex: 3, display: 'flex', gap: 1 }}>
          <IconButton
            onClick={toggleMute}
            aria-label={muted ? t('backgroundvideo.unmute') : t('backgroundvideo.mute')}
            size="small"
            sx={btnSx}
          >
            {muted ? <VolumeOffIcon fontSize="small" /> : <VolumeUpIcon fontSize="small" />}
          </IconButton>
          <IconButton
            onClick={togglePlay}
            aria-label={playing ? t('backgroundvideo.pause') : t('backgroundvideo.play')}
            size="small"
            sx={btnSx}
          >
            {playing ? <PauseIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
          </IconButton>
        </Box>
      )}
    </>
  )
}
