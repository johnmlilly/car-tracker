import type { MileageSummary } from '../shared/api'
import { describeMileage } from './format'

export function MileageText({ mileage }: { mileage: MileageSummary | null }) {
  const { headline, detail } = describeMileage(mileage)
  return (
    <p className="text-sm">
      <span className="font-medium">{headline}</span>
      {detail && <span className="block text-zinc-500 dark:text-zinc-400">{detail}</span>}
    </p>
  )
}
