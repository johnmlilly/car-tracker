// Prototype helpers: lucide icon sprite + toolbar (page links, theme toggle). Throwaway.
const ICONS = {
  car: '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
  droplet: '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
  tire: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><path d="M12 2v6M12 16v6M2 12h6M16 12h6"/>',
  filter: '<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>',
  wind: '<path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/>',
  thermometer: '<path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/>',
  disc: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="2"/>',
  cog: '<path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z"/><path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/><path d="M12 2v2M12 22v-2M17 20.66l-1-1.73M11 10.27 7 3.34M20.66 17l-1.73-1M3.34 7l1.73 1M14 12h8M2 12h2M20.66 7l-1.73 1M3.34 17l1.73-1M17 3.34l-1 1.73M11 13.73l-4 6.93"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  plus: '<path d="M5 12h14M12 5v14"/>',
  gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>',
  pencil: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 2-3Z"/><path d="M12 9v4M12 17h.01"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  code: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h2M7 13h6M7 17h4"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
}

// Replace <i data-i="name" class="..."></i> with inline SVG.
function renderIcons(root = document) {
  root.querySelectorAll('i[data-i]').forEach((el) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 24 24')
    svg.setAttribute('aria-hidden', 'true')
    svg.setAttribute('class', `icon ${el.className}`.trim())
    svg.innerHTML = ICONS[el.dataset.i] || ''
    el.replaceWith(svg)
  })
}

function protoBar() {
  if (window !== window.top) return // inside phone.html frame
  const page = location.pathname.split('/').pop() + location.search
  const pages = [
    ['home.html', 'Home'],
    ['vehicle.html', 'Vehicle grid'],
    ['vehicle.html?drawer=service', 'Add-service drawer'],
    ['phone.html?src=home.html', 'Phone: home'],
    ['phone.html?src=vehicle.html', 'Phone: vehicle'],
    ['phone.html?src=vehicle.html%3Fdrawer%3Dservice', 'Phone: bottom sheet'],
  ]
  const bar = document.createElement('div')
  bar.className = 'proto-bar'
  bar.innerHTML =
    '<strong>PROTOTYPE</strong>' +
    pages.map(([href, label]) => `<a href="${href}" class="${href === page ? 'on' : ''}">${label}</a>`).join('') +
    '<span class="spacer"></span><span>Theme</span>' +
    ['system', 'light', 'dark'].map((t) => `<button data-theme-set="${t}">${t}</button>`).join('')
  document.body.prepend(bar)
  const apply = (t) => {
    if (t === 'system') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.dataset.theme = t
    bar.querySelectorAll('[data-theme-set]').forEach((b) => b.classList.toggle('on', b.dataset.themeSet === t))
    try { localStorage.setItem('proto-theme', t) } catch { /* ignore */ }
    document.querySelectorAll('iframe').forEach((f) => { try { f.contentWindow.postMessage({ theme: t }, '*') } catch { /* ignore */ } })
  }
  bar.addEventListener('click', (e) => { const t = e.target.dataset?.themeSet; if (t) apply(t) })
  let saved = 'system'
  try { saved = localStorage.getItem('proto-theme') || 'system' } catch { /* ignore */ }
  apply(saved)
}

// Framed pages follow the parent's theme toggle.
addEventListener('message', (e) => {
  const t = e.data && e.data.theme
  if (!t) return
  if (t === 'system') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.dataset.theme = t
})
try {
  const t = localStorage.getItem('proto-theme')
  if (t && t !== 'system') document.documentElement.dataset.theme = t
} catch { /* ignore */ }

document.addEventListener('DOMContentLoaded', () => { renderIcons(); protoBar() })
