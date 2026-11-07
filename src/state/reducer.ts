import {
  estadoVazio,
  type Conta,
  type ConfigApp,
  type EstadoApp,
  type FaturaCartao,
  type Lancamento,
  type ItemPlanejamento,
  type Posicao,
  type Recorrencia,
} from '@/types'
import { materializar, somarMeses } from '@/lib/recorrencia'

export type Acao =
  | { t: 'carregar'; estado: EstadoApp }
  | { t: 'inserir'; mes: string; itens: Lancamento[] }
  | { t: 'atualizar'; mes: string; item: Lancamento }
  | { t: 'remover'; mes: string; id: string }
  /** usado pelo Desfazer: devolve a lista inteira do mês como estava */
  | { t: 'repor-mes'; mes: string; itens: Lancamento[] }
  | { t: 'alternar-pago'; mes: string; id: string; hoje: string }
  | { t: 'cat-despesa'; cats: string[] }
  | { t: 'cat-receita'; cats: string[] }
  | { t: 'contas'; contas: Conta[] }
  | { t: 'recorrencia-salvar'; item: Recorrencia }
  | { t: 'recorrencia-remover'; id: string; apagarFuturos: boolean; aPartirDe: string }
  | { t: 'materializar'; ateMes: string }
  | { t: 'carteira'; posicoes: Posicao[] }
  | { t: 'fatura-salvar'; fatura: FaturaCartao }
  | { t: 'faturas-importar'; faturas: FaturaCartao[] }
  | { t: 'fatura-remover'; id: string }
  | { t: 'fatura-categoria'; faturaId: string; gastoId: string; categoria: string }
  | { t: 'planejamento-ajuste'; chave: string; valor: number | null }
  | { t: 'planejamento-item'; item: ItemPlanejamento }
  | { t: 'planejamento-importar'; itens: ItemPlanejamento[] }
  | { t: 'planejamento-remover'; id: string }
  | { t: 'planejamento-nome'; id: string; nome: string }
  | { t: 'planejamento-ocultar'; id: string; ocultar: boolean }
  | { t: 'planejamento-inicio'; inicio: string }
  | { t: 'planejamento-bases'; bases: EstadoApp['planejamento']['bases'] }
  | { t: 'cartao-real-salvar'; item: EstadoApp['planejamento']['realCartao'][number] }
  | { t: 'cartao-real-remover'; id: string }
  | { t: 'config'; patch: Partial<ConfigApp> }
  | { t: 'substituir'; estado: EstadoApp }

/** Marca o estado como alterado. `updatedAt` é a base do last-write-wins. */
function tocar(e: EstadoApp): EstadoApp {
  return { ...e, updatedAt: Date.now() }
}

export function reducer(estado: EstadoApp, acao: Acao): EstadoApp {
  switch (acao.t) {
    case 'carregar':
      return acao.estado

    case 'substituir':
      return tocar(acao.estado)

    case 'inserir': {
      const atual = estado.lancamentos[acao.mes] ?? []
      return tocar({
        ...estado,
        lancamentos: { ...estado.lancamentos, [acao.mes]: [...atual, ...acao.itens] },
      })
    }

    case 'atualizar': {
      const atual = estado.lancamentos[acao.mes] ?? []
      return tocar({
        ...estado,
        lancamentos: {
          ...estado.lancamentos,
          [acao.mes]: atual.map((l) =>
            l.id === acao.item.id ? { ...acao.item, updatedAt: Date.now() } : l,
          ),
        },
      })
    }

    case 'remover': {
      const atual = estado.lancamentos[acao.mes] ?? []
      return tocar({
        ...estado,
        lancamentos: { ...estado.lancamentos, [acao.mes]: atual.filter((l) => l.id !== acao.id) },
      })
    }

    case 'repor-mes':
      return tocar({
        ...estado,
        lancamentos: { ...estado.lancamentos, [acao.mes]: acao.itens },
      })

    case 'alternar-pago': {
      const atual = estado.lancamentos[acao.mes] ?? []
      return tocar({
        ...estado,
        lancamentos: {
          ...estado.lancamentos,
          [acao.mes]: atual.map((l) => {
            if (l.id !== acao.id) return l
            const pago = !l.pago
            return {
              ...l,
              pago,
              // ao marcar, preserva a data já informada; ao desmarcar, limpa
              data_pgto: pago ? (l.data_pgto ?? acao.hoje) : null,
              updatedAt: Date.now(),
            }
          }),
        },
      })
    }

    case 'cat-despesa':
      return tocar({ ...estado, catDespesa: acao.cats })

    case 'cat-receita':
      return tocar({ ...estado, catReceita: acao.cats })

    case 'contas': {
      // Se a conta ativa foi removida, cai para "todas" em vez de sumir tudo.
      const aindaExiste = acao.contas.some((c) => c.id === estado.config.contaAtiva)
      return tocar({
        ...estado,
        contas: acao.contas,
        config: {
          ...estado.config,
          contaAtiva: aindaExiste ? estado.config.contaAtiva : 'todas',
        },
      })
    }

    case 'recorrencia-salvar': {
      const existe = estado.recorrencias.some((r) => r.id === acao.item.id)
      return tocar({
        ...estado,
        recorrencias: existe
          ? estado.recorrencias.map((r) => (r.id === acao.item.id ? acao.item : r))
          : [...estado.recorrencias, acao.item],
      })
    }

    case 'recorrencia-remover': {
      const recorrencias = estado.recorrencias.filter((r) => r.id !== acao.id)
      if (!acao.apagarFuturos) return tocar({ ...estado, recorrencias })

      // Remove as ocorrências ainda não pagas de `aPartirDe` em diante.
      // O que já foi pago permanece: é histórico financeiro real.
      const lancamentos: Record<string, Lancamento[]> = {}
      for (const [mes, itens] of Object.entries(estado.lancamentos)) {
        lancamentos[mes] =
          mes >= acao.aPartirDe
            ? itens.filter((l) => l.recorrenciaId !== acao.id || l.pago)
            : itens
      }
      return tocar({ ...estado, recorrencias, lancamentos })
    }

    case 'materializar': {
      // Teto de 24 meses à frente: navegar longe demais não pode encher o
      // storage de lançamentos que o usuário nunca pediu.
      const hoje = new Date()
      const limite = somarMeses(
        `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`,
        24,
      )
      const ateMes = acao.ateMes > limite ? limite : acao.ateMes

      const { lancamentos, criados } = materializar(
        estado.lancamentos,
        estado.recorrencias,
        ateMes,
      )
      if (!criados) return estado
      return tocar({
        ...estado,
        lancamentos,
        config: { ...estado.config, ultimaGeracaoRec: ateMes },
      })
    }

    case 'carteira':
      return tocar({ ...estado, carteira: acao.posicoes })

    case 'fatura-salvar':
      return tocar({ ...estado, faturasCartao: [...estado.faturasCartao.filter((f) => f.id !== acao.fatura.id), acao.fatura] })

    case 'faturas-importar': {
      const novas = acao.faturas.filter((f) => !estado.faturasCartao.some((atual) =>
        (f.arquivoHash && atual.arquivoHash === f.arquivoHash) ||
        (atual.mes === f.mes && atual.cartao.toLowerCase() === f.cartao.toLowerCase())))
      return novas.length ? tocar({ ...estado, faturasCartao: [...estado.faturasCartao, ...novas] }) : estado
    }

    case 'fatura-remover':
      return tocar({ ...estado, faturasCartao: estado.faturasCartao.filter((f) => f.id !== acao.id) })

    case 'fatura-categoria':
      return tocar({ ...estado, faturasCartao: estado.faturasCartao.map((f) => f.id === acao.faturaId ? { ...f, gastos: f.gastos.map((g) => g.id === acao.gastoId ? { ...g, categoria: acao.categoria } : g) } : f) })

    case 'planejamento-ajuste': {
      const ajustes = { ...estado.planejamento.ajustes }
      if (acao.valor === null && !(acao.chave in ajustes)) return estado
      if (acao.valor !== null && ajustes[acao.chave] === acao.valor) return estado
      if (acao.valor === null) delete ajustes[acao.chave]
      else ajustes[acao.chave] = acao.valor
      return tocar({ ...estado, planejamento: { ...estado.planejamento, ajustes, revisao: estado.planejamento.revisao + 1 } })
    }

    case 'planejamento-item':
      return tocar({ ...estado, planejamento: { ...estado.planejamento, itens: [...estado.planejamento.itens.filter((i) => i.id !== acao.item.id), acao.item], revisao: estado.planejamento.revisao + 1 } })

    case 'planejamento-importar': {
      const existentes = new Set(estado.planejamento.itens.map((i) => i.id))
      const novos = acao.itens.filter((i) => !existentes.has(i.id) && !estado.planejamento.itens.some((atual) => atual.mes === i.mes && atual.nome === i.nome && atual.valor === i.valor && atual.conta === i.conta && atual.tl === i.tl))
      return novos.length ? tocar({ ...estado, planejamento: { ...estado.planejamento, itens: [...estado.planejamento.itens, ...novos], revisao: estado.planejamento.revisao + 1 } }) : estado
    }

    case 'planejamento-remover':
      return tocar({ ...estado, planejamento: { ...estado.planejamento, itens: estado.planejamento.itens.filter((i) => i.id !== acao.id), revisao: estado.planejamento.revisao + 1 } })

    case 'planejamento-nome': {
      const nomes = { ...estado.planejamento.nomes }
      const nome = acao.nome.trim()
      if (nome) nomes[acao.id] = nome
      else delete nomes[acao.id]
      return tocar({ ...estado, planejamento: { ...estado.planejamento, nomes } })
    }

    case 'planejamento-ocultar': {
      const ocultos = acao.ocultar
        ? [...new Set([...estado.planejamento.ocultos, acao.id])]
        : estado.planejamento.ocultos.filter((id) => id !== acao.id)
      return tocar({ ...estado, planejamento: { ...estado.planejamento, ocultos, revisao: estado.planejamento.revisao + 1 } })
    }

    case 'planejamento-inicio':
      return tocar({ ...estado, planejamento: { ...estado.planejamento, inicio: acao.inicio } })

    case 'planejamento-bases':
      return tocar({ ...estado, planejamento: { ...estado.planejamento, bases: { ...estado.planejamento.bases, ...acao.bases } } })

    case 'cartao-real-salvar':
      return tocar({ ...estado, planejamento: { ...estado.planejamento, realCartao: [...estado.planejamento.realCartao.filter((i) => i.id !== acao.item.id && (!acao.item.planoId || i.planoId !== acao.item.planoId)), acao.item] } })

    case 'cartao-real-remover':
      return tocar({ ...estado, planejamento: { ...estado.planejamento, realCartao: estado.planejamento.realCartao.filter((i) => i.id !== acao.id) } })

    case 'config':
      return tocar({ ...estado, config: { ...estado.config, ...acao.patch } })

    default:
      return estado
  }
}

export const estadoInicial = estadoVazio()
