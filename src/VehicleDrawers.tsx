import { Gauge, History, ScanLine, Wrench } from 'lucide-react'
import type {
  MinderResponse,
  OdometerResponse,
  ScheduleItemView,
  ServiceRecordsResponse,
} from '../shared/api'
import { useApi } from './api'
import { BaselineForm } from './BaselineForm'
import { ConfirmDelete } from './ConfirmDelete'
import { ErrorPanel, LoadingMessage } from './Feedback'
import { formatDate, formatMiles } from './format'
import { MinderForm } from './MinderForm'
import { OdometerForm } from './OdometerForm'
import { ResponsiveDrawer } from './ResponsiveDrawer'
import { ServiceForm } from './ServiceForm'

export type VehicleDrawer =
  | { kind: 'service' }
  | { kind: 'odometer' }
  | { kind: 'minder' }
  | { kind: 'lastDone'; item: ScheduleItemView }

const RECENT = 5

function Subhead({ children }: { children: string }) {
  return <h3 className="mt-2 text-[13px] font-bold text-ink-2">{children}</h3>
}

interface BodyProps {
  vehicleId: number
  /** After a save: close the drawer and refresh the page. */
  onSaved: () => void
  onCancel: () => void
  /** After a delete inside the drawer: refresh the page, keep the drawer open. */
  onChanged: () => void
}

function OdometerBody({ vehicleId, onSaved, onCancel, onChanged }: BodyProps) {
  const { state, retry, refresh } = useApi<OdometerResponse>(`/api/vehicles/${vehicleId}/odometer`)
  if (state.status === 'loading') return <LoadingMessage>Loading readings...</LoadingMessage>
  if (state.status !== 'ready') {
    return <ErrorPanel message="Couldn't load odometer readings." onRetry={retry} />
  }
  const { data } = state
  const readings = data.readings.slice(0, RECENT)
  return (
    <OdometerForm vehicleId={vehicleId} today={data.today} onSaved={onSaved} onCancel={onCancel}>
      <Subhead>Recent readings</Subhead>
      {readings.length === 0 ? (
        <p className="text-sm text-ink-3">No readings yet.</p>
      ) : (
        <ul className="divide-y divide-line text-sm">
          {readings.map((r) => (
            <ConfirmDelete
              key={r.id}
              // The service record owns its reading; delete the record instead.
              url={r.source === 'manual' ? `/api/odometer-logs/${r.id}` : undefined}
              label={`${formatMiles(r.odometer)} on ${formatDate(r.date)}`}
              onDeleted={() => {
                refresh()
                onChanged()
              }}
            >
              <span>{formatMiles(r.odometer)}</span>
              <span className="text-ink-3">
                {' '}
                · {formatDate(r.date)}
                {r.source === 'record' && ' · from service'}
              </span>
            </ConfirmDelete>
          ))}
        </ul>
      )}
    </OdometerForm>
  )
}

function MinderBody({ vehicleId, onSaved, onCancel, onChanged }: BodyProps) {
  const { state, retry, refresh } = useApi<MinderResponse>(`/api/vehicles/${vehicleId}/minder`)
  if (state.status === 'loading') return <LoadingMessage>Loading Minder codes...</LoadingMessage>
  if (state.status !== 'ready') {
    return <ErrorPanel message="Couldn't load Minder codes." onRetry={retry} />
  }
  const logs = state.data.logs.slice(0, RECENT)
  return (
    <MinderForm vehicleId={vehicleId} onSaved={onSaved} onCancel={onCancel}>
      <Subhead>Recent codes</Subhead>
      {logs.length === 0 ? (
        <p className="text-sm text-ink-3">No codes logged yet.</p>
      ) : (
        <ul className="divide-y divide-line text-sm">
          {logs.map((log) => (
            <ConfirmDelete
              key={log.id}
              url={`/api/minder-logs/${log.id}`}
              label={`code ${log.code} on ${formatDate(log.date)}`}
              onDeleted={() => {
                refresh()
                onChanged()
              }}
            >
              <span className="font-semibold">{log.code}</span>
              <span className="text-ink-3">
                {' '}
                · {formatDate(log.date)}
                {log.odometer !== null && ` at ${formatMiles(log.odometer)}`}
              </span>
              <span className="block text-ink-2">{log.services.join(', ')}</span>
            </ConfirmDelete>
          ))}
        </ul>
      )}
    </MinderForm>
  )
}

/** Loads the service list, then shows the add-service form. */
function ServiceBody({ vehicleId, onSaved, onCancel }: BodyProps) {
  const { state, retry } = useApi<ServiceRecordsResponse>(
    `/api/vehicles/${vehicleId}/service-records`,
  )
  if (state.status === 'loading') return <LoadingMessage>Loading services...</LoadingMessage>
  if (state.status !== 'ready') return <ErrorPanel message="Couldn't load services." onRetry={retry} />
  return (
    <ServiceForm
      vehicleId={vehicleId}
      today={state.data.today}
      services={state.data.services}
      onSaved={onSaved}
      onCancel={onCancel}
    />
  )
}

interface VehicleDrawersProps {
  vehicle: { id: number; name: string }
  today: string
  /** "Estimated now: ..." line for the odometer drawer. */
  mileageLine: string
  drawer: VehicleDrawer | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Data changed; refetch the page. */
  onChanged: () => void
}

/** The vehicle page's input drawers. */
export function VehicleDrawers({
  vehicle,
  today,
  mileageLine,
  drawer,
  open,
  onOpenChange,
  onChanged,
}: VehicleDrawersProps) {
  if (!drawer) return null
  const close = () => onOpenChange(false)
  const body: BodyProps = {
    vehicleId: vehicle.id,
    onCancel: close,
    onChanged,
    onSaved: () => {
      close()
      onChanged()
    },
  }
  const common = { open, onOpenChange }

  switch (drawer.kind) {
    case 'service':
      return (
        <ResponsiveDrawer {...common} title="Add service" subtitle={vehicle.name} icon={Wrench}>
          <ServiceBody {...body} />
        </ResponsiveDrawer>
      )
    case 'odometer':
      return (
        <ResponsiveDrawer {...common} title="Log odometer" subtitle={mileageLine} icon={Gauge}>
          <OdometerBody {...body} />
        </ResponsiveDrawer>
      )
    case 'minder':
      return (
        <ResponsiveDrawer {...common} title="Log Minder code" subtitle={vehicle.name} icon={ScanLine}>
          <MinderBody {...body} />
        </ResponsiveDrawer>
      )
    case 'lastDone':
      return (
        <ResponsiveDrawer
          {...common}
          title="Last done"
          subtitle={drawer.item.serviceName}
          icon={History}
        >
          <BaselineForm key={drawer.item.id} item={drawer.item} today={today} onSaved={body.onSaved} onCancel={close} />
        </ResponsiveDrawer>
      )
  }
}
