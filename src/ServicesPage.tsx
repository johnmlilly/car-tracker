import type { ServiceRecordView, ServiceRecordsResponse } from '../shared/api'
import { formatCents } from '../shared/money'
import { ConfirmDelete } from './ConfirmDelete'
import { formatDate, formatMiles } from './format'
import { Link } from './Link'
import { PageShell } from './PageShell'
import { ServiceForm } from './ServiceForm'

function RecordRow({ record, onDeleted }: { record: ServiceRecordView; onDeleted: () => void }) {
  const details = [
    record.odometer !== null ? formatMiles(record.odometer) : null,
    record.totalCents !== null ? `${formatCents(record.totalCents)} total` : null,
  ].filter(Boolean)

  return (
    <ConfirmDelete
      url={`/api/service-records/${record.id}`}
      label={`service on ${formatDate(record.date)}`}
      onDeleted={onDeleted}
    >
      <p className="font-medium">
        {formatDate(record.date)}
        {record.shop && <span className="font-normal"> · {record.shop}</span>}
      </p>
      {details.length > 0 && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{details.join(' · ')}</p>
      )}
      <ul className="mt-1 text-sm">
        {record.items.map((item) => (
          <li key={item.id} className="break-words">
            {item.description}
            {item.serviceName && item.serviceName !== item.description && (
              <span className="text-zinc-500 dark:text-zinc-400"> ({item.serviceName})</span>
            )}
            {item.amountCents !== null && (
              <span className="text-zinc-500 dark:text-zinc-400">
                {' '}
                · {formatCents(item.amountCents)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </ConfirmDelete>
  )
}

function ServicesContent({
  data,
  onChange,
}: {
  data: ServiceRecordsResponse
  onChange: () => void
}) {
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold">{data.vehicle.name}</h1>
      <Link
        href={`/vehicles/${data.vehicle.id}`}
        className="mb-6 inline-block text-sm font-medium underline underline-offset-2"
      >
        View schedule
      </Link>
      <h2 className="mb-2 text-lg font-medium">Add service</h2>
      <ServiceForm
        vehicleId={data.vehicle.id}
        today={data.today}
        services={data.services}
        onSaved={onChange}
      />
      <h2 className="mt-8 mb-1 text-lg font-medium">Service history</h2>
      {data.records.length === 0 ? (
        <p className="text-zinc-500 dark:text-zinc-400">No services recorded yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {data.records.map((record) => (
            <RecordRow key={record.id} record={record} onDeleted={onChange} />
          ))}
        </ul>
      )}
    </>
  )
}

export function ServicesPage({ id }: { id: number }) {
  return (
    <PageShell<ServiceRecordsResponse>
      url={`/api/vehicles/${id}/service-records`}
      loadingText="Loading services..."
      errorText="Couldn't load service history."
    >
      {(data, refresh) => <ServicesContent data={data} onChange={refresh} />}
    </PageShell>
  )
}
