/**
 * Wrapper de IndexedDB.
 *
 * O app original usava o mesmo banco/store (`financasApp` / `dados`, v1) mas
 * disparava `idbSet` sem `await` — se o Safari suspendesse a aba no meio da
 * transação a escrita sumia sem erro. Aqui toda operação é aguardada de fato
 * e o resultado é reportado, para que a camada de persistência possa marcar
 * o estado como "não gravado" e tentar de novo.
 */

const DB_NOME = 'financasApp'
const DB_STORE = 'dados'
/** v1 era o banco do app antigo; v2 mantém o mesmo store e só formaliza o schema. */
const DB_VERSAO = 2

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

function abrir(): Promise<IDBDatabase | null> {
  if (dbCache) return dbCache

  dbCache = comTimeout(
    new Promise<IDBDatabase | null>((resolve) => {
      if (typeof indexedDB === 'undefined') return resolve(null)
      let req: IDBOpenDBRequest
      try {
        req = indexedDB.open(DB_NOME, DB_VERSAO)
      } catch {
        return resolve(null)
      }
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE)
      }
      req.onsuccess = () => {
        const db = req.result
        // Se outra aba pedir upgrade, soltamos a conexão para não travar.
        db.onversionchange = () => {
          db.close()
          dbCache = null
        }
        resolve(db)
      }
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    }),
    null,
  )

  return dbCache
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
        resolve(false)
      }
    }),
    false,
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
