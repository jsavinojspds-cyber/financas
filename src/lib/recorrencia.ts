import { FREQUENCIAS, type Lancamento, type Recorrencia } from '@/types'
import { novoId } from './id'

/** Número de meses entre duas chaves "YYYY-MM". */
export function distanciaMeses(de: string, ate: string): number {
  const [a1, m1] = de.split('-').map(Number)
  const [a2, m2] = ate.split('-').map(Number)
  return (a2 - a1) * 12 + (m2 - m1)
}

/** Soma meses a uma chave "YYYY-MM". */
export function somarMeses(mes: string, n: number): string {
  const [a, m] = mes.split('-').map(Number)
  const total = (a as number) * 12 + ((m as number) - 1) + n
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

/** Vencimento da recorrência dentro de um mês, grudando no último dia
 *  quando o dia escolhido não existe (dia 31 em fevereiro → 28/29). */
export function vencimentoNoMes(mes: string, dia: number): string {
  const [ano, m] = mes.split('-').map(Number)
  const ultimo = new Date(ano as number, m as number, 0).getDate()
  const d = Math.min(Math.max(1, dia), ultimo)
  return `${mes}-${String(d).padStart(2, '0')}`
}

/** A recorrência tem ocorrência neste mês? */
export function ocorreEm(r: Recorrencia, mes: string): boolean {
  if (!r.ativa) return false
  const delta = distanciaMeses(r.inicio, mes)
  if (delta < 0) return false
  if (r.fim && distanciaMeses(mes, r.fim) < 0) return false
  return delta % FREQUENCIAS[r.frequencia].meses === 0
}

/**
 * Materializa as recorrências em lançamentos concretos, de `inicio` até `ateMes`.
 *
 * É idempotente: um lançamento só é criado se ainda não existe outro com o
 * mesmo `recorrenciaId` naquele mês. Assim pode rodar a cada abertura do app
 * sem duplicar nada, e o usuário pode editar ou apagar uma ocorrência sem que
 * ela volte — apagou, não volta, porque a checagem é por mês.
 */
export function materializar(
  lancamentos: Record<string, Lancamento[]>,
  recorrencias: Recorrencia[],
  ateMes: string,
): { lancamentos: Record<string, Lancamento[]>; criados: number } {
  const ativas = recorrencias.filter((r) => r.ativa)
  if (!ativas.length) return { lancamentos, criados: 0 }

  let saida = lancamentos
  let criados = 0
  const agora = Date.now()

  const clonar = () => {
    if (saida === lancamentos) saida = { ...lancamentos }
    return saida
  }

  for (const r of ativas) {
    const total = distanciaMeses(r.inicio, ateMes)
    if (total < 0) continue

    for (let i = 0; i <= total; i += FREQUENCIAS[r.frequencia].meses) {
      const mes = somarMeses(r.inicio, i)
      if (r.fim && distanciaMeses(mes, r.fim) < 0) break

      const doMes = saida[mes] ?? []
      if (doMes.some((l) => l.recorrenciaId === r.id)) continue

      const novo: Lancamento = {
        id: novoId(),
        tl: r.tl,
        nome: r.nome,
        valor: r.valor,
        vencimento: vencimentoNoMes(mes, r.dia),
        tp: r.tp,
        cat: r.cat,
        pago: false,
        data_pgto: null,
        conta: r.conta,
        recorrenciaId: r.id,
        updatedAt: agora,
      }
      clonar()[mes] = [...doMes, novo]
      criados++
    }
  }

  return { lancamentos: saida, criados }
}
