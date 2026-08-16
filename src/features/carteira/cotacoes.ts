import { lsGet, lsSet } from '@/storage/idb'

export interface CotacaoFii {
  preco: number
  /** variação % do dia */
  variacao: number
  nome: string
}

export interface Cotacoes {
  gerado_em: string
  cotacoes: Record<string, CotacaoFii>
  falhas?: string[]
}

const K_CACHE = 'fin-fiis'

/**
 * Lê o arquivo de cotações publicado pelo workflow da manhã.
 *
 * O arquivo traz um universo de fundos líquidos, não a carteira do usuário —
 * quais fundos ele tem e quantas cotas nunca saem do aparelho. O cruzamento
 * é feito aqui, localmente.
 */
export async function buscarCotacoes(): Promise<Cotacoes | null> {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}fiis.json`, { cache: 'no-cache' })
    if (!r.ok) throw new Error(String(r.status))
    const c = (await r.json()) as Cotacoes
    if (!c?.cotacoes || typeof c.cotacoes !== 'object') throw new Error('formato inesperado')
    lsSet(K_CACHE, JSON.stringify(c))
    return c
  } catch {
    const bruto = lsGet(K_CACHE)
    if (!bruto) return null
    try {
      return JSON.parse(bruto) as Cotacoes
    } catch {
      return null
    }
  }
}
