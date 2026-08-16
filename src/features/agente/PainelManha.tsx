import { useEffect, useMemo, useState } from 'react'
import { Neu, cx } from '@/components/ui'
import { useLoja } from '@/state/store'
import { gerarInsights, type NivelInsight } from './insights'
import {
  atualizarDolar,
  buscarMercado,
  formatarIndicador,
  idadeTexto,
  type Mercado,
} from './mercado'

const CORES: Record<NivelInsight, { fundo: string; texto: string }> = {
  critico: { fundo: 'bg-despesa/10', texto: 'text-despesa' },
  atencao: { fundo: 'bg-alerta/10', texto: 'text-alerta' },
  bom: { fundo: 'bg-receita/10', texto: 'text-receita' },
  info: { fundo: 'bg-accent/10', texto: 'text-accent' },
}

function saudacao(h: number): string {
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

/** Tela "☀️ Hoje": o resumo da manhã. */
export function PainelManha() {
  const { estado } = useLoja()
  const [mercado, setMercado] = useState<Mercado | null>(null)
  const [carregandoMercado, setCarregandoMercado] = useState(true)

  const agora = useMemo(() => new Date(), [])
  const insights = useMemo(() => gerarInsights(estado, agora), [estado, agora])

  useEffect(() => {
    let vivo = true
    void (async () => {
      const m = await buscarMercado()
      if (!vivo) return
      setMercado(m)
      setCarregandoMercado(false)

      // O dólar tem fonte com CORS aberto: dá para deixá-lo ao vivo mesmo
      // entre execuções do workflow da manhã.
      const usd = await atualizarDolar()
      if (!vivo || !usd || !m) return
      setMercado({
        ...m,
        indicadores: m.indicadores.map((i) => (i.id === 'usd' ? usd : i)),
      })
    })()
    return () => {
      vivo = false
    }
  }, [])

  const dataLonga = agora.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  })

  return (
    <div className="flex flex-col gap-3">
      <div className="px-1">
        <h2 className="text-[19px] font-bold text-tinta">{saudacao(agora.getHours())}, Jean</h2>
        {/* first-letter, não capitalize: "domingo, 16 de agosto" e não "16 De Agosto" */}
        <p className="mt-0.5 text-[12px] text-tinta-2 first-letter:uppercase">{dataLonga}</p>
      </div>

      {/* ── seus números ── */}
      <div className="flex flex-col gap-2.5">
        {insights.map((i) => {
          const cor = CORES[i.nivel]
          return (
            <div key={i.id} className={cx('flex gap-3 rounded-2xl p-3.5', cor.fundo)}>
              <span className="shrink-0 text-[15px] leading-tight">{i.icone}</span>
              <div className="min-w-0 flex-1">
                <p className={cx('text-[13px] font-bold leading-snug', cor.texto)}>{i.titulo}</p>
                {i.detalhe ? (
                  <p className="mt-0.5 text-[12px] leading-relaxed text-tinta-2">{i.detalhe}</p>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── mercado ── */}
      <Neu className="p-4" sombra="neu-xs">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h3 className="text-[13px] font-bold text-tinta">Mercado</h3>
          {mercado ? (
            <span className="text-[10px] text-tinta-3">{idadeTexto(mercado.gerado_em)}</span>
          ) : null}
        </div>

        {carregandoMercado ? (
          <p className="py-2 text-[12px] text-tinta-3">Carregando cotações…</p>
        ) : !mercado ? (
          <p className="py-2 text-[12px] text-tinta-3">
            Sem cotações ainda. Elas aparecem aqui depois da primeira atualização da manhã.
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {mercado.indicadores.map((i) => (
              <li key={i.id} className="flex items-baseline justify-between gap-3">
                <span className="text-[13px] text-tinta">{i.rotulo}</span>
                <span className="flex items-baseline gap-2">
                  <span className="font-mono text-[13px] font-bold text-tinta">
                    {formatarIndicador(i)}
                  </span>
                  {i.variacao !== null ? (
                    <span
                      className="w-[3.6rem] text-right font-mono text-[12px] font-bold"
                      style={{ color: i.variacao >= 0 ? '#10b981' : '#ef4444' }}
                    >
                      {i.variacao >= 0 ? '+' : ''}
                      {i.variacao.toFixed(2)}%
                    </span>
                  ) : (
                    <span className="w-[3.6rem] text-right text-[11px] text-tinta-3">
                      {i.nota ?? ''}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-3 border-t border-borda/60 pt-2.5 text-[11px] leading-relaxed text-tinta-3">
          Cotações de referência, atualizadas pela manhã em dias úteis. Informação, não
          recomendação de investimento.
        </p>
      </Neu>

      <p className="px-1 text-[11px] leading-relaxed text-tinta-3">
        A análise acima é calculada no próprio aparelho, a partir dos seus lançamentos. Nenhum
        dado financeiro seu sai daqui.
      </p>
    </div>
  )
}
