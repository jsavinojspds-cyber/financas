import { useMemo, useState } from 'react'
import { Neu, Vazio, cx } from '@/components/ui'
import { fmtR, MESES_CURTOS } from '@/lib/formato'
import { anosDisponiveis, doAno, totais } from '@/state/seletores'
import type { EstadoApp } from '@/types'
import { GraficoBarras } from './GraficoBarras'

export function ResumoAnual({ estado, anoInicial }: { estado: EstadoApp; anoInicial: number }) {
  const anos = useMemo(() => anosDisponiveis(estado), [estado])
  const [ano, setAno] = useState(anos.includes(anoInicial) ? anoInicial : (anos[0] ?? anoInicial))

  const meses = useMemo(() => doAno(estado, ano), [estado, ano])

  const linhas = useMemo(
    () =>
      meses.map((m, i) => {
        const t = totais(m.itens)
        return { mes: i, ...t, qtd: m.itens.length }
      }),
    [meses],
  )

  const anual = useMemo(() => {
    const receitas = linhas.reduce((s, l) => s + l.receitas, 0)
    const despesas = linhas.reduce((s, l) => s + l.despesas, 0)
    const comMovimento = linhas.filter((l) => l.qtd > 0)
    return {
      receitas,
      despesas,
      saldo: receitas - despesas,
      // média só sobre os meses que têm dados; senão janeiro vazio derruba tudo
      mediaReceitas: comMovimento.length ? receitas / comMovimento.length : 0,
      mediaDespesas: comMovimento.length ? despesas / comMovimento.length : 0,
      // taxa de poupança: quanto de cada real recebido sobrou
      taxaPoupanca: receitas > 0 ? Math.round(((receitas - despesas) / receitas) * 100) : 0,
      melhor: comMovimento.length
        ? comMovimento.reduce((a, b) => (b.saldo > a.saldo ? b : a))
        : null,
      pior: comMovimento.length
        ? comMovimento.reduce((a, b) => (b.saldo < a.saldo ? b : a))
        : null,
      mesesComDados: comMovimento.length,
    }
  }, [linhas])

  const dadosGrafico = useMemo(
    () => linhas.map((l) => ({ mes: l.mes, receitas: l.receitas, despesas: l.despesas })),
    [linhas],
  )

  if (anual.mesesComDados === 0) {
    return (
      <div className="flex flex-col gap-3">
        <SeletorAno anos={anos} ano={ano} setAno={setAno} />
        <Vazio icone="📅" titulo={`Nenhum lançamento em ${ano}`} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <SeletorAno anos={anos} ano={ano} setAno={setAno} />

      <Neu className="p-4">
        <span className="text-[10px] font-bold uppercase tracking-wider text-tinta-3">
          Saldo de {ano}
        </span>
        <div
          className="mt-1 font-mono text-[26px] font-bold"
          style={{ color: anual.saldo >= 0 ? '#10b981' : '#ef4444' }}
        >
          {fmtR(anual.saldo)}
        </div>
        <div className="mt-1 text-[11px] text-tinta-3">
          {anual.mesesComDados} {anual.mesesComDados === 1 ? 'mês' : 'meses'} com movimento
        </div>
      </Neu>

      <Neu className="p-4" sombra="neu-xs">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[13px] font-bold text-tinta">Receitas × Despesas</h3>
          <div className="flex items-center gap-3 text-[10px] font-bold">
            <span className="flex items-center gap-1 text-tinta-2">
              <span className="h-2 w-2 rounded-sm bg-receita" /> Receitas
            </span>
            <span className="flex items-center gap-1 text-tinta-2">
              <span className="h-2 w-2 rounded-sm bg-despesa" /> Despesas
            </span>
          </div>
        </div>
        <GraficoBarras dados={dadosGrafico} />
      </Neu>

      <div className="grid grid-cols-2 gap-3">
        <Kpi rotulo="Receita média/mês" valor={fmtR(anual.mediaReceitas)} cor="#10b981" />
        <Kpi rotulo="Despesa média/mês" valor={fmtR(anual.mediaDespesas)} cor="#ef4444" />
        <Kpi
          rotulo="Taxa de poupança"
          valor={`${anual.taxaPoupanca}%`}
          cor={anual.taxaPoupanca >= 0 ? '#7c3aed' : '#ef4444'}
        />
        <Kpi
          rotulo="Melhor mês"
          valor={anual.melhor ? (MESES_CURTOS[anual.melhor.mes] ?? '—') : '—'}
          sub={anual.melhor ? fmtR(anual.melhor.saldo) : undefined}
          cor="#10b981"
        />
      </div>

      <Neu className="overflow-hidden" sombra="neu-xs">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[22rem] border-collapse text-[12px]">
            <thead>
              <tr className="bg-superficie-2 text-[10px] uppercase tracking-wide text-tinta-3">
                <th className="px-2.5 py-2.5 text-left font-bold">Mês</th>
                <th className="px-2.5 py-2.5 text-right font-bold">Receitas</th>
                <th className="px-2.5 py-2.5 text-right font-bold">Despesas</th>
                <th className="px-2.5 py-2.5 text-right font-bold">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr
                  key={l.mes}
                  className={cx('border-t border-borda/50', l.qtd === 0 && 'opacity-40')}
                >
                  <td className="px-2.5 py-2 font-semibold text-tinta">{MESES_CURTOS[l.mes]}</td>
                  <td className="px-2.5 py-2 text-right font-mono text-receita">
                    {l.receitas ? fmtR(l.receitas) : '—'}
                  </td>
                  <td className="px-2.5 py-2 text-right font-mono text-despesa">
                    {l.despesas ? fmtR(l.despesas) : '—'}
                  </td>
                  <td
                    className="px-2.5 py-2 text-right font-mono font-bold"
                    style={{ color: l.saldo < 0 ? '#ef4444' : '#2d1b69' }}
                  >
                    {l.qtd ? fmtR(l.saldo) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-borda bg-superficie-2 text-[11px] font-bold">
                <td className="px-2.5 py-2.5 text-tinta-2">Total</td>
                <td className="px-2.5 py-2.5 text-right font-mono text-receita">
                  {fmtR(anual.receitas)}
                </td>
                <td className="px-2.5 py-2.5 text-right font-mono text-despesa">
                  {fmtR(anual.despesas)}
                </td>
                <td
                  className="px-2.5 py-2.5 text-right font-mono"
                  style={{ color: anual.saldo < 0 ? '#ef4444' : '#10b981' }}
                >
                  {fmtR(anual.saldo)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Neu>
    </div>
  )
}

function SeletorAno({
  anos,
  ano,
  setAno,
}: {
  anos: number[]
  ano: number
  setAno: (a: number) => void
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-0.5">
      {anos.map((a) => (
        <button
          key={a}
          type="button"
          onClick={() => setAno(a)}
          className={cx(
            'shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-bold transition-all',
            a === ano
              ? 'bg-accent text-superficie shadow-neu-xs'
              : 'bg-superficie text-tinta-2 shadow-neu-in-sm',
          )}
        >
          {a}
        </button>
      ))}
    </div>
  )
}

function Kpi({
  rotulo,
  valor,
  sub,
  cor,
}: {
  rotulo: string
  valor: string
  sub?: string
  cor: string
}) {
  return (
    <Neu className="p-3.5" sombra="neu-xs">
      <span className="text-[10px] font-bold uppercase tracking-wider text-tinta-3">{rotulo}</span>
      <div className="mt-0.5 font-mono text-[15px] font-bold" style={{ color: cor }}>
        {valor}
      </div>
      {sub ? <div className="mt-0.5 font-mono text-[11px] text-tinta-3">{sub}</div> : null}
    </Neu>
  )
}
