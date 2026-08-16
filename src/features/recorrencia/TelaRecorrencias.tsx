import { useMemo, useState } from 'react'
import { Botao, Campo, Confirmar, Folha, Neu, Rotulo, Selecao, Vazio, cx } from '@/components/ui'
import { fmtR } from '@/lib/formato'
import { novoId } from '@/lib/id'
import { ocorreEm } from '@/lib/recorrencia'
import {
  FORMAS_PAGAMENTO,
  FREQUENCIAS,
  type EstadoApp,
  type FormaPagamento,
  type Frequencia,
  type Recorrencia,
  type TipoLancamento,
} from '@/types'

/** Aba "🔁 Fixos": cadastro e manutenção das séries recorrentes. */
export function TelaRecorrencias({
  estado,
  mesAtual,
  aoSalvar,
  aoRemover,
  aoAvisar,
}: {
  estado: EstadoApp
  mesAtual: string
  aoSalvar: (r: Recorrencia) => void
  aoRemover: (id: string, apagarFuturos: boolean) => void
  aoAvisar: (msg: string) => void
}) {
  const [folha, setFolha] = useState(false)
  const [editando, setEditando] = useState<Recorrencia | null>(null)
  const [removendo, setRemovendo] = useState<Recorrencia | null>(null)
  const [rascunho, setRascunho] = useState<Recorrencia>(() => vazia(mesAtual, estado))

  const lista = useMemo(
    () => [...estado.recorrencias].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [estado.recorrencias],
  )

  const totalMensal = useMemo(() => {
    let receitas = 0
    let despesas = 0
    for (const r of lista) {
      if (!ocorreEm(r, mesAtual)) continue
      if (r.tl === 'receita') receitas += r.valor
      else despesas += r.valor
    }
    return { receitas, despesas }
  }, [lista, mesAtual])

  function abrirNova() {
    setEditando(null)
    setRascunho(vazia(mesAtual, estado))
    setFolha(true)
  }

  function abrirEdicao(r: Recorrencia) {
    setEditando(r)
    setRascunho({ ...r })
    setFolha(true)
  }

  function salvar() {
    const nome = rascunho.nome.trim()
    const valor = Number(String(rascunho.valor).toString().replace(',', '.'))
    if (!nome || !Number.isFinite(valor) || valor <= 0) {
      aoAvisar('Preencha nome e valor')
      return
    }
    aoSalvar({ ...rascunho, nome, valor, updatedAt: Date.now() })
    setFolha(false)
    aoAvisar(
      editando ? 'Lançamento fixo atualizado' : 'Lançamento fixo criado — as próximas ocorrências aparecem sozinhas',
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <Neu className="p-4" sombra="neu-xs">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[13px] font-bold text-tinta">Lançamentos fixos</h3>
            <p className="mt-1 text-[11px] text-tinta-3">
              Criados automaticamente a cada mês. Editar ou apagar uma ocorrência solta não
              afeta a série.
            </p>
          </div>
          <Botao variante="primario" className="shrink-0 !px-3 !py-1.5 !text-[12px]" onClick={abrirNova}>
            + Novo
          </Botao>
        </div>

        {lista.length > 0 ? (
          <div className="mt-3 grid grid-cols-2 gap-2.5 border-t border-borda/60 pt-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-tinta-3">
                Fixos deste mês
              </span>
              <div className="mt-0.5 font-mono text-[14px] font-bold text-receita">
                +{fmtR(totalMensal.receitas)}
              </div>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-tinta-3">
                &nbsp;
              </span>
              <div className="mt-0.5 font-mono text-[14px] font-bold text-despesa">
                −{fmtR(totalMensal.despesas)}
              </div>
            </div>
          </div>
        ) : null}
      </Neu>

      {lista.length === 0 ? (
        <Vazio
          icone="🔁"
          titulo="Nenhum lançamento fixo"
          dica="Cadastre contas que se repetem todo mês"
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {lista.map((r) => {
            const conta = estado.contas.find((c) => c.id === r.conta)
            const ativoNoMes = ocorreEm(r, mesAtual)
            return (
              <Neu key={r.id} className="p-3.5" sombra="neu-xs">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={cx(
                          'truncate text-[14px] font-bold',
                          r.ativa ? 'text-tinta' : 'text-tinta-3 line-through',
                        )}
                      >
                        {r.nome}
                      </span>
                      {ativoNoMes && r.ativa ? (
                        <span className="shrink-0 rounded-full bg-accent/15 px-1.5 py-0.5 text-[9px] font-bold text-accent">
                          este mês
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-tinta-3">
                      <span>{FREQUENCIAS[r.frequencia].label}</span>
                      <span>·</span>
                      <span>dia {r.dia}</span>
                      <span>·</span>
                      <span>{r.cat}</span>
                      {conta ? (
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                          style={{ background: `${conta.cor}1a`, color: conta.cor }}
                        >
                          {conta.icone} {conta.nome}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <span
                    className="shrink-0 font-mono text-[14px] font-bold"
                    style={{ color: r.tl === 'receita' ? '#10b981' : '#ef4444' }}
                  >
                    {r.tl === 'receita' ? '+' : '−'}
                    {fmtR(r.valor)}
                  </span>
                </div>

                <div className="mt-2.5 flex items-center justify-between border-t border-borda/60 pt-2.5">
                  <button
                    type="button"
                    onClick={() => aoSalvar({ ...r, ativa: !r.ativa, updatedAt: Date.now() })}
                    className={cx(
                      'rounded-full px-2.5 py-1 text-[11px] font-bold',
                      r.ativa ? 'bg-receita/15 text-receita' : 'bg-fundo text-tinta-3',
                    )}
                  >
                    {r.ativa ? 'Ativa' : 'Pausada'}
                  </button>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      aria-label={`Editar ${r.nome}`}
                      onClick={() => abrirEdicao(r)}
                      className="px-2 py-1 text-[12px] text-tinta-2"
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      aria-label={`Excluir ${r.nome}`}
                      onClick={() => setRemovendo(r)}
                      className="px-2 py-1 text-[12px] text-tinta-2"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              </Neu>
            )
          })}
        </div>
      )}

      <Folha
        aberta={folha}
        aoFechar={() => setFolha(false)}
        titulo={editando ? 'Editar lançamento fixo' : 'Novo lançamento fixo'}
        rodape={
          <div className="flex gap-2.5">
            <Botao className="flex-1" onClick={() => setFolha(false)}>
              Cancelar
            </Botao>
            <Botao className="flex-[2]" variante="primario" onClick={salvar}>
              Salvar
            </Botao>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2.5">
            {(['receita', 'despesa'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setRascunho({ ...rascunho, tl: t as TipoLancamento })}
                className={cx(
                  'rounded-xl py-3 text-[13px] font-bold',
                  rascunho.tl === t
                    ? 'text-white shadow-neu-xs'
                    : 'bg-superficie text-tinta-2 shadow-neu-in-sm',
                )}
                style={
                  rascunho.tl === t
                    ? { background: t === 'receita' ? '#10b981' : '#ef4444' }
                    : undefined
                }
              >
                {t === 'receita' ? '↑ Receita' : '↓ Despesa'}
              </button>
            ))}
          </div>

          <div>
            <Rotulo>Descrição</Rotulo>
            <Campo
              value={rascunho.nome}
              onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })}
              placeholder="Ex: Plano de saúde"
              autoCapitalize="sentences"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Rotulo>Valor (R$)</Rotulo>
              <Campo
                value={String(rascunho.valor)}
                onChange={(e) =>
                  setRascunho({ ...rascunho, valor: e.target.value as unknown as number })
                }
                inputMode="decimal"
                className="font-mono"
              />
            </div>
            <div>
              <Rotulo>Dia do vencimento</Rotulo>
              <Campo
                type="number"
                min={1}
                max={31}
                value={rascunho.dia}
                onChange={(e) =>
                  setRascunho({ ...rascunho, dia: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })
                }
                className="font-mono"
              />
            </div>
          </div>
          <p className="-mt-2 text-[11px] text-tinta-3">
            Em meses mais curtos o vencimento cai no último dia disponível.
          </p>

          <div>
            <Rotulo>Frequência</Rotulo>
            <Selecao
              value={rascunho.frequencia}
              onChange={(e) =>
                setRascunho({ ...rascunho, frequencia: e.target.value as Frequencia })
              }
            >
              {Object.entries(FREQUENCIAS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </Selecao>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Rotulo>Começa em</Rotulo>
              <Campo
                type="month"
                value={rascunho.inicio}
                onChange={(e) => setRascunho({ ...rascunho, inicio: e.target.value })}
              />
            </div>
            <div>
              <Rotulo>Termina em (opcional)</Rotulo>
              <Campo
                type="month"
                value={rascunho.fim ?? ''}
                onChange={(e) => setRascunho({ ...rascunho, fim: e.target.value || null })}
              />
            </div>
          </div>

          <div>
            <Rotulo>Forma de pagamento</Rotulo>
            <Selecao
              value={rascunho.tp}
              onChange={(e) => setRascunho({ ...rascunho, tp: e.target.value as FormaPagamento })}
            >
              {FORMAS_PAGAMENTO.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Selecao>
          </div>

          <div>
            <Rotulo>Categoria</Rotulo>
            <Selecao
              value={rascunho.cat}
              onChange={(e) => setRascunho({ ...rascunho, cat: e.target.value })}
            >
              {(rascunho.tl === 'receita' ? estado.catReceita : estado.catDespesa).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Selecao>
          </div>

          {estado.contas.length > 1 ? (
            <div>
              <Rotulo>Conta</Rotulo>
              <Selecao
                value={rascunho.conta}
                onChange={(e) => setRascunho({ ...rascunho, conta: e.target.value })}
              >
                {estado.contas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icone} {c.nome}
                  </option>
                ))}
              </Selecao>
            </div>
          ) : null}
        </div>
      </Folha>

      <Confirmar
        aberto={removendo !== null}
        titulo="Excluir lançamento fixo?"
        descricao="As ocorrências futuras ainda não pagas serão removidas. O que já foi pago permanece no histórico."
        rotuloOk="Excluir"
        perigo
        aoConfirmar={() => {
          if (removendo) {
            aoRemover(removendo.id, true)
            aoAvisar(`"${removendo.nome}" removido dos fixos`)
          }
          setRemovendo(null)
        }}
        aoCancelar={() => setRemovendo(null)}
      />
    </div>
  )
}

function vazia(mesAtual: string, estado: EstadoApp): Recorrencia {
  return {
    id: novoId(),
    tl: 'despesa',
    nome: '',
    valor: 0,
    dia: 1,
    tp: 'Dinheiro',
    cat: estado.catDespesa[0] ?? 'Outros',
    conta:
      estado.config.contaAtiva === 'todas'
        ? (estado.contas[0]?.id ?? 'pf')
        : estado.config.contaAtiva,
    frequencia: 'mensal',
    inicio: mesAtual,
    fim: null,
    ativa: true,
    updatedAt: Date.now(),
  }
}
