import type { EstadoGravacao } from '@/storage/persistir'
import { cx } from './ui'

/**
 * Substitui o botão "💾 Salvar" do app antigo por um sinal passivo.
 * Só chama atenção quando algo deu errado — o caminho feliz fica discreto.
 */
export function IndicadorGravacao({
  estado,
  aoTentarNovamente,
}: {
  estado: EstadoGravacao
  aoTentarNovamente: () => void
}) {
  if (estado === 'erro') {
    return (
      <button
        type="button"
        onClick={aoTentarNovamente}
        className="flex items-center gap-1 rounded-full bg-despesa/10 px-2.5 py-1 text-[11px] font-bold text-despesa"
      >
        ⚠ Não salvou · tentar
      </button>
    )
  }

  const salvando = estado === 'salvando' || estado === 'pendente'
  return (
    <span
      title={salvando ? 'Salvando…' : 'Tudo salvo'}
      className={cx(
        'flex items-center gap-1 text-[11px] font-semibold transition-colors',
        salvando ? 'text-tinta-3' : 'text-receita',
      )}
    >
      <span
        className={cx(
          'h-1.5 w-1.5 rounded-full',
          salvando ? 'animate-pulse bg-tinta-3' : 'bg-receita',
        )}
      />
      {salvando ? 'Salvando' : 'Salvo'}
    </span>
  )
}
