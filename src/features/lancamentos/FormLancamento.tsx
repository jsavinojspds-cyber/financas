import { useEffect, useState } from 'react'
import { Botao, Campo, Folha, Rotulo, Selecao, cx } from '@/components/ui'
import { novoId } from '@/lib/id'
import {
  FORMAS_PAGAMENTO,
  FREQUENCIAS,
  type Conta,
  type FormaPagamento,
  type Frequencia,
  type Lancamento,
  type Recorrencia,
  type TipoLancamento,
} from '@/types'

export interface RascunhoLancamento {
  tl: TipoLancamento
  nome: string
  valor: string
  vencimento: string
  data_pgto: string
  tp: FormaPagamento
  cat: string
  conta: string
  repetir: boolean
  frequencia: Frequencia
}

export function rascunhoNovo(
  mesChave: string,
  contaPadrao: string,
  catPadrao: string,
): RascunhoLancamento {
  return {
    tl: 'despesa',
    nome: '',
    valor: '',
    vencimento: `${mesChave}-01`,
    data_pgto: '',
    tp: 'Dinheiro',
    cat: catPadrao,
    conta: contaPadrao,
    repetir: false,
    frequencia: 'mensal',
  }
}

export function rascunhoDe(l: Lancamento): RascunhoLancamento {
  return {
    tl: l.tl,
    nome: l.nome,
    valor: String(l.valor),
    vencimento: l.vencimento,
    data_pgto: l.data_pgto ?? '',
    tp: l.tp,
    cat: l.cat,
    conta: l.conta,
    // recorrência é editada na aba Fixos, não aqui, para não confundir
    // "editar esta ocorrência" com "editar a série inteira"
    repetir: false,
    frequencia: 'mensal',
  }
}

export function FormLancamento({
  aberto,
  editando,
  rascunho,
  setRascunho,
  contas,
  catReceita,
  catDespesa,
  aoFechar,
  aoSalvar,
}: {
  aberto: boolean
  editando: Lancamento | null
  rascunho: RascunhoLancamento
  setRascunho: (r: RascunhoLancamento) => void
  contas: Conta[]
  catReceita: string[]
  catDespesa: string[]
  aoFechar: () => void
  aoSalvar: (l: Lancamento, rec: Recorrencia | null) => void
}) {
  const [tentouSalvar, setTentouSalvar] = useState(false)
  useEffect(() => {
    if (aberto) setTentouSalvar(false)
  }, [aberto])

  const cats = rascunho.tl === 'receita' ? catReceita : catDespesa
  const valorNum = Number(String(rascunho.valor).replace(',', '.'))
  const nomeOk = rascunho.nome.trim() !== ''
  const valorOk = Number.isFinite(valorNum) && valorNum > 0
  const dataOk = /^\d{4}-\d{2}-\d{2}$/.test(rascunho.vencimento)
  const valido = nomeOk && valorOk && dataOk

  function trocarTipo(tl: TipoLancamento) {
    const novasCats = tl === 'receita' ? catReceita : catDespesa
    setRascunho({
      ...rascunho,
      tl,
      // a categoria atual pode não existir na outra lista
      cat: novasCats.includes(rascunho.cat) ? rascunho.cat : (novasCats[0] ?? 'Outros'),
    })
  }

  function salvar() {
    setTentouSalvar(true)
    if (!valido) return

    const dataPgto = rascunho.data_pgto || null
    const lancamento: Lancamento = {
      id: editando?.id ?? novoId(),
      tl: rascunho.tl,
      nome: rascunho.nome.trim(),
      valor: valorNum,
      vencimento: rascunho.vencimento,
      tp: rascunho.tp,
      cat: rascunho.cat,
      // informar data de pagamento já marca como pago (regra do app original)
      pago: dataPgto !== null ? true : (editando?.pago ?? false),
      data_pgto: dataPgto,
      conta: rascunho.conta,
      recorrenciaId: editando?.recorrenciaId ?? null,
      updatedAt: Date.now(),
    }

    let recorrencia: Recorrencia | null = null
    if (!editando && rascunho.repetir) {
      recorrencia = {
        id: novoId(),
        tl: lancamento.tl,
        nome: lancamento.nome,
        valor: lancamento.valor,
        dia: Number(rascunho.vencimento.slice(8, 10)),
        tp: lancamento.tp,
        cat: lancamento.cat,
        conta: lancamento.conta,
        frequencia: rascunho.frequencia,
        // a 1ª ocorrência é este próprio lançamento; a série começa no mês seguinte
        inicio: rascunho.vencimento.slice(0, 7),
        fim: null,
        ativa: true,
        updatedAt: Date.now(),
      }
      lancamento.recorrenciaId = recorrencia.id
    }

    aoSalvar(lancamento, recorrencia)
  }

  const erro = (cond: boolean) => tentouSalvar && cond

  return (
    <Folha
      aberta={aberto}
      aoFechar={aoFechar}
      titulo={editando ? 'Editar lançamento' : 'Novo lançamento'}
      rodape={
        <div className="flex gap-2.5">
          <Botao className="flex-1" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao className="flex-[2]" variante="primario" onClick={salvar}>
            {editando ? 'Salvar alterações' : 'Adicionar'}
          </Botao>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Receita / Despesa */}
        <div className="grid grid-cols-2 gap-2.5">
          {(['receita', 'despesa'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => trocarTipo(t)}
              className={cx(
                'rounded-xl py-3 text-[13px] font-bold transition-all',
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
            placeholder="Ex: Conta de energia"
            autoCapitalize="sentences"
            className={erro(!nomeOk) ? '!shadow-[inset_3px_3px_6px_#e7a5a5,inset_-3px_-3px_6px_#fff]' : ''}
          />
        </div>

        <div>
          <Rotulo>Valor (R$)</Rotulo>
          <Campo
            value={rascunho.valor}
            onChange={(e) => setRascunho({ ...rascunho, valor: e.target.value })}
            // decimal abre o teclado com vírgula no iOS
            inputMode="decimal"
            placeholder="0,00"
            className={cx(
              'font-mono',
              erro(!valorOk) && '!shadow-[inset_3px_3px_6px_#e7a5a5,inset_-3px_-3px_6px_#fff]',
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Rotulo>Vencimento</Rotulo>
            <Campo
              type="date"
              value={rascunho.vencimento}
              onChange={(e) => setRascunho({ ...rascunho, vencimento: e.target.value })}
            />
          </div>
          <div>
            <Rotulo>Pago em</Rotulo>
            <Campo
              type="date"
              value={rascunho.data_pgto}
              onChange={(e) => setRascunho({ ...rascunho, data_pgto: e.target.value })}
            />
          </div>
        </div>
        <p className="-mt-2 text-[11px] text-tinta-3">
          Preencher &ldquo;Pago em&rdquo; marca o lançamento como pago.
        </p>

        <div>
          <Rotulo>Forma de pagamento</Rotulo>
          <Selecao
            value={rascunho.tp}
            onChange={(e) =>
              setRascunho({ ...rascunho, tp: e.target.value as FormaPagamento })
            }
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
            {cats.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            {/* categoria de um lançamento antigo pode não estar mais na lista */}
            {cats.includes(rascunho.cat) ? null : (
              <option value={rascunho.cat}>{rascunho.cat}</option>
            )}
          </Selecao>
        </div>

        {contas.length > 1 ? (
          <div>
            <Rotulo>Conta</Rotulo>
            <Selecao
              value={rascunho.conta}
              onChange={(e) => setRascunho({ ...rascunho, conta: e.target.value })}
            >
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icone} {c.nome}
                </option>
              ))}
            </Selecao>
          </div>
        ) : null}

        {!editando ? (
          <div className="rounded-2xl bg-superficie p-3.5 shadow-neu-in-sm">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={rascunho.repetir}
                onChange={(e) => setRascunho({ ...rascunho, repetir: e.target.checked })}
                className="h-5 w-5 accent-accent"
              />
              <span className="text-[13px] font-bold text-tinta">🔁 Repetir automaticamente</span>
            </label>
            {rascunho.repetir ? (
              <div className="mt-3">
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
                <p className="mt-2 text-[11px] text-tinta-3">
                  As próximas ocorrências são criadas sozinhas. Gerencie a série na aba Fixos.
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </Folha>
  )
}
