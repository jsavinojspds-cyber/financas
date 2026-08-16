import { COR_CAT } from '@/types'
import { fmtR } from '@/lib/formato'

export interface FatiaDados {
  rotulo: string
  valor: number
}

/** Pizza em SVG puro — sem biblioteca de gráfico, o bundle continua pequeno. */
export function GraficoPizza({ dados, total }: { dados: FatiaDados[]; total: number }) {
  if (!dados.length || total <= 0) return null

  const R = 80
  const cx = 100
  const cy = 100
  let angulo = -Math.PI / 2

  const fatias = dados.map((d) => {
    const pct = d.valor / total
    const a1 = angulo
    const a2 = angulo + pct * 2 * Math.PI
    angulo = a2
    const x1 = cx + R * Math.cos(a1)
    const y1 = cy + R * Math.sin(a1)
    const x2 = cx + R * Math.cos(a2)
    const y2 = cy + R * Math.sin(a2)
    return {
      ...d,
      pct,
      // arco maior quando a fatia passa de meia volta
      d: `M${cx},${cy} L${x1},${y1} A${R},${R} 0 ${pct > 0.5 ? 1 : 0},1 ${x2},${y2} Z`,
    }
  })

  return (
    <svg viewBox="0 0 200 200" className="mx-auto block w-full max-w-[200px]" role="img" aria-label="Gastos por categoria">
      {fatias.map((f, i) => (
        <path
          key={f.rotulo}
          d={f.d}
          fill={COR_CAT[i % COR_CAT.length]}
          stroke="#e2d9f0"
          strokeWidth="1.5"
        />
      ))}
      <circle cx={cx} cy={cy} r={38} fill="#eee8f8" />
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize="9" fontWeight="700" fill="#7c6b9e">
        TOTAL
      </text>
      <text x={cx} y={cy + 8} textAnchor="middle" fontSize="8" fontWeight="700" fill="#2d1b69">
        {fmtR(total)}
      </text>
    </svg>
  )
}
