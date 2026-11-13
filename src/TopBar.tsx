import { Moon, Receipt, Settings, Sun, Wrench } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Link } from './Link'
import { applyTheme, readTheme, saveTheme, themeStorage, type Theme } from './theme'

function SettingsMenu() {
  const [theme, setTheme] = useState<Theme>(() => readTheme(themeStorage()))

  function choose(value: string) {
    const next: Theme = value === 'dark' ? 'dark' : 'light'
    setTheme(next)
    applyTheme(document.documentElement, next)
    saveTheme(themeStorage(), next)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Settings">
          <Settings className="size-[18px]" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={choose}>
          <DropdownMenuRadioItem value="light">
            <Sun /> Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon /> Dark
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function TopBar() {
  return (
    <header className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 pt-4">
      <Link href="/" className="flex items-center gap-2 text-lg font-extrabold text-ink">
        <span className="grid size-[30px] place-items-center rounded-sm bg-brand text-brand-ink">
          <Wrench className="size-[17px]" strokeWidth={2.4} aria-hidden />
        </span>
        car-tracker
      </Link>
      <nav className="flex items-center gap-1" aria-label="Main">
        <Button variant="ghost" asChild>
          <Link href="/receipts">
            <Receipt className="size-[18px]" aria-hidden />
            Receipts
          </Link>
        </Button>
        <SettingsMenu />
      </nav>
    </header>
  )
}
