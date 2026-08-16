/**
 * Registro do Service Worker.
 *
 * Feito à mão (e não pelo auto-register do plugin) para controlar quando a
 * versão nova assume: recarregar sozinho no meio de um lançamento faria o
 * usuário perder o que está digitando.
 */
export function registrarSW(): void {
  if (!('serviceWorker' in navigator)) return
  if (import.meta.env.DEV) return

  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .then((reg) => {
        // Procura atualização quando o app volta ao primeiro plano.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') void reg.update()
        })

        reg.addEventListener('updatefound', () => {
          const novo = reg.installing
          if (!novo) return
          novo.addEventListener('statechange', () => {
            // `controller` existente = já havia uma versão rodando, então
            // esta é uma atualização, não a primeira instalação.
            if (novo.state === 'installed' && navigator.serviceWorker.controller) {
              // Assume na próxima abertura; nada é interrompido agora.
              novo.postMessage({ tipo: 'ATIVAR' })
            }
          })
        })
      })
      .catch(() => {
        // Sem SW o app ainda funciona online; só perde o offline.
      })
  })
}
