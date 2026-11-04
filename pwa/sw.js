/*
 * Le service worker de SCP Masters. Modèle : vite.config.ts (extension « service-worker ») y inscrit la version du
 * build, l'empreinte du catalogue et la liste des fichiers de l'application, puis le publie en /sw.js.
 *
 * - Les pages : le réseau d'abord ; hors ligne, la dernière version gardée (le jeu affiche alors « hors ligne »).
 * - Le code et les styles (/assets, noms à empreinte) : gardés au premier chargement, servis depuis le cache.
 * - Le catalogue léger (/data/leger, adresses versionnées) : depuis le cache ; les anciennes versions sont effacées.
 * - Photos, polices, icônes du site : depuis le cache, mis à jour en arrière-plan.
 * - Le serveur du jeu (Supabase) et les images des cartes (autres domaines) ne passent jamais par ici.
 * Une nouvelle version attend que le joueur accepte la mise à jour (message « activer ») avant de prendre la main.
 */
const VERSION = '__VERSION__'
const VERSION_CARTES = '__VERSION_CARTES__'
const PRECHARGE = __PRECHARGE__

const COQUILLE = `scp-masters-coquille-${VERSION}`
const DONNEES = 'scp-masters-donnees'
const MEDIAS = 'scp-masters-medias'

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(COQUILLE).then((c) => c.addAll(PRECHARGE)))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      // Les coquilles des versions précédentes
      for (const nom of await caches.keys()) {
        if (nom.startsWith('scp-masters-coquille-') && nom !== COQUILLE) await caches.delete(nom)
      }
      // Les catalogues d'avant
      const donnees = await caches.open(DONNEES)
      for (const req of await donnees.keys()) {
        if (new URL(req.url).searchParams.get('v') !== VERSION_CARTES) await donnees.delete(req)
      }
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (e) => {
  if (e.data === 'activer') self.skipWaiting()
})

async function depuisLeCache(nomCache, req) {
  const cache = await caches.open(nomCache)
  const garde = await cache.match(req)
  if (garde) return garde
  const rep = await fetch(req)
  if (rep.ok) await cache.put(req, rep.clone())
  return rep
}

async function cacheEtMiseAJour(req) {
  const cache = await caches.open(MEDIAS)
  const garde = await cache.match(req)
  const frais = fetch(req)
    .then((rep) => {
      if (rep.ok) void cache.put(req, rep.clone())
      return rep
    })
    .catch(() => garde)
  return garde ?? frais
}

async function pageAvecSecours(req) {
  try {
    const rep = await fetch(req)
    if (rep.ok) {
      const cache = await caches.open(COQUILLE)
      await cache.put('/', rep.clone())
    }
    return rep
  } catch {
    return (await caches.match('/')) ?? Response.error()
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  // Le service worker lui-même et l'atelier de développement ne passent pas par le cache
  if (url.pathname === '/sw.js' || url.pathname.startsWith('/atelier')) return
  if (req.mode === 'navigate') {
    e.respondWith(pageAvecSecours(req))
  } else if (url.pathname.startsWith('/assets/')) {
    e.respondWith(depuisLeCache(COQUILLE, req))
  } else if (url.pathname.startsWith('/data/leger/')) {
    e.respondWith(depuisLeCache(DONNEES, req))
  } else if (/^\/(photos|sunny|immersion)\/|\.(png|svg|webp|jpg|woff2?)$/.test(url.pathname)) {
    e.respondWith(cacheEtMiseAJour(req))
  }
})

// ---------- Notifications sur l'appareil (Web Push, envoyées par serveur/push.ts) ----------
self.addEventListener('push', (e) => {
  let c = { titre: 'SCP Masters', texte: 'Du nouveau au terminal.', url: '/', etiquette: 'scp' }
  try {
    c = { ...c, ...e.data.json() }
  } catch {
    // Contenu illisible : la notification générique
  }
  e.waitUntil(
    self.registration.showNotification(c.titre, {
      body: c.texte,
      tag: c.etiquette,
      icon: '/icone-192.png',
      badge: '/badge-96.png',
      data: { url: c.url },
      lang: 'fr',
    }),
  )
})

// Au toucher : l'application déjà ouverte va à l'écran concerné ; sinon, elle s'ouvre dessus
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = (e.notification.data && e.notification.data.url) || '/'
  e.waitUntil(
    (async () => {
      const fenetres = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const ouverte = fenetres.find((f) => new URL(f.url).origin === self.location.origin)
      if (ouverte) {
        await ouverte.focus()
        ouverte.postMessage({ type: 'ouvrir', url })
        return
      }
      await self.clients.openWindow(url)
    })(),
  )
})
