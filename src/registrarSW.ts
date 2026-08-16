/**
 * Registro do Service Worker e controle de atualização.
 *
 * O registro é feito à mão (e não pelo auto-register do plugin) para que a
 * troca de versão seja uma decisão, não um susto: recarregar sozinho no meio
 * de um lançamento faria o usuário perder o que está digitando. A versão nova
 * fica esperando e o app avisa.
 */

let registro: ServiceWorkerRegistration | null = null
let recarregando = false
const ouvintes = new Set<(disponivel: boolean) => void>()

function avisar() {
  const esperando = registro?.waiting
  ouvintes.forEach((cb) => cb(!!esperando))

  // Se essa versão sair da espera — porque foi aplicada aqui, em outra aba,
  // ou porque foi descartada — o aviso precisa sumir sozinho. Sem isto a
  // faixa "nova versão" podia ficar parada na tela sem ter o que aplicar.
  if (esperando && !esperando.onstatechange) {
    esperando.onstatechange = () => {
      if (esperando.state !== 'installed') avisar()
    }
  }
}

export function assinarAtualizacao(cb: (disponivel: boolean) => void): () => void {
  ouvintes.add(cb)
  cb(!!registro?.waiting)
  return () => ouvintes.delete(cb)
}

export function registrarSW(): void {
  if (!('serviceWorker' in navigator)) return
  if (import.meta.env.DEV) return

  // Quando o SW novo assume o controle, a página recarrega uma única vez
  // para passar a rodar o código novo de fato.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    avisar()
    if (recarregando) return
    recarregando = true
    window.location.reload()
  })

  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .then((reg) => {
        registro = reg
        avisar()

        // Procura atualização quando o app volta ao primeiro plano —
        // é o momento em que um PWA de iOS costuma reabrir.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') void reg.update()
        })

        reg.addEventListener('updatefound', () => {
          const novo = reg.installing
          if (!novo) return
          novo.addEventListener('statechange', () => {
            // `controller` existente = já havia uma versão rodando, então
            // esta é uma atualização, não a primeira instalação.
            if (novo.state === 'installed' && navigator.serviceWorker.controller) avisar()
          })
        })
      })
      .catch(() => {
        // Sem SW o app ainda funciona online; só perde o offline.
      })
  })
}

export type ResultadoBusca = 'atualizando' | 'atual' | 'indisponivel'

/** Procura uma versão nova no servidor. */
export async function procurarAtualizacao(): Promise<ResultadoBusca> {
  if (!registro) return 'indisponivel'
  try {
    await registro.update()
  } catch {
    return 'indisponivel'
  }
  avisar()
  return registro.waiting ? 'atualizando' : 'atual'
}

/** Manda a versão em espera assumir. A página recarrega em seguida,
 *  pelo listener de `controllerchange`. */
export function aplicarAtualizacao(): boolean {
  const esperando = registro?.waiting
  if (!esperando) return false
  esperando.postMessage({ tipo: 'ATIVAR' })
  return true
}

/** Carimbo do build, mostrado em Ajustes. Serve para o usuário conseguir
 *  dizer qual versão está rodando quando algo dá errado. */
export const VERSAO_BUILD: string =
  typeof __BUILD__ === 'string' ? __BUILD__ : 'desenvolvimento'
