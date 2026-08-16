import { useState } from 'react'
import { Folha, cx } from './ui'
import { MESES_CURTOS } from '@/lib/formato'
import type { Conta } from '@/types'

/**
 * Escolha de mês, ano e conta numa folha só.
 *
 * Substitui duas linhas que viviam abertas no cabeçalho — o mini-calendário
 * de 12 meses e a fileira de contas. São controles usados algumas vezes por
 * sessão, não o tempo todo: não justificavam ocupar permanentemente um terço
 * do espaço vertical.
 */
export function SeletorPeriodo({
  aberto,
  aoFechar,
  ano,
  mes,
  aoEscolher,
  mesesComDados,
  contas,
  contaAtiva,
  aoTrocarConta,
}: {
  aberto: boolean
  aoFechar: () => void
  ano: number
  mes: number
  aoEscolher: (ano: number, mes: number) => void
  /** conjunto de "YYYY-MM" que têm lançamentos, para marcar com ponto */
  mesesComDados: Set<string>
  contas: Conta[]
  contaAtiva: string
  aoTrocarConta: (id: string) => void
}) {
  const [anoVisto, setAnoVisto] = useState(ano)
  const visiveis = contas.filter((c) => !c.arquivada)

  return (
    <Folha aberta={aberto} aoFechar={aoFechar} titulo="Período e conta">
      <div className="flex flex-col gap-5">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setAnoVisto((a) => a - 1)}
              aria-label="Ano anterior"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-superficie text-tinta-2 shadow-neu-xs"
            >
              ‹
            </button>
            <span className="font-mono text-[16px] font-bold text-tinta">{anoVisto}</span>
            <button
              type="button"
              onClick={() => setAnoVisto((a) => a + 1)}
              aria-label="Próximo ano"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-superficie text-tinta-2 shadow-neu-xs"
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {MESES_CURTOS.map((rotulo, i) => {
              const selecionado = anoVisto === ano && i === mes
              const temDados = mesesComDados.has(
                `${anoVisto}-${String(i + 1).padStart(2, '0')}`,
              )
              return (
                <button
                  key={rotulo}
                  type="button"
                  onClick={() => {
                    aoEscolher(anoVisto, i)
                    aoFechar()
                  }}
                  className={cx(
                    'relative rounded-xl py-3 text-[13px] font-bold transition-all',
                    selecionado
                      ? 'bg-accent text-superficie shadow-neu-xs'
                      : 'bg-superficie text-tinta-2 shadow-neu-in-sm',
                  )}
                >
                  {rotulo}
                  {temDados && !selecionado ? (
                    <span className="absolute bottom-1.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-info" />
                  ) : null}
                </button>
              )
            })}
          </div>
        </div>

        {visiveis.length > 1 ? (
          <div>
            <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-tinta-3">
              Conta
            </span>
            <div className="flex flex-col gap-1.5">
              {[{ id: 'todas', nome: 'Todas as contas', cor: '#7c6b9e', icone: '◎' }, ...visiveis].map(
                (c) => {
                  const sel = contaAtiva === c.id
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        aoTrocarConta(c.id)
                        aoFechar()
                      }}
                      className={cx(
                        'flex items-center gap-3 rounded-xl px-3.5 py-3 text-left text-[14px] font-bold transition-all',
                        sel ? 'text-white shadow-neu-xs' : 'bg-superficie text-tinta shadow-neu-in-sm',
                      )}
                      style={sel ? { background: c.cor } : undefined}
                    >
                      <span>{c.icone}</span>
                      <span className="flex-1">{c.nome}</span>
                      {sel ? <span>✓</span> : null}
                    </button>
                  )
                },
              )}
            </div>
          </div>
        ) : null}
      </div>
    </Folha>
  )
}
