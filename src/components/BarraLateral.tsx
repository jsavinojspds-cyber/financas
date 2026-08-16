import { cx } from './ui'
import { BotaoAtualizar } from './BotaoAtualizar'
import { IndicadorGravacao } from './IndicadorGravacao'
import { labelMes } from '@/lib/formato'
import type { EstadoGravacao } from '@/storage/persistir'
import type { Conta } from '@/types'
import type { Aba } from '@/App'

/**
 * Navegação lateral para telas grandes (≥1024px).
 *
 * No celular tudo vive numa barra inferior, porque lá o que manda é o
 * alcance do polegar. No computador esse problema não existe e a tela sobra
 * na horizontal — uma coluna fixa à esquerda mostra todas as abas de uma vez,
 * sem a rolagem lateral que faz sentido no telefone.
 */
export function BarraLateral({
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
  gravacao,
  aoSalvarAgora,
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
  gravacao: EstadoGravacao
  aoSalvarAgora: () => void
  aoAvisar: (msg: string) => void
  aoAtualizarDados: () => void
  aoAjustes: () => void
  aoSair: () => void
}) {
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-borda/60 bg-fundo px-3 py-4 lg:flex">
      <h1 className="px-2 text-[16px] font-bold text-tinta">💰 Finanças</h1>

      {/* período */}
      <div className="mt-4 flex items-center gap-1">
        <button
          type="button"
          onClick={aoMesAnterior}
          aria-label="Mês anterior"
          className="flex h-9 w-7 shrink-0 items-center justify-center rounded-lg text-tinta-2 hover:bg-superficie"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={aoAbrirPeriodo}
          className="flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl bg-superficie px-2 shadow-neu-in-sm"
        >
          <span className="truncate text-[12px] font-bold text-tinta">{labelMes(ano, mes)}</span>
          {conta ? (
            <span
              className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold"
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
          className="flex h-9 w-7 shrink-0 items-center justify-center rounded-lg text-tinta-2 hover:bg-superficie"
        >
          ›
        </button>
      </div>

      {mostrarNovo ? (
        <button
          type="button"
          onClick={aoNovo}
          className="mt-3 rounded-xl bg-accent py-2.5 text-[13px] font-bold text-superficie shadow-neu-sm active:scale-[.99]"
        >
          + Novo lançamento
        </button>
      ) : null}

      {/* abas, todas visíveis de uma vez */}
      <nav className="mt-4 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        {abas.map((a) => (
          <button
            key={a.k}
            type="button"
            onClick={() => aoTrocarAba(a.k)}
            className={cx(
              'rounded-xl px-3 py-2.5 text-left text-[13px] font-bold transition-colors',
              aba === a.k ? 'bg-accent/12 text-accent' : 'text-tinta-2 hover:bg-superficie',
            )}
          >
            {a.l}
          </button>
        ))}
      </nav>

      <div className="mt-3 border-t border-borda/60 pt-3">
        <div className="mb-2 px-1">
          <IndicadorGravacao estado={gravacao} aoTentarNovamente={aoSalvarAgora} />
        </div>
        <div className="flex gap-1.5">
          <BotaoAtualizar aoAvisar={aoAvisar} aoAtualizarDados={aoAtualizarDados} />
          <BotaoIcone rotulo="Ajustes" onClick={aoAjustes}>
            ⚙️
          </BotaoIcone>
          <BotaoIcone rotulo="Bloquear app" onClick={aoSair}>
            🔒
          </BotaoIcone>
        </div>
      </div>
    </aside>
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
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-superficie text-[15px] shadow-neu-xs active:shadow-neu-in-sm"
    >
      {children}
    </button>
  )
}
