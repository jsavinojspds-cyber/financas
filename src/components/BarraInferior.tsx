import { cx } from './ui'
import { BotaoAtualizar } from './BotaoAtualizar'
import { labelMes } from '@/lib/formato'
import type { Conta } from '@/types'
import type { Aba } from '@/App'

/**
 * Toda a navegação e as ações, fixas na base.
 *
 * O iPhone 17 Pro Max tem 956pt de altura: segurando com uma mão, o terço
 * superior da tela simplesmente não é alcançável pelo polegar. Cabeçalho ali
 * em cima serve para *ler*, não para *tocar* — então mês, abas e ações
 * moram todos aqui embaixo, e o topo ficou livre para o conteúdo.
 */
export function BarraInferior({
  abas,
  aba,
  aoTrocarAba,
  ano,
  mes,
  conta,
  aoMesAnterior,
  aoProximoMes,
  aoAbrirPeriodo,
  mostrarNovo,
  aoNovo,
  aoAvisar,
  aoAtualizarDados,
  aoAjustes,
  aoSair,
}: {
  abas: { k: Aba; l: string }[]
  aba: Aba
  aoTrocarAba: (a: Aba) => void
  ano: number
  mes: number
  conta: Conta | null
  aoMesAnterior: () => void
  aoProximoMes: () => void
  aoAbrirPeriodo: () => void
  mostrarNovo: boolean
  aoNovo: () => void
  aoAvisar: (msg: string) => void
  aoAtualizarDados: () => void
  aoAjustes: () => void
  aoSair: () => void
}) {
  return (
    <nav className="pad-base fixed inset-x-0 bottom-0 z-40 border-t border-borda/60 bg-fundo/95 backdrop-blur">
      <div className="mx-auto max-w-xl">
        {/* abas */}
        <div className="flex items-center gap-0.5 overflow-x-auto px-2 pt-1">
          {abas.map((a) => (
            <button
              key={a.k}
              type="button"
              onClick={() => aoTrocarAba(a.k)}
              className={cx(
                'shrink-0 whitespace-nowrap rounded-lg px-3 py-2.5 text-[12px] font-bold transition-colors',
                aba === a.k ? 'bg-accent/12 text-accent' : 'text-tinta-2',
              )}
            >
              {a.l}
            </button>
          ))}
        </div>

        {/* mês + ações */}
        <div className="flex items-center gap-1.5 px-3 pb-1.5 pt-1">
          <button
            type="button"
            onClick={aoMesAnterior}
            aria-label="Mês anterior"
            className="flex h-11 w-8 shrink-0 items-center justify-center rounded-lg text-[16px] text-tinta-2 active:bg-superficie"
          >
            ‹
          </button>

          <button
            type="button"
            onClick={aoAbrirPeriodo}
            className="flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl bg-superficie px-2 shadow-neu-in-sm active:shadow-neu-xs"
          >
            <span className="truncate text-[13px] font-bold text-tinta">{labelMes(ano, mes)}</span>
            {conta ? (
              <span
                className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                style={{ background: `${conta.cor}1f`, color: conta.cor }}
              >
                {conta.icone}
              </span>
            ) : null}
            <span className="shrink-0 text-[8px] text-tinta-3">▼</span>
          </button>

          <button
            type="button"
            onClick={aoProximoMes}
            aria-label="Próximo mês"
            className="flex h-11 w-8 shrink-0 items-center justify-center rounded-lg text-[16px] text-tinta-2 active:bg-superficie"
          >
            ›
          </button>

          {mostrarNovo ? (
            <button
              type="button"
              onClick={aoNovo}
              aria-label="Novo lançamento"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-[20px] font-bold text-superficie shadow-neu-sm active:scale-[.97] active:shadow-neu-in-sm"
            >
              +
            </button>
          ) : null}

          <BotaoAtualizar aoAvisar={aoAvisar} aoAtualizarDados={aoAtualizarDados} />

          <BotaoIcone rotulo="Ajustes" onClick={aoAjustes}>
            ⚙️
          </BotaoIcone>
          <BotaoIcone rotulo="Bloquear app" onClick={aoSair}>
            🔒
          </BotaoIcone>
        </div>
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
      // 44px é o alvo mínimo de toque recomendado no iOS
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-superficie text-[15px] shadow-neu-xs active:shadow-neu-in-sm"
    >
      {children}
    </button>
  )
}
