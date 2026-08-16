/**
 * Wrapper de IndexedDB.
 *
 * O app original usava o mesmo banco/store (`financasApp` / `dados`) mas
 * disparava `idbSet` sem `await` — se o Safari suspendesse a aba no meio da
 * transação a escrita sumia sem erro. Aqui toda operação é aguardada de fato
 * e o resultado é reportado, para que a camada de persistência possa marcar
 * o estado como "não gravado" e tentar de novo.
 */

const DB_NOME = 'financasApp'
const DB_STORE = 'dados'

/** O Safari em modo privado pode deixar `open` pendurado sem success nem error. */
const TIMEOUT_MS = 8000

let dbCache: Promise<IDBDatabase | null> | null = null

function comTimeout<T>(p: Promise<T>, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), TIMEOUT_MS)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      () => {
        clearTimeout(t)
        resolve(fallback)
      },
    )
  })
}

/**
 * Abre o banco.
 *
 * Sem `versao`, abre na versão que existir no disco — é o caminho normal e
 * NÃO dispara upgrade. Isso importa: o app antigo mantém o banco aberto na
 * versão 1, e pedir uma versão maior faria o `open` ficar `blocked` enquanto
 * ele estivesse vivo. Como o schema é o mesmo dos dois lados (um único store),
 * não há nada a migrar — subir a versão só criaria uma disputa sem ganho.
 */
function abrirCru(versao?: number): Promise<IDBDatabase | null> {
  return comTimeout(
    new Promise<IDBDatabase | null>((resolve) => {
      if (typeof indexedDB === 'undefined') return resolve(null)
      let req: IDBOpenDBRequest
      try {
        req = versao === undefined ? indexedDB.open(DB_NOME) : indexedDB.open(DB_NOME, versao)
      } catch {
        return resolve(null)
      }
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE)
      }
      req.onsuccess = () => {
        const db = req.result
        // Se outra aba pedir upgrade, soltamos a conexão para não travá-la.
        db.onversionchange = () => {
          db.close()
          dbCache = null
        }
        // Conexão perdida (aba dormiu, banco deletado): força reabertura.
        db.onclose = () => {
          dbCache = null
        }
        resolve(db)
      }
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    }),
    null,
  )
}

async function abrir(): Promise<IDBDatabase | null> {
  if (dbCache) {
    const emCache = await dbCache
    if (emCache) return emCache
    // Nunca guardar uma falha: se o banco estava bloqueado por outra aba,
    // a próxima leitura precisa poder tentar de novo em vez de assumir
    // para sempre que não há storage — foi assim que dados existentes
    // podiam parecer inexistentes e o app cair no estado inicial.
    dbCache = null
  }

  const tentativa = (async () => {
    let db = await abrirCru()
    // Banco existe mas sem o store (não deveria acontecer): só nesse caso
    // vale subir a versão para criá-lo.
    if (db && !db.objectStoreNames.contains(DB_STORE)) {
      const proxima = db.version + 1
      db.close()
      db = await abrirCru(proxima)
    }
    return db
  })()

  dbCache = tentativa
  const db = await tentativa
  if (!db) dbCache = null
  return db
}

export async function idbGet<T = string>(chave: string): Promise<T | null> {
  const db = await abrir()
  if (!db) return null
  return comTimeout(
    new Promise<T | null>((resolve) => {
      try {
        const tx = db.transaction(DB_STORE, 'readonly')
        const req = tx.objectStore(DB_STORE).get(chave)
        req.onsuccess = () => resolve((req.result as T) ?? null)
        req.onerror = () => resolve(null)
      } catch {
        // InvalidStateError: a conexão morreu entre o abrir e o usar.
        dbCache = null
        resolve(null)
      }
    }),
    null,
  )
}

/** Retorna true só quando a transação realmente completou. */
export async function idbSet(chave: string, valor: string): Promise<boolean> {
  const db = await abrir()
  if (!db) return false
  return comTimeout(
    new Promise<boolean>((resolve) => {
      try {
        const tx = db.transaction(DB_STORE, 'readwrite')
        tx.objectStore(DB_STORE).put(valor, chave)
        // Só `oncomplete` garante que o dado foi para o disco.
        tx.oncomplete = () => resolve(true)
        tx.onerror = () => resolve(false)
        tx.onabort = () => resolve(false)
      } catch {
        dbCache = null
        resolve(false)
      }
    }),
    false,
  )
}

export async function idbDel(chave: string): Promise<boolean> {
  const db = await abrir()
  if (!db) return false
  return comTimeout(
    new Promise<boolean>((resolve) => {
      try {
        const tx = db.transaction(DB_STORE, 'readwrite')
        tx.objectStore(DB_STORE).delete(chave)
        tx.oncomplete = () => resolve(true)
        tx.onerror = () => resolve(false)
      } catch {
        dbCache = null
        resolve(false)
      }
    }),
    false,
  )
}

/** Lista as chaves gravadas — usado no diagnóstico em Ajustes. */
export async function idbChaves(): Promise<string[]> {
  const db = await abrir()
  if (!db) return []
  return comTimeout(
    new Promise<string[]>((resolve) => {
      try {
        const tx = db.transaction(DB_STORE, 'readonly')
        const req = tx.objectStore(DB_STORE).getAllKeys()
        req.onsuccess = () => resolve((req.result as IDBValidKey[]).map(String))
        req.onerror = () => resolve([])
      } catch {
        resolve([])
      }
    }),
    [],
  )
}

// ── localStorage: espelho secundário ────────────────────────────────
// O Safari iOS apaga o localStorage por inatividade (ITP), então ele nunca
// é fonte da verdade — serve como resgate caso o IndexedDB falhe.

export function lsGet(chave: string): string | null {
  try {
    return localStorage.getItem(chave)
  } catch {
    return null
  }
}

export function lsSet(chave: string, valor: string): boolean {
  try {
    localStorage.setItem(chave, valor)
    return true
  } catch {
    // QuotaExceededError ou storage bloqueado
    return false
  }
}
