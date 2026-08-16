import { useEffect, useMemo, useState } from 'react'
import { Botao, Campo, Confirmar, Folha, Neu, Rotulo, Vazio, cx } from '@/components/ui'
import { fmtR } from '@/lib/formato'
import { useLoja } from '@/state/store'
import { idadeTexto } from '@/features/agente/mercado'
import type { Posicao } from '@/types'
import { buscarCotacoes, type Cotacoes } from './cotacoes'
import { mesclar, parsearCarteira } from './importar'

interface Linha extends Posicao {
  preco: number | null
  variacao: number | null
  nome: string
  valor: number | null
  custo: number | null
  resultado: number | null
  pctResultado: number | null
  peso: number
}

const EXEMPLO = `HGLG11 100 145,00
MXRF11 500 9,80
KNRI11 30`

export function Carteira() {
  const { estado, dispatch } = useLoja()
  const [cot, setCot] = useState<Cotacoes | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [folhaImportar, setFolhaImportar] = useState(false)
  const [editando, setEditando] = useState<Posicao | null>(null)
  const [removendo, setRemovendo] = useState<Posicao | null>(null)

  useEffect(() => {
    let vivo = true
    void buscarCotacoes().then((c) => {
      if (!vivo) return
      setCot(c)
      setCarregando(false)
    })
    return () => {
      vivo = false
    }
  }, [])

  const linhas = useMemo<Linha[]>(() => {
    const mapa = cot?.cotacoes ?? {}
    const brutas = estado.carteira.map((p) => {
      const c = mapa[p.ticker]
      const preco = c?.preco ?? null
      const valor = preco !== null ? preco * p.quantidade : null
      const custo = p.precoMedio !== null ? p.precoMedio * p.quantidade : null
      const resultado = valor !== null && custo !== null ? valor - custo : null
      return {
        ...p,
        preco,
        variacao: c?.variacao ?? null,
        nome: c?.nome ?? p.ticker,
        valor,
        custo,
        resultado,
        pctResultado: resultado !== null && custo ? (resultado / custo) * 100 : null,
        peso: 0,
      }
    })
    const total = brutas.reduce((s, l) => s + (l.valor ?? 0), 0)
    return brutas
      .map((l) => ({ ...l, peso: total > 0 && l.valor ? (l.valor / total) * 100 : 0 }))
      .sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0))
  }, [estado.carteira, cot])

  const totais = useMemo(() => {
    let valor = 0
    let custo = 0
    let variacaoDia = 0
    let comPreco = 0
    for (const l of linhas) {
      if (l.valor === null) continue
      comPreco++
      valor += l.valor
      if (l.custo !== null) custo += l.custo
      if (l.variacao !== null) {
        // variação em reais: valor de hoje menos o de ontem
        const ontem = l.valor / (1 + l.variacao / 100)
        variacaoDia += l.valor - ontem
      }
    }
    const resultado = custo > 0 ? valor - custo : null
    return {
      valor,
      custo,
      variacaoDia,
      pctDia: valor - variacaoDia > 0 ? (variacaoDia / (valor - variacaoDia)) * 100 : 0,
      resultado,
      pctResultado: custo > 0 && resultado !== null ? (resultado / custo) * 100 : null,
      semCotacao: linhas.length - comPreco,
    }
  }, [linhas])

  function salvarPosicao(p: Posicao) {
    dispatch({ t: 'carteira', posicoes: mesclar(estado.carteira, [p]) })
    setEditando(null)
  }

  if (!estado.carteira.length) {
    return (
      <div className="flex flex-col gap-3">
        <Vazio
          icone="💼"
          titulo="Nenhum fundo na carteira"
          dica="Adicione ou cole a sua lista para acompanhar a evolução"
        />
        <div className="flex gap-2.5">
          <Botao className="flex-1" variante="primario" onClick={() => setFolhaImportar(true)}>
            📋 Colar lista
          </Botao>
          <Botao
            className="flex-1"
            onClick={() =>
              setEditando({ ticker: '', quantidade: 0, precoMedio: null, updatedAt: Date.now() })
            }
          >
            + Adicionar
          </Botao>
        </div>
        <FolhaImportar
          aberta={folhaImportar}
          aoFechar={() => setFolhaImportar(false)}
          aoImportar={(novas) =>
            dispatch({ t: 'carteira', posicoes: mesclar(estado.carteira, novas) })
          }
        />
        <FolhaPosicao
          posicao={editando}
          aoFechar={() => setEditando(null)}
          aoSalvar={salvarPosicao}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <Neu className="p-4">
        <span className="text-[10px] font-bold uppercase tracking-wider text-tinta-3">
          Valor da carteira
        </span>
        <div className="mt-1 font-mono text-[26px] font-bold text-tinta">{fmtR(totais.valor)}</div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12px]">
          <span
            className="font-mono font-bold"
            style={{ color: totais.variacaoDia >= 0 ? '#10b981' : '#ef4444' }}
          >
            {totais.variacaoDia >= 0 ? '+' : ''}
            {fmtR(totais.variacaoDia)} ({totais.pctDia >= 0 ? '+' : ''}
            {totais.pctDia.toFixed(2)}%) hoje
          </span>
          {totais.resultado !== null ? (
            <span className="text-tinta-3">
              desde a compra:{' '}
              <span
                className="font-mono font-bold"
                style={{ color: totais.resultado >= 0 ? '#10b981' : '#ef4444' }}
              >
                {totais.resultado >= 0 ? '+' : ''}
                {fmtR(totais.resultado)}
                {totais.pctResultado !== null
                  ? ` (${totais.pctResultado >= 0 ? '+' : ''}${totais.pctResultado.toFixed(1)}%)`
                  : ''}
              </span>
            </span>
          ) : null}
        </div>
        {cot ? (
          <p className="mt-2 text-[11px] text-tinta-3">Cotações de {idadeTexto(cot.gerado_em)}</p>
        ) : carregando ? (
          <p className="mt-2 text-[11px] text-tinta-3">Carregando cotações…</p>
        ) : (
          <p className="mt-2 text-[11px] text-tinta-3">Sem cotações — mostrando só as posições.</p>
        )}
      </Neu>

      {totais.semCotacao > 0 ? (
        <div className="rounded-2xl bg-alerta/10 p-3.5 text-[12px] leading-relaxed text-alerta">
          {totais.semCotacao}{' '}
          {totais.semCotacao === 1 ? 'fundo está' : 'fundos estão'} sem cotação. Eles não entram no
          total. Fundos fora da lista publicada precisam ser acrescentados em{' '}
          <code className="font-mono">scripts/universo-fiis.json</code>.
        </div>
      ) : null}

      <div className="flex flex-col gap-2.5">
        {linhas.map((l) => (
          <Neu key={l.ticker} className="p-3.5" sombra="neu-xs">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[14px] font-bold text-tinta">{l.ticker}</span>
                  {l.peso > 0 ? (
                    <span className="shrink-0 rounded-full bg-accent/12 px-1.5 py-0.5 text-[10px] font-bold text-accent">
                      {l.peso.toFixed(1)}%
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 truncate text-[11px] text-tinta-3">
                  {l.quantidade.toLocaleString('pt-BR')} cotas
                  {l.precoMedio !== null ? ` · PM ${fmtR(l.precoMedio)}` : ''}
                </p>
              </div>

              <div className="shrink-0 text-right">
                {l.preco !== null ? (
                  <>
                    <div className="font-mono text-[14px] font-bold text-tinta">
                      {fmtR(l.valor ?? 0)}
                    </div>
                    <div className="mt-0.5 flex items-baseline justify-end gap-1.5 text-[11px]">
                      <span className="font-mono text-tinta-3">{fmtR(l.preco)}</span>
                      {l.variacao !== null ? (
                        <span
                          className="font-mono font-bold"
                          style={{ color: l.variacao >= 0 ? '#10b981' : '#ef4444' }}
                        >
                          {l.variacao >= 0 ? '+' : ''}
                          {l.variacao.toFixed(2)}%
                        </span>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <span className="text-[11px] text-tinta-3">sem cotação</span>
                )}
              </div>
            </div>

            <div className="mt-2.5 flex items-center justify-between border-t border-borda/60 pt-2.5">
              {l.resultado !== null ? (
                <span
                  className="font-mono text-[11px] font-bold"
                  style={{ color: l.resultado >= 0 ? '#10b981' : '#ef4444' }}
                >
                  {l.resultado >= 0 ? '+' : ''}
                  {fmtR(l.resultado)}
                  {l.pctResultado !== null
                    ? ` (${l.pctResultado >= 0 ? '+' : ''}${l.pctResultado.toFixed(1)}%)`
                    : ''}
                </span>
              ) : (
                <span className="text-[11px] text-tinta-3">informe o preço médio</span>
              )}
              <div className="flex gap-1.5">
                <button
                  type="button"
                  aria-label={`Editar ${l.ticker}`}
                  onClick={() => setEditando(l)}
                  className="px-2 py-1 text-[12px] text-tinta-2"
                >
                  ✏️
                </button>
                <button
                  type="button"
                  aria-label={`Remover ${l.ticker}`}
                  onClick={() => setRemovendo(l)}
                  className="px-2 py-1 text-[12px] text-tinta-2"
                >
                  🗑
                </button>
              </div>
            </div>
          </Neu>
        ))}
      </div>

      <div className="flex gap-2.5">
        <Botao className="flex-1" onClick={() => setFolhaImportar(true)}>
          📋 Colar lista
        </Botao>
        <Botao
          className="flex-1"
          variante="primario"
          onClick={() =>
            setEditando({ ticker: '', quantidade: 0, precoMedio: null, updatedAt: Date.now() })
          }
        >
          + Adicionar
        </Botao>
      </div>

      <p className="px-1 text-[11px] leading-relaxed text-tinta-3">
        Cotações de fechamento, atualizadas pela manhã em dias úteis — não são preço em tempo real.
        Quantidades e preços médios ficam só neste aparelho. Acompanhamento, não recomendação de
        investimento.
      </p>

      <FolhaImportar
        aberta={folhaImportar}
        aoFechar={() => setFolhaImportar(false)}
        aoImportar={(novas) =>
          dispatch({ t: 'carteira', posicoes: mesclar(estado.carteira, novas) })
        }
      />
      <FolhaPosicao
        posicao={editando}
        aoFechar={() => setEditando(null)}
        aoSalvar={salvarPosicao}
      />
      <Confirmar
        aberto={removendo !== null}
        titulo="Remover da carteira?"
        descricao={removendo ? `${removendo.ticker} deixará de ser acompanhado.` : undefined}
        rotuloOk="Remover"
        perigo
        aoConfirmar={() => {
          if (removendo) {
            dispatch({
              t: 'carteira',
              posicoes: estado.carteira.filter((p) => p.ticker !== removendo.ticker),
            })
          }
          setRemovendo(null)
        }}
        aoCancelar={() => setRemovendo(null)}
      />
    </div>
  )
}

function FolhaImportar({
  aberta,
  aoFechar,
  aoImportar,
}: {
  aberta: boolean
  aoFechar: () => void
  aoImportar: (linhas: ReturnType<typeof parsearCarteira>['posicoes']) => void
}) {
  const [texto, setTexto] = useState('')
  const previa = useMemo(() => (texto.trim() ? parsearCarteira(texto) : null), [texto])

  return (
    <Folha
      aberta={aberta}
      aoFechar={() => {
        setTexto('')
        aoFechar()
      }}
      titulo="Colar carteira"
      rodape={
        <div className="flex gap-2.5">
          <Botao
            className="flex-1"
            onClick={() => {
              setTexto('')
              aoFechar()
            }}
          >
            Cancelar
          </Botao>
          <Botao
            className="flex-[2]"
            variante="primario"
            disabled={!previa?.posicoes.length}
            onClick={() => {
              if (previa?.posicoes.length) aoImportar(previa.posicoes)
              setTexto('')
              aoFechar()
            }}
          >
            Importar {previa?.posicoes.length || ''}
          </Botao>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-[12px] leading-relaxed text-tinta-2">
          Uma linha por fundo: <strong>código, quantidade</strong> e, se quiser, o{' '}
          <strong>preço médio</strong>. Serve o que você copiar do extrato da corretora — cabeçalho
          e texto solto são ignorados.
        </p>

        <div>
          <Rotulo>Sua lista</Rotulo>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={EXEMPLO}
            rows={7}
            className="w-full resize-y px-3.5 py-3 font-mono text-[13px] leading-relaxed text-tinta"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>

        {previa ? (
          <Neu className="p-3.5" sombra="neu-in">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-tinta-3">
              Prévia — {previa.posicoes.length} reconhecido(s)
            </h4>
            {previa.posicoes.length ? (
              <ul className="mt-1.5 flex flex-col gap-0.5">
                {previa.posicoes.map((p, i) => (
                  <li key={`${p.ticker}${i}`} className="flex justify-between font-mono text-[12px]">
                    <span className="text-tinta">{p.ticker}</span>
                    <span className="text-tinta-2">
                      {p.quantidade.toLocaleString('pt-BR')} cotas
                      {p.precoMedio !== null ? ` · ${fmtR(p.precoMedio)}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-[12px] text-despesa">
                Nenhum código reconhecido. O formato esperado é XXXX11 seguido da quantidade.
              </p>
            )}
            {previa.ignoradas.length ? (
              <p className="mt-2 text-[11px] text-tinta-3">
                {previa.ignoradas.length} linha(s) ignorada(s).
              </p>
            ) : null}
          </Neu>
        ) : null}

        <p className="text-[11px] leading-relaxed text-tinta-3">
          Importar de novo um código já existente <strong>substitui</strong> a posição, não soma.
        </p>
      </div>
    </Folha>
  )
}

function FolhaPosicao({
  posicao,
  aoFechar,
  aoSalvar,
}: {
  posicao: Posicao | null
  aoFechar: () => void
  aoSalvar: (p: Posicao) => void
}) {
  const [ticker, setTicker] = useState('')
  const [qtd, setQtd] = useState('')
  const [pm, setPm] = useState('')

  useEffect(() => {
    if (!posicao) return
    setTicker(posicao.ticker)
    setQtd(posicao.quantidade ? String(posicao.quantidade) : '')
    setPm(posicao.precoMedio !== null ? String(posicao.precoMedio) : '')
  }, [posicao])

  const tickerOk = /^[A-Z]{4}\d{2}$/.test(ticker.toUpperCase())
  const qtdNum = Number(qtd.replace(',', '.'))
  const qtdOk = Number.isFinite(qtdNum) && qtdNum > 0
  const pmNum = pm.trim() ? Number(pm.replace(',', '.')) : null

  return (
    <Folha
      aberta={posicao !== null}
      aoFechar={aoFechar}
      titulo={posicao?.ticker ? `Editar ${posicao.ticker}` : 'Adicionar fundo'}
      rodape={
        <div className="flex gap-2.5">
          <Botao className="flex-1" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            className="flex-[2]"
            variante="primario"
            disabled={!tickerOk || !qtdOk}
            onClick={() =>
              aoSalvar({
                ticker: ticker.toUpperCase(),
                quantidade: qtdNum,
                precoMedio: pmNum !== null && Number.isFinite(pmNum) && pmNum > 0 ? pmNum : null,
                updatedAt: Date.now(),
              })
            }
          >
            Salvar
          </Botao>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <Rotulo>Código</Rotulo>
          <Campo
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase().slice(0, 6))}
            placeholder="HGLG11"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className={cx('font-mono uppercase', ticker && !tickerOk && 'text-despesa')}
          />
        </div>
        <div>
          <Rotulo>Quantidade de cotas</Rotulo>
          <Campo
            value={qtd}
            onChange={(e) => setQtd(e.target.value)}
            inputMode="decimal"
            placeholder="100"
            className="font-mono"
          />
        </div>
        <div>
          <Rotulo>Preço médio (opcional)</Rotulo>
          <Campo
            value={pm}
            onChange={(e) => setPm(e.target.value)}
            inputMode="decimal"
            placeholder="145,00"
            className="font-mono"
          />
          <p className="mt-1.5 text-[11px] text-tinta-3">
            Sem ele o app mostra a variação do dia, mas não a rentabilidade desde a compra.
          </p>
        </div>
      </div>
    </Folha>
  )
}
