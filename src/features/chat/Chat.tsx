import { useEffect, useRef, useState } from 'react'
import { Botao, Neu, cx } from '@/components/ui'
import { fmtD, fmtR, hoje } from '@/lib/formato'
import { novoId } from '@/lib/id'
import { useLoja } from '@/state/store'
import { ICON_TIPO, type Lancamento } from '@/types'
import { interpretar, type Intencao, type Rascunho } from './interpretar'

interface Mensagem {
  id: string
  de: 'voce' | 'app'
  texto?: string
  intencao?: Intencao
  /** vira true depois que a ação do cartão foi executada */
  resolvida?: boolean
}

const EXEMPLOS = ['energia 78,08', 'pix mercado 250', 'quanto falta pagar', 'apagar vivo']

export function Chat({
  mesChave,
  aoAvisar,
}: {
  mesChave: string
  aoAvisar: (msg: string, acao?: { rotulo: string; fn: () => void }) => void
}) {
  const { estado, dispatch } = useLoja()
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [entrada, setEntrada] = useState('')
  const fim = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [mensagens])

  function responder(texto: string) {
    const limpo = texto.trim()
    if (!limpo) return
    const intencao = interpretar(limpo, estado, mesChave)
    setMensagens((m) => [
      ...m,
      { id: novoId(), de: 'voce', texto: limpo },
      { id: novoId(), de: 'app', intencao },
    ])
    setEntrada('')
  }

  function marcarResolvida(id: string) {
    setMensagens((m) => m.map((x) => (x.id === id ? { ...x, resolvida: true } : x)))
  }

  function adicionar(r: Rascunho, idMsg: string) {
    const mes = r.vencimento.slice(0, 7)
    const anterior = estado.lancamentos[mes] ?? []
    const novo: Lancamento = {
      id: novoId(),
      tl: r.tl,
      nome: r.nome,
      valor: r.valor,
      vencimento: r.vencimento,
      tp: r.tp,
      cat: r.cat,
      pago: r.pago,
      data_pgto: r.pago ? r.vencimento : null,
      conta:
        estado.config.contaAtiva === 'todas'
          ? (estado.contas[0]?.id ?? 'pf')
          : estado.config.contaAtiva,
      recorrenciaId: null,
      updatedAt: Date.now(),
    }
    dispatch({ t: 'inserir', mes, itens: [novo] })
    marcarResolvida(idMsg)
    aoAvisar(`"${novo.nome}" adicionado`, {
      rotulo: 'Desfazer',
      fn: () => dispatch({ t: 'repor-mes', mes, itens: anterior }),
    })
  }

  function excluir(l: Lancamento, idMsg: string) {
    const mes = l.vencimento.slice(0, 7)
    // O lançamento pode estar num bucket diferente do vencimento (fatura de
    // cartão), então procuramos o mês real antes de remover.
    const mesReal =
      Object.keys(estado.lancamentos).find((k) =>
        (estado.lancamentos[k] ?? []).some((x) => x.id === l.id),
      ) ?? mes
    const anterior = estado.lancamentos[mesReal] ?? []
    dispatch({ t: 'remover', mes: mesReal, id: l.id })
    marcarResolvida(idMsg)
    aoAvisar(`"${l.nome}" excluído`, {
      rotulo: 'Desfazer',
      fn: () => dispatch({ t: 'repor-mes', mes: mesReal, itens: anterior }),
    })
  }

  function pagar(l: Lancamento, idMsg: string) {
    const mesReal =
      Object.keys(estado.lancamentos).find((k) =>
        (estado.lancamentos[k] ?? []).some((x) => x.id === l.id),
      ) ?? l.vencimento.slice(0, 7)
    dispatch({ t: 'alternar-pago', mes: mesReal, id: l.id, hoje: hoje() })
    marcarResolvida(idMsg)
    aoAvisar(`"${l.nome}" marcado como pago`, {
      rotulo: 'Desfazer',
      fn: () => dispatch({ t: 'alternar-pago', mes: mesReal, id: l.id, hoje: hoje() }),
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {mensagens.length === 0 ? (
        <Neu className="p-4" sombra="neu-xs">
          <h3 className="text-[13px] font-bold text-tinta">💬 Comandos rápidos</h3>
          <p className="mt-1 text-[12px] leading-relaxed text-tinta-2">
            Digite naturalmente. Com valor, vira lançamento; sem valor, vira busca.
          </p>
          <ul className="mt-3 flex flex-col gap-1.5 text-[12px] text-tinta-2">
            <li>
              <code className="font-mono text-accent">energia 78,08</code> — lança a despesa
            </li>
            <li>
              <code className="font-mono text-accent">pix mercado 250 dia 15</code> — com forma e
              vencimento
            </li>
            <li>
              <code className="font-mono text-accent">+ salário 21620</code> — receita
            </li>
            <li>
              <code className="font-mono text-accent">apagar vivo</code> ·{' '}
              <code className="font-mono text-accent">pagar drogasil</code>
            </li>
            <li>
              <code className="font-mono text-accent">quanto falta pagar</code> ·{' '}
              <code className="font-mono text-accent">vencendo</code>
            </li>
          </ul>
          <p className="mt-3 text-[11px] leading-relaxed text-tinta-3">
            Tudo é interpretado no próprio aparelho: funciona offline, é instantâneo e nenhum
            lançamento seu sai daqui.
          </p>
        </Neu>
      ) : null}

      <div className="flex flex-col gap-2.5">
        {mensagens.map((m) =>
          m.de === 'voce' ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-accent px-3.5 py-2 text-[13px] font-semibold text-superficie">
                {m.texto}
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex justify-start">
              <div className="w-full max-w-[92%]">
                <Resposta
                  intencao={m.intencao as Intencao}
                  resolvida={!!m.resolvida}
                  aoAdicionar={(r) => adicionar(r, m.id)}
                  aoExcluir={(l) => excluir(l, m.id)}
                  aoPagar={(l) => pagar(l, m.id)}
                />
              </div>
            </div>
          ),
        )}
        <div ref={fim} />
      </div>

      {mensagens.length === 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {EXEMPLOS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => responder(e)}
              className="rounded-full bg-superficie px-3 py-1.5 font-mono text-[11px] text-tinta-2 shadow-neu-xs"
            >
              {e}
            </button>
          ))}
        </div>
      ) : null}

      <form
        className="sticky bottom-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          responder(entrada)
        }}
      >
        <input
          value={entrada}
          onChange={(e) => setEntrada(e.target.value)}
          placeholder="energia 78,08"
          // enterKeyHint muda o rótulo da tecla no teclado do iOS
          enterKeyHint="send"
          autoCapitalize="sentences"
          autoCorrect="off"
          className="flex-1 px-3.5 py-3 text-tinta"
          aria-label="Comando"
        />
        <Botao type="submit" variante="primario" disabled={!entrada.trim()} className="!px-4">
          ↑
        </Botao>
      </form>
    </div>
  )
}

function Resposta({
  intencao,
  resolvida,
  aoAdicionar,
  aoExcluir,
  aoPagar,
}: {
  intencao: Intencao
  resolvida: boolean
  aoAdicionar: (r: Rascunho) => void
  aoExcluir: (l: Lancamento) => void
  aoPagar: (l: Lancamento) => void
}) {
  const bolha = 'rounded-2xl rounded-bl-md bg-superficie p-3.5 shadow-neu-xs'

  if (intencao.t === 'ajuda' || intencao.t === 'vazio') {
    return (
      <div className={bolha}>
        <p className="text-[13px] text-tinta">
          Escreva o nome e o valor para lançar (<code className="font-mono">energia 78</code>), ou
          só o nome para buscar. Use <code className="font-mono">apagar</code>,{' '}
          <code className="font-mono">pagar</code> e{' '}
          <code className="font-mono">quanto…</code> para o resto.
        </p>
      </div>
    )
  }

  if (intencao.t === 'adicionar') {
    const r = intencao.rascunho
    return (
      <div className={bolha}>
        {resolvida ? (
          <p className="text-[13px] font-bold text-receita">✓ Lançado</p>
        ) : (
          <p className="text-[12px] text-tinta-2">Entendi assim:</p>
        )}
        <div className="mt-2 flex items-baseline justify-between gap-3">
          <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-tinta">{r.nome}</span>
          <span
            className="shrink-0 font-mono text-[15px] font-bold"
            style={{ color: r.tl === 'receita' ? '#10b981' : '#ef4444' }}
          >
            {r.tl === 'receita' ? '+' : '−'}
            {fmtR(r.valor)}
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-tinta-3">
          <span>
            {ICON_TIPO[r.tp]} {r.tp}
          </span>
          <span>·</span>
          <span>{r.cat}</span>
          {r.origemCat === 'historico' ? (
            <span className="rounded-full bg-accent/12 px-1.5 py-0.5 text-[10px] font-bold text-accent">
              como das outras vezes
            </span>
          ) : null}
          <span>·</span>
          <span>{fmtD(r.vencimento)}</span>
          {r.pago ? <span className="font-bold text-receita">pago</span> : null}
        </div>
        {!resolvida ? (
          <Botao variante="primario" className="mt-3 w-full" onClick={() => aoAdicionar(r)}>
            Adicionar
          </Botao>
        ) : null}
      </div>
    )
  }

  if (intencao.t === 'excluir' || intencao.t === 'pagar') {
    const acaoExcluir = intencao.t === 'excluir'
    if (!intencao.candidatos.length) {
      return (
        <div className={bolha}>
          <p className="text-[13px] text-tinta">
            Não achei {acaoExcluir ? '' : 'nada em aberto '}com &ldquo;{intencao.termo}&rdquo;.
          </p>
        </div>
      )
    }
    return (
      <div className={bolha}>
        <p className="text-[12px] text-tinta-2">
          {resolvida
            ? acaoExcluir
              ? '✓ Excluído'
              : '✓ Marcado como pago'
            : intencao.candidatos.length === 1
              ? `Toque para ${acaoExcluir ? 'excluir' : 'marcar como pago'}:`
              : `${intencao.candidatos.length} encontrados — toque no certo:`}
        </p>
        {!resolvida ? (
          <ul className="mt-2 flex flex-col gap-1.5">
            {intencao.candidatos.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => (acaoExcluir ? aoExcluir(l) : aoPagar(l))}
                  className={cx(
                    'flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left shadow-neu-in-sm active:shadow-neu-xs',
                    acaoExcluir ? 'text-despesa' : 'text-receita',
                  )}
                >
                  <span className="shrink-0 text-[13px]">{acaoExcluir ? '🗑' : '✓'}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-tinta">
                    {l.nome}
                  </span>
                  <span className="shrink-0 text-[10px] text-tinta-3">{fmtD(l.vencimento)}</span>
                  <span className="shrink-0 font-mono text-[12px] font-bold text-tinta">
                    {fmtR(l.valor)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    )
  }

  if (intencao.t === 'total') {
    return (
      <div className={bolha}>
        <p className="text-[11px] font-bold uppercase tracking-wider text-tinta-3">
          {intencao.rotulo}
        </p>
        <p className="mt-0.5 font-mono text-[20px] font-bold text-tinta">{fmtR(intencao.valor)}</p>
        {intencao.itens.length ? (
          <ul className="mt-2.5 flex flex-col gap-1 border-t border-borda/60 pt-2.5">
            {intencao.itens.slice(0, 8).map((l) => (
              <li key={l.id} className="flex items-baseline justify-between gap-2 text-[12px]">
                <span className="min-w-0 flex-1 truncate text-tinta">{l.nome}</span>
                <span className="shrink-0 text-[10px] text-tinta-3">{fmtD(l.vencimento)}</span>
                <span className="shrink-0 font-mono text-tinta-2">{fmtR(l.valor)}</span>
              </li>
            ))}
            {intencao.itens.length > 8 ? (
              <li className="text-[11px] text-tinta-3">
                e mais {intencao.itens.length - 8}…
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
    )
  }

  // busca
  if (!intencao.resultados.length) {
    return (
      <div className={bolha}>
        <p className="text-[13px] text-tinta">
          Nada com &ldquo;{intencao.termo}&rdquo;. Para lançar, inclua o valor:{' '}
          <code className="font-mono text-accent">{intencao.termo} 100</code>
        </p>
      </div>
    )
  }
  return (
    <div className={bolha}>
      <p className="text-[12px] text-tinta-2">
        {intencao.resultados.length} resultado(s) para &ldquo;{intencao.termo}&rdquo;
      </p>
      <ul className="mt-2 flex flex-col gap-1">
        {intencao.resultados.map((l) => (
          <li key={l.id} className="flex items-baseline justify-between gap-2 text-[12px]">
            <span className="min-w-0 flex-1 truncate text-tinta">
              {l.pago ? '✓ ' : ''}
              {l.nome}
            </span>
            <span className="shrink-0 text-[10px] text-tinta-3">{fmtD(l.vencimento)}</span>
            <span
              className="shrink-0 font-mono font-bold"
              style={{ color: l.tl === 'receita' ? '#10b981' : '#ef4444' }}
            >
              {fmtR(l.valor)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
