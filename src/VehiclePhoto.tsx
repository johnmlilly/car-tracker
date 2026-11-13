import { Car } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { vehiclePhotoUrl } from './photos'

/** Bundled photo of the vehicle, or a car-icon placeholder when none is bundled. */
export function VehiclePhoto({
  name,
  className,
  children,
}: {
  name: string
  className?: string
  /** Overlay content, e.g. status chips. */
  children?: ReactNode
}) {
  const url = vehiclePhotoUrl(name)
  return (
    <div
      className={cn(
        'relative grid place-items-center overflow-hidden text-ink-3',
        url
          ? 'bg-photo'
          : 'bg-[radial-gradient(120%_90%_at_85%_10%,var(--brand-soft),transparent_60%),linear-gradient(160deg,var(--surface-2),var(--bg-2))]',
        className,
      )}
    >
      {url ? (
        // Multiply drops the photo's white background into the panel color.
        <img src={url} alt="" className="absolute inset-0 size-full object-contain p-[6%] mix-blend-multiply" />
      ) : (
        <Car className="h-auto w-[46%] max-w-[220px] opacity-55" strokeWidth={1.1} aria-hidden />
      )}
      {children}
    </div>
  )
}
