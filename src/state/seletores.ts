import { diasAte } from '@/lib/formato'
import type { EstadoApp, Lancamento, StatusLancamento } from '@/types'

/** Status derivado do lançamento — mesma regra do app original. */
export function statusDe(l: Lancamento, diasAviso = 3): StatusLancamento {
  if (l.pago) return 'pago'
  const d = diasAte(l.vencimento)
  if (d < 0) return 'vencido'
  return d <= diasAviso ? 'alerta' : 'pendente'
}

/** Lançamentos de um mês já filtrados pela conta ativa. */
export function doMes(estado: EstadoApp, mesChave: string): Lancamento[] {
  const todos = estado.lancamentos[mesChave] ?? []
  const conta = estado.config.contaAtiva
  return conta === 'todas' ? todos : todos.filter((l) => l.conta === conta)
}

export interface Totais {
  receitas: number
  despesas: number
  recebido: number
  pago: number
  saldo: number
  /** % das despesas já pagas */
  pctPago: number
}

export function totais(lista: Lancamento[]): Totais {
  let receitas = 0
  let despesas = 0
  let recebido = 0
  let pago = 0

  for (const l of lista) {
    const v = Number(l.valor)
    if (l.tl === 'receita') {
      receitas += v
      if (l.pago) recebido += v
    } else {
      despesas += v
      if (l.pago) pago += v
    }
  }

  return {
    receitas,
    despesas,
    recebido,
    pago,
    saldo: receitas - despesas,
    pctPago: despesas > 0 ? Math.round((pago / despesas) * 100) : 0,
  }
}

/** Meses que têm algum lançamento na conta ativa, ordenados. */
export function mesesComDados(estado: EstadoApp): string[] {
  const conta = estado.config.contaAtiva
  return Object.entries(estado.lancamentos)
    .filter(([, itens]) =>
      conta === 'todas' ? itens.length > 0 : itens.some((l) => l.conta === conta),
    )
    .map(([mes]) => mes)
    .sort()
}

/** Todos os lançamentos de um ano, agrupados por mês (para o resumo anual). */
export function doAno(estado: EstadoApp, ano: number): { mes: string; itens: Lancamento[] }[] {
  const conta = estado.config.contaAtiva
  const saida: { mes: string; itens: Lancamento[] }[] = []
  for (let m = 1; m <= 12; m++) {
    const k = `${ano}-${String(m).padStart(2, '0')}`
    const todos = estado.lancamentos[k] ?? []
    saida.push({
      mes: k,
      itens: conta === 'todas' ? todos : todos.filter((l) => l.conta === conta),
    })
  }
  return saida
}

/** Anos que aparecem nos dados, do mais recente para o mais antigo. */
export function anosDisponiveis(estado: EstadoApp): number[] {
  const anos = new Set<number>()
  for (const mes of Object.keys(estado.lancamentos)) {
    if ((estado.lancamentos[mes] ?? []).length) anos.add(Number(mes.slice(0, 4)))
  }
  if (!anos.size) anos.add(new Date().getFullYear())
  return [...anos].sort((a, b) => b - a)
}

/** Contas a vencer nos próximos `dias` dias, em qualquer mês. */
export function vencendoEm(estado: EstadoApp, dias: number): Lancamento[] {
  const conta = estado.config.contaAtiva
  const saida: Lancamento[] = []
  for (const itens of Object.values(estado.lancamentos)) {
    for (const l of itens) {
      if (l.pago) continue
      if (conta !== 'todas' && l.conta !== conta) continue
      const d = diasAte(l.vencimento)
      if (d >= 0 && d <= dias) saida.push(l)
    }
  }
  return saida.sort((a, b) => a.vencimento.localeCompare(b.vencimento))
}
