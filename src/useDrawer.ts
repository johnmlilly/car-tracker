import { useState } from 'react'

/**
 * Open state plus what the drawer shows. Closing keeps the value so the
 * content stays on screen while the drawer animates out.
 */
export function useDrawer<T>() {
  const [state, setState] = useState<{ open: boolean; value: T | null }>({ open: false, value: null })
  return {
    open: state.open,
    value: state.value,
    show: (value: T) => setState({ open: true, value }),
    close: () => setState((s) => ({ ...s, open: false })),
    setOpen: (open: boolean) => setState((s) => ({ ...s, open })),
  }
}
