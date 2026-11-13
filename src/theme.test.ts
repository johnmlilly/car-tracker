import { describe, expect, it, vi } from 'vitest'
import { applyTheme, readTheme, saveTheme, THEME_COLORS, THEME_KEY } from './theme'

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    data,
  }
}

const throwing = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  },
}

describe('readTheme', () => {
  it('defaults to light with nothing saved', () => {
    expect(readTheme(memoryStorage())).toBe('light')
  })

  it('reads a saved dark theme', () => {
    expect(readTheme(memoryStorage({ [THEME_KEY]: 'dark' }))).toBe('dark')
  })

  it('treats unknown values as light', () => {
    expect(readTheme(memoryStorage({ [THEME_KEY]: 'system' }))).toBe('light')
  })

  it('falls back to light when storage is missing or throws', () => {
    expect(readTheme(null)).toBe('light')
    expect(readTheme(throwing)).toBe('light')
  })
})

describe('saveTheme', () => {
  it('stores the theme', () => {
    const storage = memoryStorage()
    saveTheme(storage, 'dark')
    expect(storage.data.get(THEME_KEY)).toBe('dark')
  })

  it('does not throw when storage fails', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(() => saveTheme(throwing, 'dark')).not.toThrow()
    expect(() => saveTheme(null, 'dark')).not.toThrow()
    warn.mockRestore()
  })
})

describe('applyTheme', () => {
  it('sets and clears data-theme', () => {
    const root = { dataset: {} as Record<string, string> } as unknown as HTMLElement
    applyTheme(root, 'dark')
    expect(root.dataset.theme).toBe('dark')
    applyTheme(root, 'light')
    expect(root.dataset.theme).toBeUndefined()
  })

  it('sets the theme-color meta to match the theme', () => {
    const meta = { content: '', setAttribute(_: string, value: string) { this.content = value } }
    const root = {
      dataset: {} as Record<string, string>,
      ownerDocument: { querySelector: () => meta },
    } as unknown as HTMLElement
    applyTheme(root, 'dark')
    expect(meta.content).toBe(THEME_COLORS.dark)
    applyTheme(root, 'light')
    expect(meta.content).toBe(THEME_COLORS.light)
  })
})
