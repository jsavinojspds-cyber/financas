import { chave, diasAte, fmtD, fmtR, hoje, MESES } from '@/lib/formato'
import { doMes, statusDe, totais } from '@/state/seletores'
import { somarMeses } from '@/lib/recorrencia'
import type { EstadoApp, Lancamento } from '@/types'

export type NivelInsight = 'critico' | 'atencao' | 'bom' | 'info'

export interface Insight {
  id: string
  nivel: NivelInsight
  icone: string
  titulo: string
  detalhe?: string
}

/** Quanto uma categoria precisa subir sobre a média para virar alerta. */
const LIMIAR_ALTA = 25

/**
 * Analisa os lançamentos e devolve os avisos do dia.
 *
 * Tudo é calculado no aparelho, a partir do que já está no storage: nenhum
 * dado financeiro sai daqui, funciona offline e não custa nada por consulta.
 * É também o motivo de não haver texto de IA nesta parte — para um modelo
 * escrever sobre estes números, eles teriam que ser enviados para um servidor.
 */
export function gerarInsights(estado: EstadoApp, agora = new Date()): Insight[] {
  const mesAtual = chave(agora.getFullYear(), agora.getMonth())
  const lista = doMes(estado, mesAtual)
  const insights: Insight[] = []
  const hojeStr = hoje()

  if (!lista.length) {
    return [
      {
        id: 'sem-dados',
        nivel: 'info',
        icone: '📭',
        titulo: `Nenhum lançamento em ${MESES[agora.getMonth()]}`,
        detalhe: 'Adicione lançamentos para o resumo do dia aparecer aqui.',
      },
    ]
  }

  const t = totais(lista)

  // ── vence hoje ────────────────────────────────────────────────────
  const hojeVence = lista.filter((l) => !l.pago && l.vencimento === hojeStr)
  if (hojeVence.length) {
    const soma = hojeVence.reduce((s, l) => s + l.valor, 0)
    insights.push({
      id: 'vence-hoje',
      nivel: 'critico',
      icone: '📌',
      titulo: `${hojeVence.length} ${hojeVence.length === 1 ? 'conta vence' : 'contas vencem'} hoje · ${fmtR(soma)}`,
      detalhe: hojeVence
        .slice(0, 3)
        .map((l) => l.nome)
        .join(', '),
    })
  }

  // ── vencidos ──────────────────────────────────────────────────────
  const vencidos = lista.filter((l) => statusDe(l) === 'vencido')
  if (vencidos.length) {
    const soma = vencidos.reduce((s, l) => s + l.valor, 0)
    const maisAntigo = vencidos.reduce((a, b) => (a.vencimento < b.vencimento ? a : b))
    insights.push({
      id: 'vencidos',
      nivel: 'critico',
      icone: '⚠️',
      titulo: `${vencidos.length} em atraso · ${fmtR(soma)}`,
      detalhe: `O mais antigo venceu em ${fmtD(maisAntigo.vencimento)} (${Math.abs(
        diasAte(maisAntigo.vencimento),
      )} dias).`,
    })
  }

  // ── próximos dias ─────────────────────────────────────────────────
  const janela = estado.config.diasAviso || 3
  const proximos = lista.filter((l) => {
    if (l.pago) return false
    const d = diasAte(l.vencimento)
    return d > 0 && d <= janela
  })
  if (proximos.length) {
    const soma = proximos.reduce((s, l) => s + l.valor, 0)
    insights.push({
      id: 'proximos',
      nivel: 'atencao',
      icone: '🔔',
      titulo: `${proximos.length} ${proximos.length === 1 ? 'conta vence' : 'contas vencem'} em até ${janela} dias · ${fmtR(soma)}`,
    })
  }

  // ── caixa negativo em algum ponto do mês ──────────────────────────
  const pior = piorMomentoDoCaixa(lista)
  if (pior && pior.saldo < 0) {
    insights.push({
      id: 'caixa-negativo',
      nivel: 'critico',
      icone: '📉',
      titulo: `Caixa fica negativo em ${fmtD(pior.data)}`,
      detalhe: `Pior momento do mês: ${fmtR(pior.saldo)}.`,
    })
  }

  // ── saldo projetado ───────────────────────────────────────────────
  insights.push({
    id: 'saldo',
    nivel: t.saldo >= 0 ? 'bom' : 'critico',
    icone: t.saldo >= 0 ? '💰' : '🔻',
    titulo: `Saldo projetado do mês: ${fmtR(t.saldo)}`,
    detalhe: `${fmtR(t.receitas)} a receber contra ${fmtR(t.despesas)} a pagar.`,
  })

  // ── categoria fora da curva ───────────────────────────────────────
  const alta = categoriaEmAlta(estado, mesAtual)
  if (alta) {
    insights.push({
      id: 'categoria-alta',
      nivel: 'atencao',
      icone: '📈',
      titulo: `${alta.categoria} está ${alta.pct}% acima da média`,
      detalhe: `${fmtR(alta.atual)} neste mês contra ${fmtR(alta.media)} de média nos ${alta.meses} meses anteriores.`,
    })
  }

  // ── maior despesa ─────────────────────────────────────────────────
  const despesas = lista.filter((l) => l.tl === 'despesa')
  if (despesas.length) {
    const maior = despesas.reduce((a, b) => (a.valor > b.valor ? a : b))
    insights.push({
      id: 'maior-despesa',
      nivel: 'info',
      icone: '🎯',
      titulo: `Maior despesa: ${maior.nome} · ${fmtR(maior.valor)}`,
      detalhe: `${maior.cat} · vence ${fmtD(maior.vencimento)}`,
    })
  }

  // ── taxa de poupança ──────────────────────────────────────────────
  if (t.receitas > 0) {
    const taxa = Math.round((t.saldo / t.receitas) * 100)
    insights.push({
      id: 'poupanca',
      nivel: taxa >= 20 ? 'bom' : taxa >= 0 ? 'info' : 'atencao',
      icone: '🏦',
      titulo: `Taxa de poupança: ${taxa}%`,
      detalhe:
        taxa >= 0
          ? `De cada R$ 100 que entram, sobram R$ ${taxa}.`
          : 'As despesas do mês superam as receitas.',
    })
  }

  // ── por conta ─────────────────────────────────────────────────────
  if (estado.config.contaAtiva === 'todas' && estado.contas.length > 1) {
    for (const conta of estado.contas) {
      const daConta = (estado.lancamentos[mesAtual] ?? []).filter((l) => l.conta === conta.id)
      const atrasadas = daConta.filter((l) => statusDe(l) === 'vencido')
      if (atrasadas.length >= 2) {
        insights.push({
          id: `atraso-${conta.id}`,
          nivel: 'atencao',
          icone: conta.icone,
          titulo: `${conta.nome}: ${atrasadas.length} contas em atraso`,
          detalhe: fmtR(atrasadas.reduce((s, l) => s + l.valor, 0)),
        })
      }
    }
  }

  const ordem: Record<NivelInsight, number> = { critico: 0, atencao: 1, bom: 2, info: 3 }
  return insights.sort((a, b) => ordem[a.nivel] - ordem[b.nivel])
}

/** Menor saldo acumulado do mês e quando acontece. */
function piorMomentoDoCaixa(lista: Lancamento[]): { data: string; saldo: number } | null {
  const itens = [...lista].sort((a, b) =>
    (a.data_pgto ?? a.vencimento).localeCompare(b.data_pgto ?? b.vencimento),
  )
  let acum = 0
  let pior: { data: string; saldo: number } | null = null
  for (const l of itens) {
    acum += l.tl === 'receita' ? l.valor : -l.valor
    if (!pior || acum < pior.saldo) pior = { data: l.data_pgto ?? l.vencimento, saldo: acum }
  }
  return pior
}

/** Categoria de despesa que mais subiu sobre a média dos meses anteriores. */
function categoriaEmAlta(
  estado: EstadoApp,
  mesAtual: string,
): { categoria: string; atual: number; media: number; pct: number; meses: number } | null {
  const somaPorCat = (mes: string) => {
    const m = new Map<string, number>()
    for (const l of doMes(estado, mes)) {
      if (l.tl !== 'despesa') continue
      m.set(l.cat, (m.get(l.cat) ?? 0) + l.valor)
    }
    return m
  }

  const atual = somaPorCat(mesAtual)
  if (!atual.size) return null

  // Só considera meses anteriores que realmente têm dados — senão um mês
  // vazio derruba a média e tudo vira "alta".
  const anteriores: Map<string, number>[] = []
  for (let i = 1; i <= 3; i++) {
    const m = somaPorCat(somarMeses(mesAtual, -i))
    if (m.size) anteriores.push(m)
  }
  if (anteriores.length < 2) return null

  let melhor: { categoria: string; atual: number; media: number; pct: number } | null = null
  for (const [cat, valor] of atual) {
    const historico = anteriores.map((m) => m.get(cat) ?? 0)
    const media = historico.reduce((s, v) => s + v, 0) / historico.length
    // Categoria nova (sem histórico) não é "alta", é estreia.
    if (media <= 0) continue
    const pct = Math.round(((valor - media) / media) * 100)
    if (pct >= LIMIAR_ALTA && (!melhor || pct > melhor.pct)) {
      melhor = { categoria: cat, atual: valor, media, pct }
    }
  }

  return melhor ? { ...melhor, meses: anteriores.length } : null
}
