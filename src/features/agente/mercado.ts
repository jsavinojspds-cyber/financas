import { lsGet, lsSet } from '@/storage/idb'

export interface Indicador {
  id: string
  rotulo: string
  valor: number
  /** variação % do dia; null quando a fonte não fornece (juros, inflação) */
  variacao: number | null
  formato: 'pontos' | 'moeda' | 'percent'
  /** rótulo do regime do número ("a.a.", "no mês"), quando não há variação */
  nota?: string
}

export interface Mercado {
  gerado_em: string
  indicadores: Indicador[]
  falhas?: string[]
}

const K_CACHE = 'fin-mercado'

/**
 * Lê os indicadores gerados pelo workflow da manhã.
 *
 * O arquivo é estático e entra no precache do Service Worker, então continua
 * disponível offline — mostrando a última cotação conhecida, com a data à
 * vista para não passar por atual.
 */
export async function buscarMercado(): Promise<Mercado | null> {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}mercado.json`, { cache: 'no-cache' })
    if (!r.ok) throw new Error(String(r.status))
    const m = (await r.json()) as Mercado
    if (!Array.isArray(m?.indicadores)) throw new Error('formato inesperado')
    lsSet(K_CACHE, JSON.stringify(m))
    return m
  } catch {
    // Offline ou arquivo indisponível: devolve o último que vimos.
    const bruto = lsGet(K_CACHE)
    if (!bruto) return null
    try {
      return JSON.parse(bruto) as Mercado
    } catch {
      return null
    }
  }
}

/**
 * Atualiza o dólar com a cotação do momento.
 *
 * É o único indicador com fonte de CORS aberto — Ibovespa e IFIX não têm
 * equivalente gratuito, e por isso dependem do arquivo gerado pelo workflow.
 */
export async function atualizarDolar(): Promise<Indicador | null> {
  try {
    const r = await fetch('https://economia.awesomeapi.com.br/last/USD-BRL')
    if (!r.ok) return null
    const d = (await r.json()) as { USDBRL?: { bid: string; pctChange: string } }
    const u = d.USDBRL
    if (!u) return null
    const valor = Number(u.bid)
    if (!Number.isFinite(valor)) return null
    return {
      id: 'usd',
      rotulo: 'Dólar',
      valor,
      variacao: Number(u.pctChange) || 0,
      formato: 'moeda',
    }
  } catch {
    return null
  }
}

export function formatarIndicador(i: Indicador): string {
  if (i.formato === 'moeda') {
    return i.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }
  if (i.formato === 'percent') {
    return `${i.valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`
  }
  return i.valor.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
}

/** "há 2 h", "ontem" — deixa claro quando o dado é velho. */
export function idadeTexto(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 2) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h} h`
  const d = Math.floor(h / 24)
  return d === 1 ? 'ontem' : `há ${d} dias`
}
