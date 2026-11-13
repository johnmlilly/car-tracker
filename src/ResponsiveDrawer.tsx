import type { LucideIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { useMediaQuery } from './useMediaQuery'

interface ResponsiveDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** Line under the title, e.g. the vehicle or service name. */
  subtitle?: string
  icon: LucideIcon
  children: ReactNode
}

function Heading({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b border-line px-5 pt-5 pb-4 max-sm:pt-3">
      <span className="grid size-[38px] shrink-0 place-items-center rounded-sm bg-brand-soft text-brand-text">
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 pr-8">{children}</div>
    </div>
  )
}

/** Right-side sheet on wider screens, bottom sheet under 640px. */
export function ResponsiveDrawer({
  open,
  onOpenChange,
  title,
  subtitle,
  icon,
  children,
}: ResponsiveDrawerProps) {
  const narrow = useMediaQuery('(max-width: 639px)')
  // Pick the variant while closed and keep it while open: switching would remount
  // the form and drop unsaved input (e.g. rotating an iPhone mid-entry).
  const [phone, setPhone] = useState(narrow)
  if (!open && phone !== narrow) setPhone(narrow)
  const titleClass = 'text-xl font-bold text-ink'
  const subClass = 'text-xs font-medium text-ink-3'
  const body = <div className="grid content-start gap-4 overflow-y-auto px-5 pt-5">{children}</div>

  if (phone) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[92svh] bg-surface data-[vaul-drawer-direction=bottom]:max-h-[92svh] data-[vaul-drawer-direction=bottom]:rounded-t-lg">
          <Heading icon={icon}>
            <DrawerTitle className={titleClass}>{title}</DrawerTitle>
            <DrawerDescription className={subClass}>{subtitle ?? title}</DrawerDescription>
          </Heading>
          {body}
        </DrawerContent>
      </Drawer>
    )
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 border-line bg-surface shadow-drawer sm:max-w-[440px]"
      >
        <Heading icon={icon}>
          <SheetTitle className={titleClass}>{title}</SheetTitle>
          <SheetDescription className={subClass}>{subtitle ?? title}</SheetDescription>
        </Heading>
        {body}
      </SheetContent>
    </Sheet>
  )
}
