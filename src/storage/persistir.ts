import { idbSet, lsSet } from './idb'

export type EstadoGravacao = 'salvo' | 'salvando' | 'pendente' | 'erro'

/** ~0,4 s: rápido o bastante para não perder nada num fechamento súbito
 *  e lento o bastante para não gravar a cada tecla digitada. */
const DEBOUNCE_MS = 400

/**
 * Persistidor com auto-save.
 *
 * Substitui o botão "💾 Salvar" do app antigo. Toda mutação chama `agendar`;
 * a gravação acontece sozinha. Três garantias que o código original não tinha:
 *
 *  1. a escrita no IndexedDB é aguardada e o resultado vira estado de UI,
 *     então uma falha aparece em vez de sumir;
 *  2. `pagehide`/`visibilitychange` forçam o flush antes do Safari suspender
 *     a aba — que é exatamente quando o app costumava perder dados;
 *  3. no caminho de fechamento o localStorage é escrito primeiro, porque ele
 *     é síncrono e sempre completa; o IndexedDB pode ser cortado no meio.
 */
export function criarPersistidor(chave: string) {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pendente: string | null = null
  let ultimoGravado: string | null = null
  let gravando = false
  let estado: EstadoGravacao = 'salvo'
  const ouvintes = new Set<(e: EstadoGravacao) => void>()

  function definirEstado(novo: EstadoGravacao) {
    if (estado === novo) return
    estado = novo
    ouvintes.forEach((cb) => cb(novo))
  }

  async function gravar(): Promise<void> {
    if (gravando || pendente === null) return
    const json = pendente
    pendente = null
    gravando = true
    definirEstado('salvando')

    const okIdb = await idbSet(chave, json)
    const okLs = lsSet(chave, json)

    gravando = false

    if (okIdb || okLs) {
      ultimoGravado = json
      // Se algo novo chegou durante a gravação, encadeia mais uma rodada.
      definirEstado(pendente === null ? 'salvo' : 'pendente')
    } else {
      // Nenhum dos dois storages aceitou: devolve para a fila e avisa a UI.
      pendente = json
      definirEstado('erro')
    }

    if (pendente !== null) void gravar()
  }

  /** Chamado a cada mutação. Ignora gravação se nada mudou de fato. */
  function agendar(json: string): void {
    if (json === ultimoGravado && pendente === null) return
    pendente = json
    definirEstado('pendente')
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      void gravar()
    }, DEBOUNCE_MS)
  }

  /** Flush imediato. Usado ao esconder a aba e no botão de forçar gravação. */
  function flush(): Promise<void> {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (pendente !== null) {
      // Síncrono e confiável mesmo se a aba morrer no próximo instante.
      lsSet(chave, pendente)
    }
    return gravar()
  }

  function assinar(cb: (e: EstadoGravacao) => void): () => void {
    ouvintes.add(cb)
    cb(estado)
    return () => ouvintes.delete(cb)
  }

  // No iOS o `beforeunload` é pouco confiável; `pagehide` e a transição para
  // `hidden` são os eventos que realmente disparam ao trocar de app.
  const aoEsconder = () => {
    if (document.visibilityState === 'hidden') void flush()
  }
  const aoSair = () => void flush()

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', aoEsconder)
    window.addEventListener('pagehide', aoSair)
    window.addEventListener('freeze', aoSair)
  }

  return { agendar, flush, assinar, obterEstado: () => estado }
}

export type Persistidor = ReturnType<typeof criarPersistidor>
