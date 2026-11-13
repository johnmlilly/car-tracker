import { ChevronRight, Gauge, Plus, Receipt, ScanLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Vehicle, VehicleDetailResponse } from '../shared/api'
import { gridEntries } from '../shared/scheduleView'
import { describeMileage, SCHEDULE_LABELS } from './format'
import { Link } from './Link'
import { PageShell } from './PageShell'
import { ServiceCard } from './ServiceCard'
import { useDrawer } from './useDrawer'
import { VehicleDrawers, type VehicleDrawer } from './VehicleDrawers'
import { VehiclePhoto } from './VehiclePhoto'

function Odometer({ vehicle }: { vehicle: Vehicle }) {
  const { mileage } = vehicle
  if (!mileage) return <p className="my-3 text-ink-3">No mileage logged yet.</p>
  const { detail } = describeMileage(mileage)
  return (
    <p className="my-3 flex flex-wrap items-baseline gap-x-2">
      <span className="text-[30px] font-bold">{mileage.estimate.toLocaleString('en-US')}</span>
      <span className="font-semibold text-ink-3">mi</span>
      {detail && <span className="text-xs text-ink-3">{detail}</span>}
    </p>
  )
}

function VehicleContent({ data, onChanged }: { data: VehicleDetailResponse; onChanged: () => void }) {
  const drawer = useDrawer<VehicleDrawer>()
  const { vehicle } = data
  const entries = gridEntries(data.items, data.dueItems, vehicle.mileage?.estimate ?? null, data.today)
  const isMinder = vehicle.scheduleModel === 'minder'
  const mileageLine = vehicle.mileage
    ? `Estimated now: ${vehicle.mileage.estimate.toLocaleString('en-US')} mi`
    : 'No mileage logged yet'

  return (
    <>
      <section className="mb-8 grid items-center gap-5 sm:grid-cols-[220px_1fr]">
        <VehiclePhoto
          name={vehicle.name}
          className="aspect-video rounded-lg border border-line sm:aspect-[4/3]"
        />
        <div>
          <h1 className="text-[26px] font-bold sm:text-[32px]">{vehicle.name}</h1>
          <p className="mt-0.5 text-sm text-ink-3">
            {SCHEDULE_LABELS[vehicle.scheduleModel]} ·{' '}
            <Link
              href={`/vehicles/${vehicle.id}/services`}
              className="inline-flex items-center font-semibold text-brand-text hover:underline"
            >
              Service history
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          </p>
          <Odometer vehicle={vehicle} />
          <div className="grid gap-2">
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href={`/receipts/new?vehicle=${vehicle.id}`}>
                  <Receipt aria-hidden />
                  Add receipt
                </Link>
              </Button>
              <Button type="button" onClick={() => drawer.show({ kind: 'service' })}>
                <Plus aria-hidden />
                Add service
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => drawer.show({ kind: 'odometer' })}
              >
                <Gauge aria-hidden />
                Log odometer
              </Button>
              {isMinder && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => drawer.show({ kind: 'minder' })}
                >
                  <ScanLine aria-hidden />
                  Log Minder code
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg font-bold">Schedule</h2>
        {entries.length > 1 && <span className="text-[13px] text-ink-3">Most urgent first</span>}
      </div>
      {entries.length === 0 ? (
        <p className="text-ink-3">
          {isMinder
            ? 'Nothing due. Log a code when the car shows one.'
            : 'No interval schedule for this vehicle.'}
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {entries.map((entry) => (
            <ServiceCard
              key={entry.kind === 'item' ? `item-${entry.item.id}` : `minder-${entry.item.serviceName}`}
              entry={entry}
              today={data.today}
              onEditLastDone={() => {
                if (entry.kind === 'item') drawer.show({ kind: 'lastDone', item: entry.item })
              }}
            />
          ))}
        </ul>
      )}

      <VehicleDrawers
        vehicle={vehicle}
        today={data.today}
        mileageLine={mileageLine}
        drawer={drawer.value}
        open={drawer.open}
        onOpenChange={drawer.setOpen}
        onChanged={onChanged}
      />
    </>
  )
}

export function VehiclePage({ id }: { id: number }) {
  return (
    <PageShell<VehicleDetailResponse>
      url={`/api/vehicles/${id}`}
      loadingText="Loading schedule..."
      errorText="Couldn't load this vehicle."
    >
      {(data, refresh) => <VehicleContent data={data} onChanged={refresh} />}
    </PageShell>
  )
}
