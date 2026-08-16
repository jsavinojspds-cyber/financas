import { useMemo } from 'react'
import { Campo, Neu, Vazio, cx } from '@/components/ui'
import { fmtR } from '@/lib/formato'
import { statusDe, totais } from '@/state/seletores'
import type { Conta, Lancamento, TipoLancamento } from '@/types'
import { ItemLancamento } from './ItemLancamento'

const FILTROS = [
  { k: 'todos', l: 'Todos' },
  { k: 'pendente', l: 'Pendentes' },
  { k: 'alerta', l: '⚠ Urgentes' },
  { k: 'vencido', l: 'Vencidos' },
  { k: 'pago', l: 'Pagos' },
] as const

export function ListaLancamentos({
  lista,
  tipo,
  contas,
  mostrarConta,
  filtro,
  setFiltro,
  busca,
  setBusca,
  aoAlternarPago,
  aoEditar,
  aoExcluir,
}: {
  lista: Lancamento[]
  tipo: TipoLancamento
  contas: Conta[]
  mostrarConta: boolean
  filtro: string
  setFiltro: (f: string) => void
  busca: string
  setBusca: (b: string) => void
  aoAlternarPago: (id: string) => void
  aoEditar: (l: Lancamento) => void
  aoExcluir: (id: string) => void
}) {
  const t = useMemo(() => totais(lista), [lista])

  const visiveis = useMemo(() => {
    const alvo = busca.trim().toLowerCase()
    return lista
      .filter((l) => filtro === 'todos' || statusDe(l) === filtro)
      .filter(
        (l) =>
          !alvo ||
          l.nome.toLowerCase().includes(alvo) ||
          l.cat.toLowerCase().includes(alvo),
      )
      .sort((a, b) => a.vencimento.localeCompare(b.vencimento))
  }, [lista, filtro, busca])

  const ehReceita = tipo === 'receita'
  const total = ehReceita ? t.receitas : t.despesas
  const parcial = ehReceita ? t.recebido : t.pago

  // Contagem por filtro para o usuário saber onde há algo antes de tocar.
  const contagens = useMemo(() => {
    const c: Record<string, number> = { todos: lista.length }
    for (const l of lista) {
      const s = statusDe(l)
      c[s] = (c[s] ?? 0) + 1
    }
    return c
  }, [lista])

  return (
    <div className="flex flex-col gap-3">
      <Neu className="p-4">
        <span className="text-[10px] font-bold uppercase tracking-wider text-tinta-3">
          Total de {ehReceita ? 'receitas' : 'despesas'}
        </span>
        <div
          className="mt-0.5 font-mono text-[22px] font-bold"
          style={{ color: ehReceita ? '#10b981' : '#ef4444' }}
        >
          {fmtR(total)}
        </div>
        <div className="mt-0.5 text-[11px] text-tinta-3">
          {ehReceita ? 'Recebido' : 'Pago'}: {fmtR(parcial)}
        </div>
      </Neu>

      <Campo
        type="search"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar por nome ou categoria…"
        aria-label="Buscar lançamentos"
      />

      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {FILTROS.map((f) => (
          <button
            key={f.k}
            type="button"
            onClick={() => setFiltro(f.k)}
            className={cx(
              'shrink-0 rounded-full px-3 py-1.5 text-[12px] font-bold transition-all',
              filtro === f.k
                ? 'bg-accent text-superficie shadow-neu-xs'
                : 'bg-superficie text-tinta-2 shadow-neu-in-sm',
            )}
          >
            {f.l}
            {contagens[f.k] ? (
              <span className="ml-1 opacity-70">{contagens[f.k]}</span>
            ) : null}
          </button>
        ))}
      </div>

      {visiveis.length === 0 ? (
        <Vazio
          icone="🔍"
          titulo="Nada por aqui"
          dica={busca ? 'Tente outro termo de busca' : 'Nenhum item neste filtro'}
        />
      ) : (
        <div>
          {visiveis.map((l) => (
            <ItemLancamento
              key={l.id}
              l={l}
              contas={contas}
              mostrarConta={mostrarConta}
              aoAlternarPago={aoAlternarPago}
              aoEditar={aoEditar}
              aoExcluir={aoExcluir}
            />
          ))}
        </div>
      )}
    </div>
  )
}
