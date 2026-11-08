import { Hono } from 'hono'
import type { ErrorResponse } from '../shared/api'
import { minderRoutes } from './routes/minder'
import { odometerRoutes } from './routes/odometer'
import { serviceRecordRoutes } from './routes/serviceRecords'
import { vehicleRoutes } from './routes/vehicles'

const app = new Hono<{ Bindings: Env }>().basePath('/api')

app.get('/health', (c) => c.json({ ok: true }))

app.route('/', vehicleRoutes)
app.route('/', odometerRoutes)
app.route('/', minderRoutes)
app.route('/', serviceRecordRoutes)

app.notFound((c) => c.json<ErrorResponse>({ error: { message: 'Not found' } }, 404))

app.onError((err, c) => {
  console.error(err)
  return c.json<ErrorResponse>({ error: { message: 'Something went wrong' } }, 500)
})

export default app
