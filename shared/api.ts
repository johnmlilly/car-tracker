export type ScheduleModel = 'interval' | 'minder'

export type ItemStatus = 'ok' | 'soon' | 'overdue' | 'unknown'

export interface Vehicle {
  id: number
  name: string
  scheduleModel: ScheduleModel
  attention: { soon: number; overdue: number } | null
  mileage: MileageSummary | null
}

export interface ScheduleItemView {
  id: number
  serviceName: string
  intervalMiles: number | null
  intervalMonths: number | null
  baselineDate: string | null
  baselineOdometer: number | null
  /** Newer of the baseline and confirmed service records, per dimension. */
  lastDoneDate: string | null
  lastDoneOdometer: number | null
  nextDueDate: string | null
  nextDueMiles: number | null
  status: ItemStatus
  /** Open Minder item for this service; null when none or not a Minder vehicle. */
  minderSince: { code: string; date: string } | null
}

export interface VehicleDetailResponse {
  vehicle: Vehicle
  today: string
  items: ScheduleItemView[]
  /** Open Minder items for services without a schedule item; empty for interval vehicles. */
  dueItems: DueItemView[]
}

export interface DueItemView {
  serviceName: string
  status: 'overdue'
  /** The earliest open log that opened this service. */
  since: { code: string; date: string }
}

export interface MinderLogView {
  id: number
  code: string
  loggedAt: string
  /** Eastern date of `loggedAt`, YYYY-MM-DD. */
  date: string
  odometer: number | null
  services: string[]
}

export interface MinderResponse {
  vehicle: { id: number; name: string }
  today: string
  mileage: MileageSummary | null
  /** Newest first. */
  logs: MinderLogView[]
}

export interface ScheduleItemResponse {
  item: ScheduleItemView
}

export interface VehiclesResponse {
  vehicles: Vehicle[]
}

export interface ErrorResponse {
  error: { message: string; fields?: Record<string, string> }
}

export interface ServiceItemInput {
  description: string
  serviceId: number | null
  amountCents: number | null
}

export interface ServiceRecordInput {
  date: string
  odometer: number | null
  shop: string | null
  totalCents: number | null
  items: ServiceItemInput[]
}

export interface ServiceItemView {
  id: number
  description: string
  serviceId: number | null
  /** Null when the line isn't matched to a tracked service. */
  serviceName: string | null
  amountCents: number | null
}

export interface ServiceRecordView {
  id: number
  date: string
  odometer: number | null
  shop: string | null
  totalCents: number | null
  source: 'manual' | 'receipt' | 'import'
  /** In entry order. */
  items: ServiceItemView[]
}

export interface ServiceRecordsResponse {
  vehicle: { id: number; name: string }
  today: string
  /** Every tracked service, by name. */
  services: { id: number; name: string }[]
  /** Newest first. */
  records: ServiceRecordView[]
}

export interface MileageSummary {
  estimate: number
  latest: { date: string; odometer: number }
  milesPerDay: number | null
}

export interface OdometerReading {
  id: number
  date: string
  odometer: number
  source: 'manual' | 'record'
}

export interface OdometerResponse {
  vehicle: { id: number; name: string }
  today: string
  mileage: MileageSummary | null
  /** Newest first. */
  readings: OdometerReading[]
}

/** Largest receipt file the API accepts (10 MiB). */
export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024

export type ReceiptContentType = 'image/webp' | 'application/pdf'

export type ReceiptStatus = 'pending' | 'review' | 'confirmed'

export interface ReceiptView {
  id: number
  vehicle: { id: number; name: string } | null
  contentType: ReceiptContentType
  status: ReceiptStatus
  uploadedAt: string
}

export interface ReceiptsResponse {
  receipts: ReceiptView[]
}

/** One line read from a receipt, after server-side validation. */
export interface ReceiptExtractionLine {
  description: string
  amountCents: number | null
}

/** What `extractReceipt()` read from a receipt, after server-side validation. */
export interface ReceiptExtraction {
  date: string | null
  shop: string | null
  odometer: number | null
  totalCents: number | null
  minderCode: string | null
  lineItems: ReceiptExtractionLine[]
}

export interface ReceiptDetail extends ReceiptView {
  /** Null until the receipt has been read. */
  extraction:
    | (Omit<ReceiptExtraction, 'lineItems'> & {
        lineItems: (ReceiptExtractionLine & { suggestedServiceId: number | null })[]
      })
    | null
}
