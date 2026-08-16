import { fmtR, hoje } from '@/lib/formato'
import { lsGet, lsSet } from '@/storage/idb'
import { vencendoEm } from '@/state/seletores'
import type { EstadoApp } from '@/types'

const K_ULTIMO_AVISO = 'fin-ultimo-aviso'

export function notificacoesSuportadas(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator
  )
}

export function permissaoAtual(): NotificationPermission | 'indisponivel' {
  if (!notificacoesSuportadas()) return 'indisponivel'
  return Notification.permission
}

/**
 * No iOS a permissão só pode ser pedida a partir de um gesto do usuário e
 * apenas quando o app está instalado na tela inicial. Fora disso o navegador
 * nega direto, então avisamos em vez de falhar em silêncio.
 */
export async function pedirPermissao(): Promise<NotificationPermission | 'indisponivel'> {
  if (!notificacoesSuportadas()) return 'indisponivel'
  try {
    return await Notification.requestPermission()
  } catch {
    return 'denied'
  }
}

/** iOS PWA instalado na tela inicial? */
export function ehPwaInstalado(): boolean {
  if (typeof window === 'undefined') return false
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone
  return iosStandalone === true || window.matchMedia('(display-mode: standalone)').matches
}

/**
 * Mostra o aviso de vencimentos, no máximo uma vez por dia.
 *
 * É uma notificação local: o Service Worker a exibe quando o app é aberto ou
 * volta ao primeiro plano. Não exige servidor, funciona offline — e por isso
 * não dispara com o app totalmente fechado.
 */
export async function avisarVencimentos(estado: EstadoApp): Promise<boolean> {
  if (!estado.config.notificacoes) return false
  if (permissaoAtual() !== 'granted') return false

  const hojeStr = hoje()
  if (lsGet(K_ULTIMO_AVISO) === hojeStr) return false

  const itens = vencendoEm(estado, estado.config.diasAviso)
  if (!itens.length) {
    // marca mesmo sem itens para não recalcular a cada foco no mesmo dia
    lsSet(K_ULTIMO_AVISO, hojeStr)
    return false
  }

  const total = itens.reduce((s, l) => s + Number(l.valor), 0)
  const titulo =
    itens.length === 1
      ? `${itens[0]?.nome} vence em breve`
      : `${itens.length} contas vencendo`

  try {
    const reg = await navigator.serviceWorker.ready
    // No iOS só existe showNotification via registration —
    // `new Notification(...)` lança TypeError.
    await reg.showNotification(titulo, {
      body: `${fmtR(total)} nos próximos ${estado.config.diasAviso} dias`,
      icon: '/financas/icons/icon-192.png',
      badge: '/financas/icons/icon-badge.png',
      tag: 'vencimentos',
      data: { url: '/financas/' },
    })
    lsSet(K_ULTIMO_AVISO, hojeStr)
    return true
  } catch {
    return false
  }
}
