import { useCallback, useEffect, useMemo, useState } from 'react'
import { ProvedorLoja, useLoja } from '@/state/store'
import { TelaPin } from '@/features/pin/TelaPin'
import { PrimeiraAbertura } from '@/features/primeira-abertura/PrimeiraAbertura'
import { PainelManha } from '@/features/agente/PainelManha'
import { Carteira } from '@/features/carteira/Carteira'
import { Botao, Confirmar, Toast, cx, type DadosToast } from '@/components/ui'
import { IndicadorGravacao } from '@/components/IndicadorGravacao'
import { AvisoAtualizacao, BotaoAtualizar } from '@/components/BotaoAtualizar'
import { SeletorConta } from '@/features/contas/SeletorConta'
import { Resumo } from '@/features/resumo/Resumo'
import { ListaLancamentos } from '@/features/lancamentos/ListaLancamentos'
import { FluxoCaixa } from '@/features/fluxo/FluxoCaixa'
import { Analise } from '@/features/analise/Analise'
import { ResumoAnual } from '@/features/anual/ResumoAnual'
import { TelaRecorrencias } from '@/features/recorrencia/TelaRecorrencias'
import { ColarSMS } from '@/features/sms/ColarSMS'
import { Ajustes } from '@/features/ajustes/Ajustes'
import {
  FormLancamento,
  rascunhoDe,
  rascunhoNovo,
  type RascunhoLancamento,
} from '@/features/lancamentos/FormLancamento'
import { antMes, chave, hoje, labelMes, MESES_CURTOS, proxMes } from '@/lib/formato'
import { doMes } from '@/state/seletores'
import { usarNotificacoes } from '@/features/notificacoes/usarNotificacoes'
import type { EstadoApp, Lancamento, Recorrencia } from '@/types'

export type Aba =
  | 'hoje'
  | 'resumo'
  | 'receitas'
  | 'despesas'
  | 'fluxo'
  | 'analise'
  | 'anual'
  | 'fixos'
  | 'carteira'
  | 'sms'

const ABAS: { k: Aba; l: string }[] = [
  { k: 'hoje', l: '☀️ Hoje' },
  { k: 'resumo', l: 'Resumo' },
  { k: 'receitas', l: 'Receitas' },
  { k: 'despesas', l: 'Despesas' },
  { k: 'fluxo', l: '📊 Fluxo' },
  { k: 'analise', l: '🥧 Análise' },
  { k: 'anual', l: '📅 Anual' },
  { k: 'fixos', l: '🔁 Fixos' },
  { k: 'carteira', l: '💼 Carteira' },
  { k: 'sms', l: '📋 SMS' },
]

/** Abas em que o botão "+ Novo" não faz sentido. */
const SEM_NOVO: Aba[] = ['hoje', 'fluxo', 'analise', 'anual', 'fixos', 'carteira', 'sms']

export default function App() {
  return (
    <ProvedorLoja>
      <Raiz />
    </ProvedorLoja>
  )
}

function Raiz() {
  const { carregando, precisaEscolher } = useLoja()
  const [desbloqueado, setDesbloqueado] = useState(false)

  if (!desbloqueado) return <TelaPin aoDesbloquear={() => setDesbloqueado(true)} />

  if (!carregando && precisaEscolher) return <PrimeiraAbertura />

  if (carregando) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <span className="animate-pulse text-[13px] font-semibold text-tinta-3">
          Carregando seus dados…
        </span>
      </div>
    )
  }

  return <Shell aoSair={() => setDesbloqueado(false)} />
}

/** [ano, mes0] em que o app deve abrir. */
function mesDeAbertura(estado: EstadoApp, agora: Date): [number, number] {
  const atual = chave(agora.getFullYear(), agora.getMonth())
  if ((estado.lancamentos[atual]?.length ?? 0) > 0) {
    return [agora.getFullYear(), agora.getMonth()]
  }
  const comDados = Object.entries(estado.lancamentos)
    .filter(([, itens]) => itens.length > 0)
    .map(([m]) => m)
    .sort()
  const alvo = comDados[comDados.length - 1]
  if (!alvo) return [agora.getFullYear(), agora.getMonth()]
  return [Number(alvo.slice(0, 4)), Number(alvo.slice(5)) - 1]
}

function Shell({ aoSair }: { aoSair: () => void }) {
  const { estado, dispatch, gravacao, origem, migrados, salvarAgora } = useLoja()

  const agora = useMemo(() => new Date(), [])
  // Abre no mês corrente; se ele estiver vazio, cai no mês mais recente que
  // tenha lançamentos — abrir numa tela vazia com os dados em outro mês é
  // desorientador (o app antigo contornava isso fixando abril no código).
  const [inicial] = useState(() => mesDeAbertura(estado, agora))
  const [ano, setAno] = useState(inicial[0])
  const [mes, setMes] = useState(inicial[1])
  const [aba, setAba] = useState<Aba>('hoje')
  const [filtro, setFiltro] = useState('todos')
  const [busca, setBusca] = useState('')
  const [toast, setToast] = useState<DadosToast | null>(null)
  const [ajustesAberto, setAjustesAberto] = useState(false)
  const [formAberto, setFormAberto] = useState(false)
  const [editando, setEditando] = useState<Lancamento | null>(null)
  const [rascunho, setRascunho] = useState<RascunhoLancamento>(() =>
    rascunhoNovo(chave(agora.getFullYear(), agora.getMonth()), 'pf', 'Outros'),
  )
  const [confirmarExclusao, setConfirmarExclusao] = useState<Lancamento | null>(null)
  // Incrementado pelo botão 🔄: remonta o painel e refaz a busca das cotações.
  const [recarga, setRecarga] = useState(0)

  const k = chave(ano, mes)
  const lista = useMemo(() => doMes(estado, k), [estado, k])

  const mostrarToast = useCallback((msg: string, acao?: DadosToast['acao']) => {
    setToast({ msg, ...(acao ? { acao } : {}) })
  }, [])

  // Some sozinho depois de 6s — o mesmo tempo do "Desfazer" original.
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 6000)
    return () => clearTimeout(t)
  }, [toast])

  // Avisa quando a migração do fin-v4 aconteceu, para o usuário confirmar
  // que os dados antigos vieram junto.
  useEffect(() => {
    if (origem === 'migrado-v4' && migrados > 0) {
      mostrarToast(`${migrados} lançamentos migrados do app anterior`)
    }
  }, [origem, migrados, mostrarToast])

  // Limpa a busca ao trocar de contexto (comportamento do app original).
  useEffect(() => {
    setBusca('')
  }, [aba, ano, mes])

  // Materializa recorrências ao navegar para um mês futuro. Idempotente.
  useEffect(() => {
    dispatch({ t: 'materializar', ateMes: k })
  }, [k, dispatch])

  usarNotificacoes(estado)

  const contaAtiva = estado.config.contaAtiva
  const contaPadrao = contaAtiva === 'todas' ? (estado.contas[0]?.id ?? 'pf') : contaAtiva

  // ── ações sobre lançamentos ──────────────────────────────────────

  function abrirNovo() {
    setEditando(null)
    setRascunho(rascunhoNovo(k, contaPadrao, estado.catDespesa[0] ?? 'Outros'))
    setFormAberto(true)
  }

  function abrirEdicao(l: Lancamento) {
    setEditando(l)
    setRascunho(rascunhoDe(l))
    setFormAberto(true)
  }

  function salvarLancamento(l: Lancamento, rec: Recorrencia | null) {
    // O mês de destino segue o vencimento apenas em lançamentos novos; ao
    // editar, o item continua no bucket em que já estava (uma compra de
    // cartão pode vencer em maio e pertencer à fatura de abril).
    const destino = editando ? k : l.vencimento.slice(0, 7)

    if (editando) {
      dispatch({ t: 'atualizar', mes: destino, item: l })
    } else {
      dispatch({ t: 'inserir', mes: destino, itens: [l] })
      if (rec) dispatch({ t: 'recorrencia-salvar', item: rec })
    }

    setFormAberto(false)
    setEditando(null)
    if (!editando && destino !== k) {
      mostrarToast(`Lançado em ${labelMes(Number(destino.slice(0, 4)), Number(destino.slice(5)) - 1)}`)
    }
  }

  function excluir(l: Lancamento) {
    const anterior = estado.lancamentos[k] ?? []
    dispatch({ t: 'remover', mes: k, id: l.id })
    setConfirmarExclusao(null)
    mostrarToast(`"${l.nome}" excluído`, {
      rotulo: 'Desfazer',
      fn: () => dispatch({ t: 'repor-mes', mes: k, itens: anterior }),
    })
  }

  function irMes(dir: -1 | 1) {
    const [a, m] = dir === 1 ? proxMes(ano, mes) : antMes(ano, mes)
    setAno(a)
    setMes(m)
    setFiltro('todos')
  }

  // Meses do ano corrente que têm algum lançamento (bolinha no mini-calendário).
  const mesesComDados = useMemo(() => {
    const s = new Set<number>()
    for (let m = 0; m < 12; m++) {
      if (doMes(estado, chave(ano, m)).length) s.add(m)
    }
    return s
  }, [estado, ano])

  return (
    <div className="min-h-[100dvh]">
      <header className="pad-topo sticky top-0 z-30 bg-fundo/95 px-4 pb-2 pt-3 backdrop-blur">
        <div className="mx-auto max-w-xl">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-[17px] font-bold text-tinta">💰 Finanças</h1>
            <div className="flex items-center gap-2.5">
              <IndicadorGravacao estado={gravacao} aoTentarNovamente={() => void salvarAgora()} />
              <BotaoAtualizar
                aoAvisar={mostrarToast}
                aoAtualizarDados={() => setRecarga((n) => n + 1)}
              />
              <button
                type="button"
                onClick={() => setAjustesAberto(true)}
                aria-label="Ajustes"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-superficie text-[13px] shadow-neu-xs"
              >
                ⚙️
              </button>
              <button
                type="button"
                onClick={() => {
                  void salvarAgora()
                  aoSair()
                }}
                aria-label="Bloquear app"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-superficie text-[13px] shadow-neu-xs"
              >
                🔒
              </button>
            </div>
          </div>

          <SeletorConta
            contas={estado.contas}
            ativa={contaAtiva}
            aoTrocar={(id) => dispatch({ t: 'config', patch: { contaAtiva: id } })}
          />

          {/* navegação de mês */}
          <div className="mt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => irMes(-1)}
              aria-label="Mês anterior"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-superficie text-tinta-2 shadow-neu-xs"
            >
              ‹
            </button>
            <span className="text-[14px] font-bold text-tinta">{labelMes(ano, mes)}</span>
            <button
              type="button"
              onClick={() => irMes(1)}
              aria-label="Próximo mês"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-superficie text-tinta-2 shadow-neu-xs"
            >
              ›
            </button>
          </div>

          {/* mini-calendário do ano */}
          <div className="mt-2 flex gap-1 overflow-x-auto pb-1">
            {MESES_CURTOS.map((rotulo, i) => (
              <button
                key={rotulo}
                type="button"
                onClick={() => setMes(i)}
                className={cx(
                  'relative shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition-colors',
                  i === mes ? 'bg-accent text-superficie shadow-neu-xs' : 'text-tinta-2',
                )}
              >
                {rotulo}
                {mesesComDados.has(i) && i !== mes ? (
                  <span className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-info" />
                ) : null}
              </button>
            ))}
          </div>

          {/* abas */}
          <div className="mt-1.5 flex items-center gap-0.5 overflow-x-auto">
            {ABAS.map((a) => (
              <button
                key={a.k}
                type="button"
                onClick={() => setAba(a.k)}
                className={cx(
                  'shrink-0 whitespace-nowrap rounded-t-md border-b-2 px-2.5 py-2 text-[12px] font-bold transition-colors',
                  aba === a.k
                    ? 'border-accent text-accent'
                    : 'border-transparent text-tinta-2',
                )}
              >
                {a.l}
              </button>
            ))}
            <div className="flex-1" />
            {!SEM_NOVO.includes(aba) ? (
              <Botao
                variante="primario"
                onClick={abrirNovo}
                className="shrink-0 !rounded-b-none !px-3 !py-1.5 !text-[12px]"
              >
                + Novo
              </Botao>
            ) : null}
          </div>

          <AvisoAtualizacao />
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 pb-24 pt-3">
        {aba === 'hoje' ? <PainelManha key={recarga} /> : null}

        {aba === 'resumo' ? (
          <Resumo
            lista={lista}
            ano={ano}
            mes={mes}
            estado={estado}
            aoIrParaAba={setAba}
            aoCopiarMes={(itens, destino, qtd) => {
              dispatch({ t: 'inserir', mes: destino, itens })
              mostrarToast(
                `${qtd} ${qtd === 1 ? 'item copiado' : 'itens copiados'} para ${labelMes(
                  Number(destino.slice(0, 4)),
                  Number(destino.slice(5)) - 1,
                )}`,
              )
            }}
          />
        ) : null}

        {aba === 'receitas' || aba === 'despesas' ? (
          <ListaLancamentos
            lista={lista.filter((l) => (aba === 'receitas' ? l.tl === 'receita' : l.tl === 'despesa'))}
            tipo={aba === 'receitas' ? 'receita' : 'despesa'}
            contas={estado.contas}
            mostrarConta={contaAtiva === 'todas' && estado.contas.length > 1}
            filtro={filtro}
            setFiltro={setFiltro}
            busca={busca}
            setBusca={setBusca}
            aoAlternarPago={(id) => dispatch({ t: 'alternar-pago', mes: k, id, hoje: hoje() })}
            aoEditar={abrirEdicao}
            aoExcluir={(id) => {
              const l = lista.find((x) => x.id === id)
              if (l) setConfirmarExclusao(l)
            }}
          />
        ) : null}

        {aba === 'fluxo' ? <FluxoCaixa lista={lista} /> : null}

        {aba === 'analise' ? (
          <Analise
            despesas={lista.filter((l) => l.tl === 'despesa')}
            catDespesa={estado.catDespesa}
            aoMudarCategorias={(cats) => dispatch({ t: 'cat-despesa', cats })}
          />
        ) : null}

        {aba === 'anual' ? <ResumoAnual estado={estado} anoInicial={ano} /> : null}

        {aba === 'fixos' ? (
          <TelaRecorrencias
            estado={estado}
            mesAtual={k}
            aoSalvar={(r) => dispatch({ t: 'recorrencia-salvar', item: r })}
            aoRemover={(id, apagarFuturos) =>
              dispatch({ t: 'recorrencia-remover', id, apagarFuturos, aPartirDe: k })
            }
            aoAvisar={mostrarToast}
          />
        ) : null}

        {aba === 'carteira' ? <Carteira /> : null}

        {aba === 'sms' ? (
          <ColarSMS
            catDespesa={estado.catDespesa}
            contaPadrao={contaPadrao}
            aoAdicionar={(l) => {
              dispatch({ t: 'inserir', mes: l.vencimento.slice(0, 7), itens: [l] })
              mostrarToast(`"${l.nome}" adicionado`)
            }}
          />
        ) : null}
      </main>

      <FormLancamento
        aberto={formAberto}
        editando={editando}
        rascunho={rascunho}
        setRascunho={setRascunho}
        contas={estado.contas}
        catReceita={estado.catReceita}
        catDespesa={estado.catDespesa}
        aoFechar={() => {
          setFormAberto(false)
          setEditando(null)
        }}
        aoSalvar={salvarLancamento}
      />

      <Ajustes
        aberto={ajustesAberto}
        aoFechar={() => setAjustesAberto(false)}
        aoAvisar={mostrarToast}
      />

      <Confirmar
        aberto={confirmarExclusao !== null}
        titulo="Excluir lançamento?"
        descricao={confirmarExclusao ? `"${confirmarExclusao.nome}" será removido.` : undefined}
        rotuloOk="Excluir"
        perigo
        aoConfirmar={() => confirmarExclusao && excluir(confirmarExclusao)}
        aoCancelar={() => setConfirmarExclusao(null)}
      />

      <Toast dados={toast} aoFechar={() => setToast(null)} />
    </div>
  )
}
