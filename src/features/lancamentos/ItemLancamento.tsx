import { diasAte, fmtD, fmtR } from '@/lib/formato'
import { statusDe } from '@/state/seletores'
import { COR_TIPO, ICON_TIPO, type Conta, type Lancamento, type StatusLancamento } from '@/types'
import { cx } from '@/components/ui'

const CORES_STATUS: Record<StatusLancamento, string> = {
  pago: '#10b981',
  vencido: '#ef4444',
  alerta: '#f59e0b',
  pendente: '#a592c0',
}

function rotuloStatus(l: Lancamento): { texto: string; cor: string } {
  const s = statusDe(l)
  if (s === 'pago') return { texto: 'Pago', cor: CORES_STATUS.pago }
  const d = diasAte(l.vencimento)
  if (d < 0) return { texto: `${Math.abs(d)}d atrás`, cor: CORES_STATUS.vencido }
  if (d === 0) return { texto: 'Hoje', cor: CORES_STATUS.alerta }
  return { texto: `${d}d`, cor: d <= 3 ? CORES_STATUS.alerta : CORES_STATUS.pendente }
}

export function ItemLancamento({
  l,
  contas,
  mostrarConta,
  aoAlternarPago,
  aoEditar,
  aoExcluir,
}: {
  l: Lancamento
  contas: Conta[]
  mostrarConta: boolean
  aoAlternarPago: (id: string) => void
  aoEditar: (l: Lancamento) => void
  aoExcluir: (id: string) => void
}) {
  const status = statusDe(l)
  const badge = rotuloStatus(l)
  const conta = contas.find((c) => c.id === l.conta)
  // pagamento em data diferente do vencimento é informação relevante no fluxo
  const pagouForaDoPrazo = l.pago && l.data_pgto && l.data_pgto !== l.vencimento

  return (
    <div
      className="mb-2.5 rounded-2xl bg-superficie p-3.5 shadow-neu-xs"
      style={{ borderLeft: `3px solid ${CORES_STATUS[status]}` }}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => aoAlternarPago(l.id)}
          aria-label={l.pago ? `Desmarcar ${l.nome} como pago` : `Marcar ${l.nome} como pago`}
          className={cx(
            'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[13px] font-bold transition-colors',
            l.pago
              ? 'bg-receita text-white shadow-neu-xs'
              : 'bg-fundo text-transparent shadow-neu-in-sm',
          )}
        >
          ✓
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span
              className={cx(
                'truncate text-[14px] font-bold',
                l.pago ? 'text-tinta-2 line-through decoration-1' : 'text-tinta',
              )}
            >
              {l.nome}
            </span>
            <span
              className="shrink-0 font-mono text-[14px] font-bold"
              style={{ color: l.tl === 'receita' ? '#10b981' : '#ef4444' }}
            >
              {l.tl === 'receita' ? '+' : '−'}
              {fmtR(l.valor)}
            </span>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-tinta-3">
            <span className="font-semibold" style={{ color: COR_TIPO[l.tp] }}>
              {ICON_TIPO[l.tp]} {l.tp}
            </span>
            <span>·</span>
            <span>{l.cat}</span>
            <span>·</span>
            <span>{fmtD(l.vencimento)}</span>
            {pagouForaDoPrazo ? (
              <span className="text-tinta-2">(pago {fmtD(l.data_pgto as string)})</span>
            ) : null}
            {l.recorrenciaId ? <span title="Lançamento fixo">🔁</span> : null}
            {mostrarConta && conta ? (
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                style={{ background: `${conta.cor}1a`, color: conta.cor }}
              >
                {conta.icone} {conta.nome}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-2.5 flex items-center justify-between border-t border-borda/60 pt-2.5">
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-bold"
          style={{ background: `${badge.cor}1f`, color: badge.cor }}
        >
          {badge.texto}
        </span>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => aoEditar(l)}
            aria-label={`Editar ${l.nome}`}
            className="rounded-lg px-2.5 py-1 text-[12px] text-tinta-2 active:bg-fundo"
          >
            ✏️
          </button>
          <button
            type="button"
            onClick={() => aoExcluir(l.id)}
            aria-label={`Excluir ${l.nome}`}
            className="rounded-lg px-2.5 py-1 text-[12px] text-tinta-2 active:bg-fundo"
          >
            🗑
          </button>
        </div>
      </div>
    </div>
  )
}
