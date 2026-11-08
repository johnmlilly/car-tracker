import type { OdometerReading, OdometerResponse } from '../shared/api'
import { ConfirmDelete } from './ConfirmDelete'
import { formatDate, formatMiles } from './format'
import { MileageText } from './MileageText'
import { OdometerForm } from './OdometerForm'
import { PageShell } from './PageShell'

function ReadingRow({ reading, onDeleted }: { reading: OdometerReading; onDeleted: () => void }) {
  return (
    <ConfirmDelete
      // The service record owns its reading; delete the record instead.
      url={reading.source === 'manual' ? `/api/odometer-logs/${reading.id}` : undefined}
      label={`${formatMiles(reading.odometer)} on ${formatDate(reading.date)}`}
      onDeleted={onDeleted}
    >
      <p className="font-medium">{formatMiles(reading.odometer)}</p>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        {formatDate(reading.date)}
        {reading.source === 'record' && ' · From service record'}
      </p>
    </ConfirmDelete>
  )
}

function OdometerContent({ data, onChange }: { data: OdometerResponse; onChange: () => void }) {
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold">{data.vehicle.name}</h1>
      <div className="mb-6">
        <MileageText mileage={data.mileage} />
      </div>
      <h2 className="mb-2 text-lg font-medium">Log odometer</h2>
      <OdometerForm vehicleId={data.vehicle.id} today={data.today} onSaved={onChange} />
      <h2 className="mt-8 mb-1 text-lg font-medium">Readings</h2>
      {data.readings.length === 0 ? (
        <p className="text-zinc-500 dark:text-zinc-400">No readings yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {data.readings.map((reading) => (
            <ReadingRow key={reading.id} reading={reading} onDeleted={onChange} />
          ))}
        </ul>
      )}
    </>
  )
}

export function OdometerPage({ id }: { id: number }) {
  return (
    <PageShell<OdometerResponse>
      url={`/api/vehicles/${id}/odometer`}
      loadingText="Loading readings..."
      errorText="Couldn't load odometer readings."
    >
      {(data, refresh) => <OdometerContent data={data} onChange={refresh} />}
    </PageShell>
  )
}
