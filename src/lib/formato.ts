/** Helpers de data, moeda e status. Portados do index.html original. */

export const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
] as const

export const MESES_CURTOS = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
] as const

/** Data local de hoje em YYYY-MM-DD.
 *  Não usar toISOString(): ele converte para UTC e, em Manaus (UTC-4),
 *  o dia "vira" às 20h — lançamentos entrariam no dia seguinte. */
export function hoje(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

/** Chave de mês no formato "YYYY-MM" (mes é 0-indexado). */
export const chave = (ano: number, mes: number): string =>
  `${ano}-${String(mes + 1).padStart(2, '0')}`

export const labelMes = (ano: number, mes: number): string => `${MESES[mes]} ${ano}`

export const proxMes = (ano: number, mes: number): [number, number] =>
  mes === 11 ? [ano + 1, 0] : [ano, mes + 1]

export const antMes = (ano: number, mes: number): [number, number] =>
  mes === 0 ? [ano - 1, 11] : [ano, mes - 1]

/** Avança uma data YYYY-MM-DD em N meses, grudando no último dia
 *  quando o mês de destino é mais curto (31/jan + 1 mês = 28/fev). */
export function avancarData(iso: string, meses: number): string {
  const d = new Date(`${iso}T00:00:00`)
  const alvo = d.getMonth() + meses
  const ano = d.getFullYear() + Math.floor(alvo / 12)
  const mes = ((alvo % 12) + 12) % 12
  const ultimoDia = new Date(ano, mes + 1, 0).getDate()
  const dia = Math.min(d.getDate(), ultimoDia)
  return `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

/** Dias até o vencimento. Negativo = vencido. */
export function diasAte(iso: string): number {
  const h = new Date()
  h.setHours(0, 0, 0, 0)
  return Math.ceil((new Date(`${iso}T00:00:00`).getTime() - h.getTime()) / 86400000)
}

export const fmtR = (v: number): string =>
  Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** Sem centavos — usado no fluxo de caixa para caber na tela. */
export const fmtRs = (v: number): string =>
  Number(v).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  })

/** Compacto para eixos de gráfico: 21.6k */
export function fmtCompacto(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.', ',')}M`
  if (abs >= 1_000) return `${Math.round(v / 1000)}k`
  return String(Math.round(v))
}

export const fmtD = (iso: string): string =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('pt-BR')

/** "05/04" — usado nas listas onde o ano é redundante. */
export const fmtDCurta = (iso: string): string => {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}
