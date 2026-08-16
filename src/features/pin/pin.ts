import { idbGet, idbSet, lsGet, lsSet } from '@/storage/idb'
import { K_PIN } from '@/storage/migrar'

export const PIN_PADRAO = '1234'

/**
 * Lê o PIN priorizando o IndexedDB.
 *
 * O app antigo lia só do localStorage: quando o Safari o apagava por ITP, o
 * PIN voltava silenciosamente para 1234 e o usuário nem ficava sabendo.
 * Se o IndexedDB tem valor, ele manda — e o localStorage é reescrito para
 * voltar a servir de espelho.
 */
export async function lerPin(): Promise<string> {
  const doIdb = await idbGet<string>(K_PIN)
  if (typeof doIdb === 'string' && /^\d{4}$/.test(doIdb)) {
    if (lsGet(K_PIN) !== doIdb) lsSet(K_PIN, doIdb)
    return doIdb
  }

  const doLs = lsGet(K_PIN)
  if (typeof doLs === 'string' && /^\d{4}$/.test(doLs)) {
    // Estava só no localStorage: promove para o IndexedDB antes que suma.
    void idbSet(K_PIN, doLs)
    return doLs
  }

  return PIN_PADRAO
}

export async function gravarPin(pin: string): Promise<boolean> {
  if (!/^\d{4}$/.test(pin)) return false
  const okIdb = await idbSet(K_PIN, pin)
  const okLs = lsSet(K_PIN, pin)
  return okIdb || okLs
}
