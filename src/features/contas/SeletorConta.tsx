import { cx } from '@/components/ui'
import type { Conta } from '@/types'

/** Alternador PF / PJ. Some quando existe só uma conta. */
export function SeletorConta({
  contas,
  ativa,
  aoTrocar,
}: {
  contas: Conta[]
  ativa: string
  aoTrocar: (id: string) => void
}) {
  const visiveis = contas.filter((c) => !c.arquivada)
  if (visiveis.length < 2) return null

  const opcoes = [{ id: 'todas', nome: 'Todas', cor: '#7c6b9e', icone: '◎' }, ...visiveis]

  return (
    <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
      {opcoes.map((c) => {
        const sel = ativa === c.id
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => aoTrocar(c.id)}
            className={cx(
              'flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold transition-all',
              sel ? 'text-white shadow-neu-xs' : 'bg-superficie text-tinta-2 shadow-neu-in-sm',
            )}
            style={sel ? { background: c.cor } : undefined}
          >
            <span>{c.icone}</span>
            {c.nome}
          </button>
        )
      })}
    </div>
  )
}
