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
  nextDueDate: string | null
  nextDueMiles: number | null
  status: ItemStatus
}

export interface VehicleDetailResponse {
  vehicle: Vehicle
  today: string
  items: ScheduleItemView[]
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
