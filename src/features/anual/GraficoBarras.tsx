import { fmtCompacto, fmtR, MESES_CURTOS } from '@/lib/formato'

export interface BarraMes {
  /** 0–11 */
  mes: number
  receitas: number
  despesas: number
}

/**
 * Barras agrupadas receitas x despesas por mês.
 *
 * SVG puro com viewBox: escala sozinho na largura do iPhone sem biblioteca
 * de gráfico e sem custo de bundle.
 */
export function GraficoBarras({
  dados,
  mesDestaque,
}: {
  dados: BarraMes[]
  mesDestaque?: number
}) {
  const L = 34 // espaço do eixo Y
  const B = 18 // espaço do eixo X
  const A = 150 // altura da área de plotagem
  const LARG = 320
  const areaLarg = LARG - L

  const max = Math.max(1, ...dados.flatMap((d) => [d.receitas, d.despesas]))
  // arredonda a escala para cima para o topo do gráfico não colar na barra
  const escala = Math.pow(10, Math.floor(Math.log10(max)))
  const topo = Math.ceil(max / escala) * escala

  const passo = areaLarg / dados.length
  const largBarra = Math.min(9, (passo - 4) / 2)
  const y = (v: number) => A - (v / topo) * A

  const linhas = [0, 0.5, 1].map((f) => ({ v: topo * f, y: y(topo * f) }))

  return (
    <svg
      viewBox={`0 0 ${LARG} ${A + B}`}
      className="block w-full"
      role="img"
      aria-label="Receitas e despesas por mês"
    >
      {linhas.map((g) => (
        <g key={g.v}>
          <line x1={L} y1={g.y} x2={LARG} y2={g.y} stroke="#d4c9e8" strokeWidth="0.7" />
          <text x={L - 4} y={g.y + 3} textAnchor="end" fontSize="7" fill="#a592c0">
            {fmtCompacto(g.v)}
          </text>
        </g>
      ))}

      {dados.map((d, i) => {
        const x = L + i * passo + (passo - largBarra * 2 - 2) / 2
        const destaque = mesDestaque === d.mes
        return (
          <g key={d.mes} opacity={mesDestaque === undefined || destaque ? 1 : 0.45}>
            {d.receitas > 0 ? (
              <rect
                x={x}
                y={y(d.receitas)}
                width={largBarra}
                height={Math.max(1, A - y(d.receitas))}
                rx={1.5}
                fill="#10b981"
              />
            ) : null}
            {d.despesas > 0 ? (
              <rect
                x={x + largBarra + 2}
                y={y(d.despesas)}
                width={largBarra}
                height={Math.max(1, A - y(d.despesas))}
                rx={1.5}
                fill="#ef4444"
              />
            ) : null}
            <text
              x={L + i * passo + passo / 2}
              y={A + 11}
              textAnchor="middle"
              fontSize="7"
              fontWeight={destaque ? '700' : '400'}
              fill={destaque ? '#7c3aed' : '#a592c0'}
            >
              {MESES_CURTOS[d.mes]}
            </text>
          </g>
        )
      })}

      <line x1={L} y1={A} x2={LARG} y2={A} stroke="#a592c0" strokeWidth="0.9" />
      <title>
        Máximo do período: {fmtR(max)}
      </title>
    </svg>
  )
}
