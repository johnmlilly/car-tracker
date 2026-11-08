import type { MinderLogView, MinderResponse } from '../shared/api'
import { ConfirmDelete } from './ConfirmDelete'
import { formatDate, formatMiles } from './format'
import { MileageText } from './MileageText'
import { MinderForm } from './MinderForm'
import { PageShell } from './PageShell'

function LogRow({ log, onDeleted }: { log: MinderLogView; onDeleted: () => void }) {
  return (
    <ConfirmDelete
      url={`/api/minder-logs/${log.id}`}
      label={`code ${log.code} on ${formatDate(log.date)}`}
      onDeleted={onDeleted}
    >
      <p className="font-medium">{log.code}</p>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        {formatDate(log.date)}
        {log.odometer !== null && ` at ${formatMiles(log.odometer)}`}
      </p>
      <p className="mt-1 text-sm">{log.services.join(', ')}</p>
    </ConfirmDelete>
  )
}

function MinderContent({ data, onChange }: { data: MinderResponse; onChange: () => void }) {
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold">{data.vehicle.name}</h1>
      <div className="mb-6">
        <MileageText mileage={data.mileage} />
      </div>
      <h2 className="mb-2 text-lg font-medium">Log Minder code</h2>
      <MinderForm vehicleId={data.vehicle.id} onSaved={onChange} />
      <h2 className="mt-8 mb-1 text-lg font-medium">Logged codes</h2>
      {data.logs.length === 0 ? (
        <p className="text-zinc-500 dark:text-zinc-400">No codes logged yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {data.logs.map((log) => (
            <LogRow key={log.id} log={log} onDeleted={onChange} />
          ))}
        </ul>
      )}
    </>
  )
}

export function MinderPage({ id }: { id: number }) {
  return (
    <PageShell<MinderResponse>
      url={`/api/vehicles/${id}/minder`}
      loadingText="Loading Minder codes..."
      errorText="Couldn't load Minder codes."
      notFoundText="There's no Maintenance Minder vehicle at this address."
    >
      {(data, refresh) => <MinderContent data={data} onChange={refresh} />}
    </PageShell>
  )
}
