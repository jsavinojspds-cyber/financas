import { cx } from './ui'
import { IndicadorGravacao } from './IndicadorGravacao'
import { BotaoAtualizar } from './BotaoAtualizar'
import type { EstadoGravacao } from '@/storage/persistir'

/**
 * Barra de ações fixa na base.
 *
 * Antes esses botões ficavam no topo do cabeçalho. Num iPhone grande o topo
 * da tela é a região que o polegar não alcança segurando o aparelho com uma
 * mão só — e "+ Novo" é a ação mais usada do app. Aqui embaixo tudo fica ao
 * alcance, e o cabeçalho perde uma linha inteira.
 */
export function BarraInferior({
  mostrarNovo,
  aoNovo,
  gravacao,
  aoSalvarAgora,
  aoAvisar,
  aoAtualizarDados,
  aoAjustes,
  aoSair,
}: {
  mostrarNovo: boolean
  aoNovo: () => void
  gravacao: EstadoGravacao
  aoSalvarAgora: () => void
  aoAvisar: (msg: string) => void
  aoAtualizarDados: () => void
  aoAjustes: () => void
  aoSair: () => void
}) {
  return (
    <nav className="pad-base fixed inset-x-0 bottom-0 z-40 border-t border-borda/60 bg-fundo/95 backdrop-blur">
      <div className="mx-auto flex max-w-xl items-center gap-2 px-4 py-2.5">
        {mostrarNovo ? (
          <button
            type="button"
            onClick={aoNovo}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-accent py-3 text-[14px] font-bold text-superficie shadow-neu-sm active:scale-[.98] active:shadow-neu-in-sm"
          >
            + Novo lançamento
          </button>
        ) : (
          <div className="flex flex-1 items-center pl-1">
            <IndicadorGravacao estado={gravacao} aoTentarNovamente={aoSalvarAgora} />
          </div>
        )}

        <BotaoAtualizar aoAvisar={aoAvisar} aoAtualizarDados={aoAtualizarDados} />

        <BotaoIcone rotulo="Ajustes" onClick={aoAjustes}>
          ⚙️
        </BotaoIcone>
        <BotaoIcone rotulo="Bloquear app" onClick={aoSair}>
          🔒
        </BotaoIcone>
      </div>
    </nav>
  )
}

function BotaoIcone({
  rotulo,
  onClick,
  children,
}: {
  rotulo: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={rotulo}
      className={cx(
        // 44px é o alvo mínimo de toque recomendado no iOS
        'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-superficie text-[15px]',
        'shadow-neu-xs active:shadow-neu-in-sm',
      )}
    >
      {children}
    </button>
  )
}
