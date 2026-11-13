import { HomePage } from './HomePage'
import { Link } from './Link'
import { ReceiptReviewPage } from './ReceiptReviewPage'
import { ReceiptsPage } from './ReceiptsPage'
import { ReceiptUploadPage } from './ReceiptUploadPage'
import { matchRoute, usePathname } from './route'
import { ServicesPage } from './ServicesPage'
import { TopBar } from './TopBar'
import { VehiclePage } from './VehiclePage'

function NotFoundPage() {
  return (
    <>
      <h1 className="mb-2 text-2xl font-bold">Page not found</h1>
      <Link href="/" className="text-sm font-semibold text-brand-text hover:underline">
        Go to the garage
      </Link>
    </>
  )
}

function App() {
  const route = matchRoute(usePathname())

  return (
    <div className="min-h-svh">
      <TopBar />
      <main className="mx-auto max-w-5xl px-4 pt-6 pb-24">
        {route.name === 'home' && <HomePage />}
        {route.name === 'vehicle' && <VehiclePage key={route.id} id={route.id} />}
        {route.name === 'services' && <ServicesPage key={route.id} id={route.id} />}
        {route.name === 'receipts' && <ReceiptsPage />}
        {route.name === 'receiptNew' && <ReceiptUploadPage />}
        {route.name === 'receiptReview' && <ReceiptReviewPage key={route.id} id={route.id} />}
        {route.name === 'notFound' && <NotFoundPage />}
      </main>
    </div>
  )
}

export default App
