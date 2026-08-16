/// <reference lib="webworker" />

/**
 * Service Worker do app.
 *
 * Escrito à mão em vez de usar o runtime do Workbox: as necessidades aqui são
 * poucas (precache + fallback offline + clique na notificação) e assim o SW
 * fica com alguns KB em vez de dezenas.
 *
 * `self.__WB_MANIFEST` é substituído no build pela lista de arquivos com hash
 * gerada pelo vite-plugin-pwa.
 */

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: { url: string; revision: string | null }[]
}

const VERSAO = 'financas-v5'
const CACHE_ESTATICO = `${VERSAO}-estatico`
const BASE = '/financas/'

const ARQUIVOS = self.__WB_MANIFEST.map((e) => e.url)

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_ESTATICO)
      // addAll é tudo-ou-nada: um 404 derrubaria a instalação inteira,
      // então cada arquivo é buscado por conta própria.
      await Promise.all(
        ARQUIVOS.map(async (url) => {
          try {
            await cache.add(new Request(url, { cache: 'reload' }))
          } catch {
            /* ignora arquivo indisponível */
          }
        }),
      )
    })(),
  )
})

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    (async () => {
      const nomes = await caches.keys()
      await Promise.all(
        nomes.filter((n) => n.startsWith('financas-') && n !== CACHE_ESTATICO).map((n) => caches.delete(n)),
      )
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (evento) => {
  if ((evento.data as { tipo?: string } | null)?.tipo === 'ATIVAR') void self.skipWaiting()
})

self.addEventListener('fetch', (evento) => {
  const req = evento.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  // Nada de interceptar outras origens (ex.: chamadas ao Supabase).
  if (url.origin !== self.location.origin) return

  // Navegação: tenta a rede e cai para o index em cache — é o que faz o app
  // abrir no avião.
  if (req.mode === 'navigate') {
    evento.respondWith(
      (async () => {
        try {
          return await fetch(req)
        } catch {
          const cache = await caches.open(CACHE_ESTATICO)
          const index = await cache.match(`${BASE}index.html`)
          return index ?? new Response('Offline', { status: 503 })
        }
      })(),
    )
    return
  }

  // Demais assets: cache primeiro (todos têm hash no nome, então não envelhecem).
  evento.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_ESTATICO)
      const emCache = await cache.match(req)
      if (emCache) return emCache
      try {
        const resposta = await fetch(req)
        if (resposta.ok && resposta.type === 'basic') cache.put(req, resposta.clone())
        return resposta
      } catch {
        return new Response('', { status: 504 })
      }
    })(),
  )
})

// Clique na notificação de vencimento: foca a aba aberta ou abre o app.
self.addEventListener('notificationclick', (evento) => {
  evento.notification.close()
  const destino = (evento.notification.data as { url?: string } | null)?.url ?? BASE
  evento.waitUntil(
    (async () => {
      const clientes = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const c of clientes) {
        if (c.url.includes(BASE)) return c.focus()
      }
      return self.clients.openWindow(destino)
    })(),
  )
})

export {}
