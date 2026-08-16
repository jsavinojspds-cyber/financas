import { useMemo } from 'react'
import { Neu, Vazio } from '@/components/ui'
import { fmtDCurta, fmtRs } from '@/lib/formato'
import type { Lancamento } from '@/types'

interface LinhaFluxo extends Lancamento {
  credito: number
  debito: number
  saldoAcum: number
  /** o dinheiro saiu/entrou em data diferente do vencimento */
  dataReal: boolean
}

export function FluxoCaixa({ lista }: { lista: Lancamento[] }) {
  const linhas = useMemo<LinhaFluxo[]>(() => {
    // Ordena pela data em que o dinheiro efetivamente se move: se foi pago,
    // vale a data do pagamento; senão, o vencimento previsto.
    const itens = [...lista]
      .filter((l) => Number(l.valor) > 0)
      .sort((a, b) =>
        (a.data_pgto ?? a.vencimento).localeCompare(b.data_pgto ?? b.vencimento),
      )

    let acum = 0
    return itens.map((l) => {
      const credito = l.tl === 'receita' ? Number(l.valor) : 0
      const debito = l.tl === 'despesa' ? Number(l.valor) : 0
      acum += credito - debito
      return {
        ...l,
        credito,
        debito,
        saldoAcum: acum,
        dataReal: !!l.data_pgto && l.data_pgto !== l.vencimento,
      }
    })
  }, [lista])

  const totalCred = useMemo(
    () => lista.reduce((s, l) => (l.tl === 'receita' ? s + Number(l.valor) : s), 0),
    [lista],
  )
  const totalDeb = useMemo(
    () => lista.reduce((s, l) => (l.tl === 'despesa' ? s + Number(l.valor) : s), 0),
    [lista],
  )
  const menorSaldo = linhas.length ? Math.min(...linhas.map((f) => f.saldoAcum)) : 0

  if (!lista.length) {
    return <Vazio icone="📊" titulo="Sem movimentação neste mês" />
  }

  return (
    <div className="flex flex-col gap-3">
      {menorSaldo < 0 ? (
        <div className="rounded-2xl bg-despesa/10 p-3.5">
          <span className="text-[13px] font-bold text-despesa">
            ⚠ O caixa fica negativo em algum ponto do mês
          </span>
          <p className="mt-1 font-mono text-[12px] text-despesa/80">
            Pior momento: {fmtRs(menorSaldo)}
          </p>
        </div>
      ) : null}

      <Neu className="overflow-hidden" sombra="neu-xs">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[26rem] border-collapse text-[12px]">
            <thead>
              <tr className="bg-superficie-2 text-[10px] uppercase tracking-wide text-tinta-3">
                <th className="px-2.5 py-2.5 text-left font-bold">Data</th>
                <th className="px-2.5 py-2.5 text-left font-bold">Descrição</th>
                <th className="px-2.5 py-2.5 text-right font-bold">Crédito</th>
                <th className="px-2.5 py-2.5 text-right font-bold">Débito</th>
                <th className="px-2.5 py-2.5 text-right font-bold">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((f) => (
                <tr
                  key={f.id}
                  className="border-t border-borda/50"
                  style={f.saldoAcum < 0 ? { background: '#fee2e250' } : undefined}
                >
                  <td className="whitespace-nowrap px-2.5 py-2 font-mono text-tinta-2">
                    {fmtDCurta(f.data_pgto ?? f.vencimento)}
                    {f.dataReal ? (
                      <span className="ml-1 text-[9px] font-bold text-accent">real</span>
                    ) : null}
                  </td>
                  <td className="max-w-[9rem] truncate px-2.5 py-2 text-tinta">{f.nome}</td>
                  <td className="whitespace-nowrap px-2.5 py-2 text-right font-mono text-receita">
                    {f.credito ? fmtRs(f.credito) : ''}
                  </td>
                  <td className="whitespace-nowrap px-2.5 py-2 text-right font-mono text-despesa">
                    {f.debito ? fmtRs(f.debito) : ''}
                  </td>
                  <td
                    className="whitespace-nowrap px-2.5 py-2 text-right font-mono font-bold"
                    style={{ color: f.saldoAcum < 0 ? '#ef4444' : '#2d1b69' }}
                  >
                    {fmtRs(f.saldoAcum)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-borda bg-superficie-2 text-[11px] font-bold">
                <td className="px-2.5 py-2.5 text-tinta-2" colSpan={2}>
                  Total
                </td>
                <td className="px-2.5 py-2.5 text-right font-mono text-receita">
                  {fmtRs(totalCred)}
                </td>
                <td className="px-2.5 py-2.5 text-right font-mono text-despesa">
                  {fmtRs(totalDeb)}
                </td>
                <td
                  className="px-2.5 py-2.5 text-right font-mono"
                  style={{ color: totalCred - totalDeb < 0 ? '#ef4444' : '#10b981' }}
                >
                  {fmtRs(totalCred - totalDeb)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Neu>
    </div>
  )
}
