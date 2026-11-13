export type Theme = 'light' | 'dark'

export const THEME_KEY = 'theme'

type ThemeStorage = Pick<Storage, 'getItem' | 'setItem'>

/** `localStorage`, or null where the browser blocks it (private mode, policy). */
export function themeStorage(): ThemeStorage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** The saved theme; light for no setting, an unknown value, or unreadable storage. */
export function readTheme(storage: ThemeStorage | null): Theme {
  try {
    return storage?.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

/** Saves the theme for this device. A storage failure only loses the preference. */
export function saveTheme(storage: ThemeStorage | null, theme: Theme): void {
  try {
    storage?.setItem(THEME_KEY, theme)
  } catch (err) {
    console.warn('Theme not saved', err)
  }
}

/** Browser toolbar color for each theme; matches `--bg` in `src/index.css`. */
export const THEME_COLORS: Record<Theme, string> = { light: '#f8fafc', dark: '#0e131a' }

export function applyTheme(root: HTMLElement, theme: Theme): void {
  if (theme === 'dark') root.dataset.theme = 'dark'
  else delete root.dataset.theme
  root.ownerDocument?.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme])
}
