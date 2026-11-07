import { Neu } from '@/components/ui'
import { fmtR } from '@/lib/formato'
import type { EstadoApp } from '@/types'

type Base = EstadoApp['planejamento']['bases'][string]

export function ComparativoPlano({ planejado, recebido, pago }: { planejado: Base | null; recebido: number; pago: number }) {
  if (!planejado) return null
  const linhas = [
    { nome: 'Receitas', plano: planejado.receitas, realizado: recebido, cor: 'text-receita', desvio: recebido - planejado.receitas },
    { nome: 'Despesas', plano: planejado.despesas, realizado: pago, cor: 'text-despesa', desvio: pago - planejado.despesas },
    { nome: 'Saldo', plano: planejado.receitas - planejado.despesas, realizado: recebido - pago, cor: 'text-tinta', desvio: recebido - pago - planejado.receitas + planejado.despesas },
  ]
  return <Neu className="p-4"><h3 className="font-bold text-tinta">Plano × realizado</h3><p className="mt-1 text-[11px] text-tinta-3">Realizado considera somente receitas recebidas e despesas pagas. O desvio acompanha as quitações até agora.</p><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[320px] text-[11px]"><thead><tr className="text-tinta-3"><th className="p-1 text-left"> </th><th className="p-1 text-right">Plano</th><th className="p-1 text-right">Realizado</th><th className="p-1 text-right">Desvio</th></tr></thead><tbody>{linhas.map((linha) => <tr key={linha.nome} className="border-t border-borda/60"><th className="p-1 text-left font-semibold">{linha.nome}</th><td className="p-1 text-right">{fmtR(linha.plano)}</td><td className={`p-1 text-right ${linha.cor}`}>{fmtR(linha.realizado)}</td><td className={`p-1 text-right font-semibold ${(linha.nome === 'Despesas' ? linha.desvio <= 0 : linha.desvio >= 0) ? 'text-receita' : 'text-despesa'}`}>{linha.desvio > 0 ? '+' : ''}{fmtR(linha.desvio)}</td></tr>)}</tbody></table></div></Neu>
}
