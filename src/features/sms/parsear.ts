import { hoje } from '@/lib/formato'
import type { FormaPagamento, TipoLancamento } from '@/types'

export interface DadosExtraidos {
  nome: string
  valor: number
  vencimento: string
  data_pgto: string
  tp: FormaPagamento
  tl: TipoLancamento
}

/**
 * Extrai um lançamento do texto de uma notificação de compra.
 * Regras herdadas do app original, com o ano corrigido: uma compra em
 * dezembro notificada em janeiro pertence ao ano anterior.
 */
export function parsearSMS(texto: string): DadosExtraidos | null {
  const t = (texto ?? '').trim()
  if (!t) return null

  // "RS 26,80", "R$ 1.234,56", "valor R$ 26,80"
  const mValor = t.match(/R[S$]\s*([\d.]+,\d{2})/i) ?? t.match(/R[S$]\s*(\d+)/i)
  if (!mValor?.[1]) return null
  const valor = parseFloat(mValor[1].replace(/\./g, '').replace(',', '.'))
  if (!Number.isFinite(valor) || valor <= 0) return null

  // "em 06/04" ou "em 06/04/2026"
  let vencimento = hoje()
  const mData = t.match(/em\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/i) ?? t.match(/\b(\d{2})\/(\d{2})(?:\/(\d{2,4}))?\b/)
  if (mData?.[1] && mData[2]) {
    const dia = mData[1].padStart(2, '0')
    const mes = mData[2].padStart(2, '0')
    let ano: number
    if (mData[3]) {
      ano = mData[3].length === 2 ? 2000 + Number(mData[3]) : Number(mData[3])
    } else {
      // Sem ano no texto: assume o ano corrente, mas se isso jogaria a compra
      // mais de um mês no futuro, ela é do ano passado (SMS de dezembro
      // lido em janeiro).
      const agora = new Date()
      ano = agora.getFullYear()
      const candidata = new Date(`${ano}-${mes}-${dia}T00:00:00`)
      if (candidata.getTime() - agora.getTime() > 45 * 86400000) ano -= 1
    }
    vencimento = `${ano}-${mes}-${dia}`
  }

  const min = t.toLowerCase()
  let tp: FormaPagamento = 'Cartão'
  if (min.includes('pix')) tp = 'PIX'
  else if (min.includes('debito') || min.includes('débito')) tp = 'Débito em Conta'
  else if (min.includes('boleto')) tp = 'Boleto'
  else if (min.includes('dinheiro')) tp = 'Dinheiro'

  // "final 1644 - APPLECOMBILL valor RS 26,80"
  let nome = 'Compra cartão'
  const mNome =
    t.match(/final\s+\d+\s*-\s*([A-Za-zÀ-ÿ0-9 &.\-/]+?)\s+(?:valor|R[S$])/i) ??
    t.match(/-\s*([A-Za-zÀ-ÿ0-9 &.\-/]+?)\s+(?:valor|R[S$])/i)
  if (mNome?.[1]) {
    const bruto = mNome[1].trim()
    // NOMES EM CAIXA ALTA viram Capitalizados; o resto fica como veio
    nome =
      bruto === bruto.toUpperCase()
        ? bruto
            .split(/\s+/)
            .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
            .join(' ')
        : bruto
  }

  return { nome, valor, vencimento, data_pgto: vencimento, tp, tl: 'despesa' }
}
