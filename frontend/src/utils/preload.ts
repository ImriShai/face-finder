export function preloadImage(url: string): void {
  const img = new Image()
  img.src = url
}

/** Preload the images within `radius` positions of `index` (excluding `index` itself). */
export function preloadRadius(index: number, length: number, radius: number, urlFor: (i: number) => string): void {
  for (let offset = 1; offset <= radius; offset++) {
    if (index + offset < length) preloadImage(urlFor(index + offset))
    if (index - offset >= 0) preloadImage(urlFor(index - offset))
  }
}
