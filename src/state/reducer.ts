import {
  estadoVazio,
  type Conta,
  type ConfigApp,
  type EstadoApp,
  type Lancamento,
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

    case 'config':
      return tocar({ ...estado, config: { ...estado.config, ...acao.patch } })

    default:
      return estado
  }
}

export const estadoInicial = estadoVazio()
