/**
 * How a background video should fill the viewport.
 *
 * `cover` crops the video to fill the screen — ideal when the two shapes are
 * close. When they differ a lot (a portrait phone video in a landscape desktop
 * window, or vice versa) `cover` would crop away most of the frame, so we
 * `contain` it instead and fill the leftover space with a blurred copy.
 */
export type VideoFit = 'cover' | 'contain'

/** Crop at most this fraction of the video before switching to `contain`. */
export const MAX_COVER_CROP = 0.35

export function chooseVideoFit(
  videoWidth: number,
  videoHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): VideoFit {
  if (!videoWidth || !videoHeight || !viewportWidth || !viewportHeight) return 'cover'
  const videoRatio = videoWidth / videoHeight
  const viewportRatio = viewportWidth / viewportHeight
  // Fraction of the video hidden by `cover` along the cropped axis.
  const cropped = 1 - Math.min(videoRatio, viewportRatio) / Math.max(videoRatio, viewportRatio)
  return cropped > MAX_COVER_CROP ? 'contain' : 'cover'
}
