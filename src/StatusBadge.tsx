import type { ItemStatus } from '../shared/api'

const STYLES: Record<ItemStatus, string> = {
  ok: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  soon: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  overdue: 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200',
  unknown: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
}

function statusLabel(status: ItemStatus, hasBaseline: boolean): string {
  switch (status) {
    case 'ok':
      return 'OK'
    case 'soon':
      return 'Due soon'
    case 'overdue':
      return 'Overdue'
    case 'unknown':
      return hasBaseline ? 'Needs mileage' : 'Not set'
  }
}

export function StatusBadge({ status, hasBaseline }: { status: ItemStatus; hasBaseline: boolean }) {
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[status]}`}>
      {statusLabel(status, hasBaseline)}
    </span>
  )
}
