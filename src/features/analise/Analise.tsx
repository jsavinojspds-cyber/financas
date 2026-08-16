import { useMemo, useState } from 'react'
import { Barra, Botao, Campo, Confirmar, Folha, Neu, Rotulo, Vazio } from '@/components/ui'
import { fmtR } from '@/lib/formato'
import { COR_CAT, COR_TIPO, ICON_TIPO, type FormaPagamento, type Lancamento } from '@/types'
import { GraficoPizza } from './GraficoPizza'

export function Analise({
  despesas,
  catDespesa,
  aoMudarCategorias,
}: {
  despesas: Lancamento[]
  catDespesa: string[]
  aoMudarCategorias: (cats: string[]) => void
}) {
  const [folhaCat, setFolhaCat] = useState(false)
  const [editando, setEditando] = useState<string | null>(null)
  const [nomeCat, setNomeCat] = useState('')
  const [confirmarRemocao, setConfirmarRemocao] = useState<string | null>(null)

  const total = useMemo(() => despesas.reduce((s, d) => s + Number(d.valor), 0), [despesas])

  const porCategoria = useMemo(() => {
    const m = new Map<string, number>()
    for (const d of despesas) {
      const c = d.cat || 'Outros'
      m.set(c, (m.get(c) ?? 0) + Number(d.valor))
    }
    return [...m.entries()]
      .map(([rotulo, valor]) => ({ rotulo, valor }))
      .sort((a, b) => b.valor - a.valor)
  }, [despesas])

  const porForma = useMemo(() => {
    const m = new Map<string, number>()
    for (const d of despesas) {
      const t = d.tp || 'Dinheiro'
      m.set(t, (m.get(t) ?? 0) + Number(d.valor))
    }
    return [...m.entries()]
      .map(([tp, valor]) => ({ tp: tp as FormaPagamento, valor }))
      .sort((a, b) => b.valor - a.valor)
  }, [despesas])

  /** Quantos lançamentos usam a categoria — evita apagar sem saber o impacto. */
  const usos = useMemo(() => {
    const m = new Map<string, number>()
    for (const d of despesas) m.set(d.cat, (m.get(d.cat) ?? 0) + 1)
    return m
  }, [despesas])

  function salvarCategoria() {
    const nome = nomeCat.trim()
    if (!nome) return
    if (editando) {
      aoMudarCategorias(catDespesa.map((c) => (c === editando ? nome : c)))
    } else if (!catDespesa.includes(nome)) {
      aoMudarCategorias([...catDespesa, nome])
    }
    setFolhaCat(false)
  }

  return (
    <div className="flex flex-col gap-3">
      {despesas.length === 0 ? (
        <Vazio icone="🥧" titulo="Sem despesas para analisar" />
      ) : (
        <>
          <Neu className="p-4" sombra="neu-xs">
            <h3 className="mb-3 text-[13px] font-bold text-tinta">Gastos por categoria</h3>
            <GraficoPizza dados={porCategoria} total={total} />
            <ul className="mt-4 flex flex-col gap-2">
              {porCategoria.map((c, i) => (
                <li key={c.rotulo} className="flex items-center gap-2.5 text-[12px]">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ background: COR_CAT[i % COR_CAT.length] }}
                  />
                  <span className="min-w-0 flex-1 truncate text-tinta">{c.rotulo}</span>
                  <span className="shrink-0 text-tinta-3">
                    {Math.round((c.valor / total) * 100)}%
                  </span>
                  <span className="shrink-0 font-mono font-bold text-tinta">{fmtR(c.valor)}</span>
                </li>
              ))}
            </ul>
          </Neu>

          <Neu className="p-4" sombra="neu-xs">
            <h3 className="mb-3 text-[13px] font-bold text-tinta">Por forma de pagamento</h3>
            <div className="flex flex-col gap-3">
              {porForma.map((f) => (
                <div key={f.tp}>
                  <div className="mb-1.5 flex items-center justify-between text-[12px]">
                    <span className="text-tinta">
                      {ICON_TIPO[f.tp] ?? '💰'} {f.tp}
                    </span>
                    <span className="font-mono font-bold text-tinta">{fmtR(f.valor)}</span>
                  </div>
                  <Barra pct={(f.valor / total) * 100} cor={COR_TIPO[f.tp] ?? '#7c3aed'} />
                </div>
              ))}
            </div>
          </Neu>
        </>
      )}

      {/* gerenciador de categorias */}
      <Neu className="p-4" sombra="neu-xs">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[13px] font-bold text-tinta">Categorias de despesa</h3>
          <Botao
            variante="primario"
            className="!px-3 !py-1.5 !text-[12px]"
            onClick={() => {
              setEditando(null)
              setNomeCat('')
              setFolhaCat(true)
            }}
          >
            + Nova
          </Botao>
        </div>
        <ul className="flex flex-col gap-1.5">
          {catDespesa.map((c) => (
            <li
              key={c}
              className="flex items-center gap-2 rounded-xl bg-fundo px-3 py-2 text-[13px] shadow-neu-in-sm"
            >
              <span className="min-w-0 flex-1 truncate text-tinta">{c}</span>
              {usos.get(c) ? (
                <span className="shrink-0 text-[10px] text-tinta-3">{usos.get(c)} uso(s)</span>
              ) : null}
              <button
                type="button"
                aria-label={`Editar categoria ${c}`}
                onClick={() => {
                  setEditando(c)
                  setNomeCat(c)
                  setFolhaCat(true)
                }}
                className="shrink-0 px-1.5 text-tinta-2"
              >
                ✏️
              </button>
              <button
                type="button"
                aria-label={`Excluir categoria ${c}`}
                onClick={() => setConfirmarRemocao(c)}
                className="shrink-0 px-1.5 text-tinta-2"
              >
                🗑
              </button>
            </li>
          ))}
        </ul>
      </Neu>

      <Folha
        aberta={folhaCat}
        aoFechar={() => setFolhaCat(false)}
        titulo={editando ? 'Editar categoria' : 'Nova categoria'}
        rodape={
          <div className="flex gap-2.5">
            <Botao className="flex-1" onClick={() => setFolhaCat(false)}>
              Cancelar
            </Botao>
            <Botao className="flex-[2]" variante="primario" onClick={salvarCategoria}>
              Salvar
            </Botao>
          </div>
        }
      >
        <Rotulo>Nome da categoria</Rotulo>
        <Campo
          value={nomeCat}
          onChange={(e) => setNomeCat(e.target.value)}
          placeholder="Ex: Transporte"
          autoCapitalize="words"
        />
        {editando ? (
          <p className="mt-2 text-[11px] text-tinta-3">
            Renomear aqui não altera os lançamentos já criados com o nome antigo.
          </p>
        ) : null}
      </Folha>

      <Confirmar
        aberto={confirmarRemocao !== null}
        titulo="Excluir categoria?"
        descricao={
          confirmarRemocao && usos.get(confirmarRemocao)
            ? `${usos.get(confirmarRemocao)} lançamento(s) deste mês usam "${confirmarRemocao}". Eles continuam com essa categoria, mas ela sai da lista de opções.`
            : undefined
        }
        rotuloOk="Excluir"
        perigo
        aoConfirmar={() => {
          if (confirmarRemocao) {
            aoMudarCategorias(catDespesa.filter((c) => c !== confirmarRemocao))
          }
          setConfirmarRemocao(null)
        }}
        aoCancelar={() => setConfirmarRemocao(null)}
      />
    </div>
  )
}
