export type ScheduleModel = 'interval' | 'minder'

export interface Vehicle {
  id: number
  name: string
  scheduleModel: ScheduleModel
}

export interface VehiclesResponse {
  vehicles: Vehicle[]
}

export interface ErrorResponse {
  error: { message: string }
}
