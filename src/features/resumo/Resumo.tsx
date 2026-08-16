import { useMemo, useState } from 'react'
import { Barra, Botao, Neu, Vazio, cx } from '@/components/ui'
import { avancarData, chave, fmtD, fmtR, labelMes, proxMes } from '@/lib/formato'
import { novoId } from '@/lib/id'
import { statusDe, totais } from '@/state/seletores'
import type { EstadoApp, Lancamento } from '@/types'
import type { Aba } from '@/App'

export function Resumo({
  lista,
  ano,
  mes,
  estado,
  aoIrParaAba,
  aoCopiarMes,
}: {
  lista: Lancamento[]
  ano: number
  mes: number
  estado: EstadoApp
  aoIrParaAba: (a: Aba) => void
  aoCopiarMes: (itens: Lancamento[], destino: string, qtd: number) => void
}) {
  const [modoCopia, setModoCopia] = useState<null | 'selecionar'>(null)
  const [selecionados, setSelecionados] = useState<string[]>([])

  const t = useMemo(() => totais(lista), [lista])
  const [anoProx, mesProx] = proxMes(ano, mes)
  const chaveProx = chave(anoProx, mesProx)

  const vencendo = useMemo(
    () => lista.filter((l) => statusDe(l) === 'alerta'),
    [lista],
  )

  const proximos = useMemo(
    () =>
      lista
        .filter((l) => !l.pago)
        .sort((a, b) => a.vencimento.localeCompare(b.vencimento))
        .slice(0, 6),
    [lista],
  )

  function copiar(ids: string[]) {
    const origem = lista.filter((l) => ids.includes(l.id))
    if (!origem.length) return
    const copias: Lancamento[] = origem.map((l) => ({
      ...l,
      id: novoId(),
      vencimento: avancarData(l.vencimento, 1),
      pago: false,
      data_pgto: null,
      // a cópia é um lançamento avulso: não herda o vínculo com a série
      recorrenciaId: null,
      updatedAt: Date.now(),
    }))
    aoCopiarMes(copias, chaveProx, copias.length)
    setModoCopia(null)
    setSelecionados([])
  }

  if (!lista.length) {
    return (
      <Vazio
        icone="📭"
        titulo="Nenhum lançamento neste mês"
        dica="Toque em + Novo para começar"
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* saldo do mês */}
      <Neu className="p-4">
        <span className="text-[10px] font-bold uppercase tracking-wider text-tinta-3">
          Saldo do mês
        </span>
        <div
          className="mt-1 font-mono text-[26px] font-bold"
          style={{ color: t.saldo >= 0 ? '#10b981' : '#ef4444' }}
        >
          {fmtR(t.saldo)}
        </div>
      </Neu>

      <div className="grid grid-cols-2 gap-3">
        <CartaoTotal label="Receitas" total={t.receitas} label2="Recebido" parcial={t.recebido} cor="#10b981" />
        <CartaoTotal label="Despesas" total={t.despesas} label2="Pago" parcial={t.pago} cor="#ef4444" />
      </div>

      {/* progresso de pagamento */}
      <Neu className="p-4" sombra="neu-xs">
        <div className="mb-2 flex items-center justify-between text-[12px] font-bold">
          <span className="text-tinta-2">Pagamentos</span>
          <span className="text-accent">{t.pctPago}%</span>
        </div>
        <Barra pct={t.pctPago} />
      </Neu>

      {vencendo.length > 0 ? (
        <button
          type="button"
          onClick={() => aoIrParaAba('despesas')}
          className="rounded-2xl bg-alerta/10 p-3.5 text-left"
        >
          <span className="text-[13px] font-bold text-alerta">
            ⚠ {vencendo.length} {vencendo.length === 1 ? 'conta vence' : 'contas vencem'} nos
            próximos dias
          </span>
        </button>
      ) : null}

      {proximos.length > 0 ? (
        <Neu className="p-4" sombra="neu-xs">
          <h3 className="mb-3 text-[13px] font-bold text-tinta">Próximos vencimentos</h3>
          <ul className="flex flex-col gap-2.5">
            {proximos.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 text-[13px]">
                <span className="min-w-0 flex-1 truncate text-tinta">{l.nome}</span>
                <span className="shrink-0 text-[11px] text-tinta-3">{fmtD(l.vencimento)}</span>
                <span
                  className="shrink-0 font-mono text-[13px] font-bold"
                  style={{ color: l.tl === 'receita' ? '#10b981' : '#ef4444' }}
                >
                  {fmtR(l.valor)}
                </span>
              </li>
            ))}
          </ul>
        </Neu>
      ) : null}

      {/* copiar para o próximo mês */}
      <Neu className="p-4" sombra="neu-xs">
        <h3 className="text-[13px] font-bold text-tinta">
          Copiar para {labelMes(anoProx, mesProx)}
        </h3>
        <p className="mt-1 text-[11px] text-tinta-3">
          As datas avançam um mês e os itens voltam a ficar não pagos.
          {(estado.lancamentos[chaveProx]?.length ?? 0) > 0
            ? ` O mês de destino já tem ${estado.lancamentos[chaveProx]?.length} lançamentos.`
            : ''}
        </p>

        {modoCopia === null ? (
          <div className="mt-3 flex gap-2.5">
            <Botao
              className="flex-1"
              variante="primario"
              onClick={() => copiar(lista.map((l) => l.id))}
            >
              Copiar tudo ({lista.length})
            </Botao>
            <Botao className="flex-1" onClick={() => setModoCopia('selecionar')}>
              Selecionar
            </Botao>
          </div>
        ) : (
          <div className="mt-3">
            <div className="max-h-64 overflow-y-auto rounded-xl bg-fundo p-2 shadow-neu-in-sm">
              {lista.map((l) => {
                const marcado = selecionados.includes(l.id)
                return (
                  <label
                    key={l.id}
                    className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-[13px]"
                  >
                    <input
                      type="checkbox"
                      checked={marcado}
                      onChange={() =>
                        setSelecionados((s) =>
                          marcado ? s.filter((x) => x !== l.id) : [...s, l.id],
                        )
                      }
                      className="h-4 w-4 accent-accent"
                    />
                    <span className={cx('min-w-0 flex-1 truncate', marcado ? 'text-tinta' : 'text-tinta-2')}>
                      {l.nome}
                    </span>
                    <span className="shrink-0 font-mono text-[12px] text-tinta-2">
                      {fmtR(l.valor)}
                    </span>
                  </label>
                )
              })}
            </div>
            <div className="mt-3 flex gap-2.5">
              <Botao
                className="flex-1"
                onClick={() => {
                  setModoCopia(null)
                  setSelecionados([])
                }}
              >
                Cancelar
              </Botao>
              <Botao
                className="flex-[2]"
                variante="primario"
                disabled={!selecionados.length}
                onClick={() => copiar(selecionados)}
              >
                Copiar {selecionados.length || ''}
              </Botao>
            </div>
          </div>
        )}
      </Neu>
    </div>
  )
}

function CartaoTotal({
  label,
  total,
  label2,
  parcial,
  cor,
}: {
  label: string
  total: number
  label2: string
  parcial: number
  cor: string
}) {
  return (
    <Neu className="p-3.5" sombra="neu-xs">
      <span className="text-[10px] font-bold uppercase tracking-wider text-tinta-3">{label}</span>
      <div className="mt-0.5 font-mono text-[17px] font-bold" style={{ color: cor }}>
        {fmtR(total)}
      </div>
      <div className="mt-0.5 text-[11px] text-tinta-3">
        {label2}: {fmtR(parcial)}
      </div>
    </Neu>
  )
}
