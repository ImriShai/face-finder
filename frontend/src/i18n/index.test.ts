import { afterEach, describe, expect, it, vi } from 'vitest'

async function loadI18n() {
  vi.resetModules()
  return (await import('./index')).default
}

describe('i18n language preference', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('uses the stored language', async () => {
    localStorage.setItem('lang', 'he')
    expect((await loadI18n()).language).toBe('he')
  })

  it('ignores an unsupported stored language', async () => {
    localStorage.setItem('lang', 'xx')
    expect((await loadI18n()).language).toBe('en')
  })

  it('still loads when localStorage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    const i18n = await loadI18n()
    expect(i18n.language).toBe('en')
    await expect(i18n.changeLanguage('he')).resolves.toBeDefined()
  })
})
