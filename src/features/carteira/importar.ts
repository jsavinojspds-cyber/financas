import type { Posicao } from '@/types'

export interface LinhaImportada {
  ticker: string
  quantidade: number
  precoMedio: number | null
}

/** Converte "1.234,56" (pt-BR) ou "1,234.56" (en) em número. */
function numero(bruto: string): number {
  const s = bruto.trim().replace(/[^\d.,-]/g, '')
  if (!s) return NaN

  const temVirgula = s.includes(',')
  const temPonto = s.includes('.')

  let normalizado = s
  if (temVirgula && temPonto) {
    // Os dois presentes: o decimal é o que aparece por último.
    // 1.234,56 (pt-BR) vs 1,234.56 (en)
    normalizado =
      s.lastIndexOf(',') > s.lastIndexOf('.')
        ? s.replace(/\./g, '').replace(',', '.')
        : s.replace(/,/g, '')
  } else if (temVirgula || temPonto) {
    // Só um separador, e ele é ambíguo: "1.200" tanto pode ser mil e duzentos
    // quanto um e dois décimos. Exatamente três dígitos depois dele é milhar
    // (1.200 · 2,000); qualquer outra quantidade é decimal (99.97 · 145,00).
    const sep = temVirgula ? ',' : '.'
    const depois = s.slice(s.lastIndexOf(sep) + 1)
    normalizado = /^\d{3}$/.test(depois)
      ? s.split(sep).join('')
      : temVirgula
        ? s.replace(',', '.')
        : s
  }

  const n = Number(normalizado)
  return Number.isFinite(n) ? n : NaN
}

/**
 * Separa os campos que vêm depois do ticker.
 *
 * A vírgula é ambígua no Brasil: serve de separador de campo em CSV e de
 * separador decimal em "145,00". Por isso ela só é usada para dividir campos
 * quando não há nenhum separador inequívoco na linha — assim
 * "HGLG11 100 145,00" e "XPML11,25,101.25" saem os dois certos.
 */
function campos(resto: string): number[] {
  const valido = (n: number) => Number.isFinite(n) && n > 0
  const porSeparadorClaro = resto.split(/[;\t|]+|\s+/).map(numero).filter(valido)

  // Dois ou mais campos já saíram, ou não há vírgula em disputa: pronto.
  if (porSeparadorClaro.length >= 2 || !resto.includes(',')) return porSeparadorClaro

  // Sobrou um campo só e há vírgula: ela era o separador, não o decimal.
  // É o caso de "XPML11,25,101.25", sem espaço nem ponto e vírgula.
  const porVirgula = resto.split(',').map(numero).filter(valido)
  return porVirgula.length > porSeparadorClaro.length ? porVirgula : porSeparadorClaro
}

const TICKER = /\b([A-Z]{4}\d{2})\b/

/**
 * Extrai posições de um texto colado.
 *
 * Aceita de propósito vários formatos, porque o que o usuário cola vem do
 * extrato da corretora, de uma planilha ou digitado na mão:
 *
 *   HGLG11 100 145,00
 *   HGLG11;100;145,00
 *   HGLG11,100
 *   FII HGLG11 - 100 cotas - R$ 145,00
 *
 * O ticker é achado por padrão (4 letras + 2 dígitos), então cabeçalho e
 * texto solto no meio não atrapalham. A primeira quantia depois do ticker é
 * a quantidade; a segunda, se houver, é o preço médio.
 */
export function parsearCarteira(texto: string): {
  posicoes: LinhaImportada[]
  ignoradas: string[]
} {
  const posicoes: LinhaImportada[] = []
  const ignoradas: string[] = []

  for (const linha of (texto ?? '').split(/\r?\n/)) {
    const limpa = linha.trim()
    if (!limpa) continue

    const m = limpa.toUpperCase().match(TICKER)
    if (!m?.[1]) {
      ignoradas.push(limpa)
      continue
    }
    const ticker = m[1]

    // Só o que vem DEPOIS do ticker conta como número, senão um "FII 11"
    // no começo da linha viraria quantidade.
    const resto = limpa.toUpperCase().slice(limpa.toUpperCase().indexOf(ticker) + ticker.length)
    const numeros = campos(resto)

    const quantidade = numeros[0]
    if (!quantidade) {
      ignoradas.push(limpa)
      continue
    }

    posicoes.push({
      ticker,
      quantidade,
      precoMedio: numeros[1] ?? null,
    })
  }

  return { posicoes, ignoradas }
}

/**
 * Mescla as linhas importadas com a carteira existente.
 * Ticker repetido substitui a posição — importar de novo é corrigir,
 * não somar em dobro.
 */
export function mesclar(atual: Posicao[], novas: LinhaImportada[]): Posicao[] {
  const mapa = new Map(atual.map((p) => [p.ticker, p]))
  const agora = Date.now()
  for (const n of novas) {
    mapa.set(n.ticker, {
      ticker: n.ticker,
      quantidade: n.quantidade,
      precoMedio: n.precoMedio,
      updatedAt: agora,
    })
  }
  return [...mapa.values()].sort((a, b) => a.ticker.localeCompare(b.ticker))
}
