// Owner-supplied photos, bundled at build time. Missing files are fine: the card
// shows a placeholder until one is added.
const PHOTOS = import.meta.glob<string>('./assets/vehicles/*.{jpg,jpeg,png,webp}', {
  eager: true,
  import: 'default',
  query: '?url',
})

/** "2019 Toyota Corolla" -> "2019-toyota-corolla". */
export function vehicleSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function vehiclePhotoUrl(name: string): string | null {
  const slug = vehicleSlug(name)
  const key = Object.keys(PHOTOS).find((path) => path.split('/').pop()?.replace(/\.\w+$/, '') === slug)
  return key ? PHOTOS[key] : null
}
