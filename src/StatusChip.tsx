import { AlertTriangle, Check, Clock } from 'lucide-react'
import type { ItemStatus } from '../shared/api'
import { cn } from '@/lib/utils'

const STYLES: Record<ItemStatus, string> = {
  ok: 'bg-ok-soft text-ok',
  soon: 'bg-soon-soft text-soon',
  overdue: 'bg-overdue-soft text-overdue',
  unknown: 'bg-surface-2 text-ink-3',
}

const ICONS = { ok: Check, soon: Clock, overdue: AlertTriangle, unknown: null }

/** Status as color plus a text label (never color alone). */
export function StatusChip({
  status,
  children,
  className,
}: {
  status: ItemStatus
  children: string
  className?: string
}) {
  const Icon = ICONS[status]
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] leading-none font-bold tracking-[0.04em] whitespace-nowrap uppercase',
        STYLES[status],
        className,
      )}
    >
      {Icon && <Icon className="size-3" strokeWidth={2.6} aria-hidden />}
      {children}
    </span>
  )
}

/** Brand-tinted chip for a Minder code, e.g. "Minder B1 · Nov 2, 2026". */
export function MinderChip({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1.5 text-xs leading-none font-bold text-brand-text">
      {children}
    </span>
  )
}
