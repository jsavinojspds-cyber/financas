import { useMemo, useRef, useState } from 'react'
import { Neu } from '@/components/ui'
import { fmtR, labelMes } from '@/lib/formato'
import { novoId } from '@/lib/id'
import { ocorreEm, somarMeses } from '@/lib/recorrencia'
import type { EstadoApp, ItemPlanejamento, TipoLancamento } from '@/types'

interface Linha {
  id: string
  nome: string
  tl: TipoLancamento
  conta: string
  valores: Record<string, number>
  origem: 'lançamento' | 'fixo' | 'cartão' | 'manual'
}

function linhasDoPlano(estado: EstadoApp, meses: string[]): Linha[] {
  const mapa = new Map<string, Linha>()
  const incluir = (id: string, nome: string, tl: TipoLancamento, conta: string, mes: string, valor: number, origem: Linha['origem']) => {
    const linha = mapa.get(id) ?? { id, nome, tl, conta, valores: {}, origem }
    linha.valores[mes] = (linha.valores[mes] ?? 0) + valor
    mapa.set(id, linha)
  }

  for (const mes of meses) {
    const lancamentos = estado.lancamentos[mes] ?? []
    for (const l of lancamentos) incluir(l.recorrenciaId ? `r:${l.recorrenciaId}` : `l:${l.id}`, l.nome, l.tl, l.conta, mes, l.valor, l.recorrenciaId ? 'fixo' : 'lançamento')
    for (const r of estado.recorrencias) {
      if (ocorreEm(r, mes) && !lancamentos.some((l) => l.recorrenciaId === r.id)) incluir(`r:${r.id}`, r.nome, r.tl, r.conta, mes, r.valor, 'fixo')
    }
  }

  // A fatura mais recente de cada cartão contém o estágio atual das parcelas.
  // Faturas anteriores repetem as mesmas compras e não entram de novo.
  const recentes = new Map<string, EstadoApp['faturasCartao'][number]>()
  for (const f of estado.faturasCartao) {
    const chave = f.cartao.toLowerCase()
    if (!recentes.has(chave) || recentes.get(chave)!.mes < f.mes) recentes.set(chave, f)
  }
  for (const f of recentes.values()) {
    for (const g of f.gastos) {
      const parcela = g.descricao.match(/\b(\d{1,2})\s*\/\s*(\d{1,2})\b/)
      if (!parcela || g.valor <= 0) continue
      const atual = Number(parcela[1]); const total = Number(parcela[2])
      if (atual < 1 || total <= atual || total > 48) continue
      const nome = g.descricao.replace(/\s*\b\d{1,2}\s*\/\s*\d{1,2}\b/, '').trim()
      for (let n = 1; n <= total - atual; n++) {
        const mes = somarMeses(f.mes, n)
        if (meses.includes(mes)) incluir(`c:${f.id}:${g.id}`, `${nome} (${f.cartao})`, 'despesa', 'cartao', mes, g.valor, 'cartão')
      }
    }
  }
  for (const item of estado.planejamento.itens) {
    if (meses.includes(item.mes)) incluir(`m:${item.id}`, item.nome, item.tl, item.conta, item.mes, item.valor, 'manual')
  }
  return [...mapa.values()].sort((a, b) => a.conta.localeCompare(b.conta, 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR'))
}

function CampoValor({ valor, aoSalvar, titulo }: { valor?: number; aoSalvar: (valor: number | null) => void; titulo: string }) {
  const [texto, setTexto] = useState(valor === undefined ? '' : String(valor))
  const [foco, setFoco] = useState(false)
  const exibir = foco ? texto : valor === undefined ? '' : String(valor)
  function salvar() {
    setFoco(false)
    if (!texto.trim()) { aoSalvar(null); return }
    const n = Number(texto.replace(',', '.'))
    if (Number.isFinite(n) && n >= 0) aoSalvar(Math.round(n * 100) / 100)
    else setTexto(valor === undefined ? '' : String(valor))
  }
  return <input aria-label={titulo} type="text" inputMode="decimal" value={exibir} onFocus={() => { setTexto(valor === undefined ? '' : String(valor)); setFoco(true) }} onChange={(e) => setTexto(e.target.value)} onBlur={salvar} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} className="w-[76px] rounded-lg bg-fundo px-1.5 py-1.5 text-right font-mono text-[11px] text-tinta shadow-neu-in-sm" />
}

function CampoNome({ nome, aoSalvar }: { nome: string; aoSalvar: (nome: string) => void }) {
  const [texto, setTexto] = useState(nome)
  const [foco, setFoco] = useState(false)
  return <input aria-label={`Editar descrição: ${nome}`} title={nome} value={foco ? texto : nome} onFocus={() => { setTexto(nome); setFoco(true) }} onChange={(e) => setTexto(e.target.value)} onBlur={() => { setFoco(false); if (texto.trim() && texto.trim() !== nome) aoSalvar(texto.trim()) }} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} className="block w-full min-w-0 truncate rounded-md bg-fundo px-1 py-1.5 text-[11px] font-semibold text-tinta shadow-neu-in-sm" />
}

export function Planejamento({ estado, inicio, aoAjustar, aoAdicionar, aoRenomear, aoOcultar }: {
  estado: EstadoApp
  inicio: string
  aoAjustar: (chave: string, valor: number | null) => void
  aoAdicionar: (item: ItemPlanejamento) => void
  aoRenomear: (id: string, nome: string) => void
  aoOcultar: (id: string, ocultar: boolean) => void
}) {
  const [primeiroMes, setPrimeiroMes] = useState(inicio)
  const [nome, setNome] = useState('')
  const [valor, setValor] = useState('')
  const [tipo, setTipo] = useState<TipoLancamento>('despesa')
  const [conta, setConta] = useState(estado.contas[0]?.id ?? 'pf')
  const [mesNovo, setMesNovo] = useState(inicio)
  const meses = useMemo(() => Array.from({ length: 13 }, (_, i) => somarMeses(primeiroMes, i)), [primeiroMes])
  const receitaRef = useRef<HTMLDivElement>(null)
  const despesaRef = useRef<HTMLDivElement>(null)
  const resumoRef = useRef<HTMLDivElement>(null)
  const todasLinhas = useMemo(() => linhasDoPlano(estado, meses), [estado, meses])
  const linhas = todasLinhas.filter((l) => !estado.planejamento.ocultos.includes(l.id))
  const ocultas = todasLinhas.filter((l) => estado.planejamento.ocultos.includes(l.id))
  const valorExibido = (linha: Linha, mes: string) => estado.planejamento.ajustes[`${linha.id}:${mes}`] ?? linha.valores[mes]
  const valorDa = (linha: Linha, mes: string) => valorExibido(linha, mes) ?? 0
  const totais = meses.map((mes) => ({
    mes,
    receitas: linhas.filter((l) => l.tl === 'receita').reduce((s, l) => s + valorDa(l, mes), 0),
    despesas: linhas.filter((l) => l.tl === 'despesa').reduce((s, l) => s + valorDa(l, mes), 0),
  }))
  const soma = totais.reduce((a, t) => ({ receitas: a.receitas + t.receitas, despesas: a.despesas + t.despesas }), { receitas: 0, despesas: 0 })
  const rotuloCurto = (mes: string) => `${mes.slice(5)}/${mes.slice(2, 4)}`
  const larguraTabela = 128 + meses.length * 92
  const blocos = [0, 4, 7, 10]
  function irParaMes(indice: number) {
    for (const ref of [receitaRef, despesaRef, resumoRef]) ref.current?.scrollTo({ left: indice * 92, behavior: 'smooth' })
  }

  function adicionar() {
    const numero = Number(valor.replace(',', '.'))
    if (!nome.trim() || !Number.isFinite(numero) || numero < 0 || !meses.includes(mesNovo)) return
    aoAdicionar({ id: novoId(), nome: nome.trim(), valor: Math.round(numero * 100) / 100, tl: tipo, conta, mes: mesNovo })
    setNome(''); setValor('')
  }

  const tabela = (tipoLinha: TipoLancamento) => {
    const escolhidas = linhas.filter((l) => l.tl === tipoLinha)
    const titulo = tipoLinha === 'receita' ? 'Receitas' : 'Despesas'
    return <section className="space-y-2">
      <h3 className="font-bold text-tinta">{titulo}</h3>
      <div ref={tipoLinha === 'receita' ? receitaRef : despesaRef} className="overflow-x-auto overscroll-x-contain">
        <table style={{ width: larguraTabela }} className="table-fixed border-collapse text-xs">
          <colgroup><col className="w-[128px]" />{meses.map((mes) => <col key={mes} className="w-[92px]" />)}</colgroup>
          <thead><tr><th className="sticky left-0 z-10 bg-superficie px-1.5 py-2 text-left">Descrição</th>{meses.map((mes) => <th key={mes} className="px-1 py-2 text-right">{rotuloCurto(mes)}</th>)}</tr></thead>
          <tbody>{escolhidas.map((linha) => {
            const nomeExibido = estado.planejamento.nomes[linha.id] || linha.nome
            return <tr key={linha.id} className="border-t border-borda/60">
              <td className="sticky left-0 z-10 bg-superficie px-1 py-1">
                <div className="flex items-center gap-0.5">
                  <CampoNome nome={nomeExibido} aoSalvar={(nome) => aoRenomear(linha.id, nome)} />
                  <button type="button" aria-label={`Excluir ${nomeExibido} do planejamento`} title="Excluir do plano" onClick={() => aoOcultar(linha.id, true)} className="flex h-7 w-5 shrink-0 items-center justify-center text-sm text-despesa">×</button>
                </div>
              </td>
              {meses.map((mes) => <td key={mes} className="px-0.5 py-1 text-right"><CampoValor titulo={`${nomeExibido} em ${mes}`} valor={valorExibido(linha, mes)} aoSalvar={(v) => aoAjustar(`${linha.id}:${mes}`, v)} /></td>)}
            </tr>
          })}</tbody>
          <tfoot><tr className="border-t border-borda font-bold"><td className="sticky left-0 bg-superficie px-1.5 py-2">Total {titulo.toLowerCase()}</td>{totais.map((t) => <td key={t.mes} className={`px-1 py-2 text-right ${tipoLinha === 'receita' ? 'text-receita' : 'text-despesa'}`}>{fmtR(tipoLinha === 'receita' ? t.receitas : t.despesas)}</td>)}</tr></tfoot>
        </table>
      </div>
      {!escolhidas.length ? <p className="text-xs text-tinta-3">Nenhuma {tipoLinha === 'receita' ? 'receita' : 'despesa'} prevista. Adicione uma abaixo.</p> : null}
    </section>
  }

  return <div className="space-y-4">
    <div><h2 className="text-xl font-bold text-tinta">Planejamento</h2><p className="mt-1 text-xs text-tinta-3">Edite descrições e valores ou exclua linhas do plano. O histórico original permanece.</p></div>
    <Neu className="p-4"><label className="text-xs font-semibold text-tinta-2">Primeiro mês <input type="month" value={primeiroMes} onChange={(e) => { if (/^\d{4}-\d{2}$/.test(e.target.value)) { setPrimeiroMes(e.target.value); setMesNovo(e.target.value); irParaMes(0) } }} className="ml-2 rounded-lg bg-fundo px-2 py-2 text-tinta" /></label><p className="mt-2 text-xs text-tinta-3">Planejamento de 13 meses. Lançamentos futuros, contas fixas e parcelas identificadas entram como previsão.</p><div className="mt-3 flex flex-wrap gap-1.5">{blocos.map((indice, i) => <button key={indice} type="button" onClick={() => irParaMes(indice)} className="rounded-lg bg-fundo px-2.5 py-1.5 text-[11px] font-semibold text-accent shadow-neu-xs">{rotuloCurto(meses[indice]!)}–{rotuloCurto(meses[blocos[i + 1] ? blocos[i + 1]! - 1 : meses.length - 1]!)}</button>)}</div></Neu>
    <Neu className="space-y-5 p-4">{tabela('receita')}{tabela('despesa')}</Neu>
    {ocultas.length ? <Neu className="p-4"><details><summary className="cursor-pointer text-xs font-semibold text-tinta-2">Itens excluídos do plano ({ocultas.length})</summary><div className="mt-3 space-y-2">{ocultas.map((linha) => <div key={linha.id} className="flex items-center justify-between gap-2 border-b border-borda/60 py-1 text-xs"><span className="truncate">{estado.planejamento.nomes[linha.id] || linha.nome}</span><button type="button" onClick={() => aoOcultar(linha.id, false)} className="shrink-0 font-semibold text-accent">Restaurar</button></div>)}</div></details></Neu> : null}
    <Neu className="space-y-3 p-4"><h3 className="font-bold text-tinta">Adicionar ao plano</h3><div className="grid grid-cols-2 gap-2 sm:grid-cols-5"><select aria-label="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoLancamento)} className="rounded-lg bg-fundo px-2 py-2 text-xs text-tinta"><option value="receita">Receita</option><option value="despesa">Despesa</option></select><select aria-label="Conta" value={conta} onChange={(e) => setConta(e.target.value)} className="rounded-lg bg-fundo px-2 py-2 text-xs text-tinta">{estado.contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}<option value="cartao">Cartão de crédito</option></select><select aria-label="Mês" value={mesNovo} onChange={(e) => setMesNovo(e.target.value)} className="rounded-lg bg-fundo px-2 py-2 text-xs text-tinta">{meses.map((mes) => <option key={mes} value={mes}>{labelMes(Number(mes.slice(0, 4)), Number(mes.slice(5)) - 1)}</option>)}</select><input aria-label="Descrição" placeholder="Descrição" value={nome} onChange={(e) => setNome(e.target.value)} className="rounded-lg bg-fundo px-2 py-2 text-xs text-tinta" /><input aria-label="Valor" placeholder="Valor" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} className="rounded-lg bg-fundo px-2 py-2 text-xs text-tinta" /></div><button type="button" onClick={adicionar} className="rounded-lg bg-accent px-4 py-2 text-xs font-bold text-white">+ Adicionar</button></Neu>
    <Neu className="space-y-3 p-4"><h3 className="font-bold text-tinta">Resultado mês a mês</h3><div ref={resumoRef} className="overflow-x-auto overscroll-x-contain"><table style={{ width: larguraTabela }} className="table-fixed text-[11px]"><colgroup><col className="w-[128px]" />{meses.map((mes) => <col key={mes} className="w-[92px]" />)}</colgroup><thead><tr><th className="sticky left-0 bg-superficie p-2 text-left"> </th>{totais.map((t) => <th key={t.mes} className="p-1 text-right">{rotuloCurto(t.mes)}</th>)}</tr></thead><tbody><tr><td className="sticky left-0 bg-superficie p-2">Receitas</td>{totais.map((t) => <td key={t.mes} className="p-1 text-right text-receita">{fmtR(t.receitas)}</td>)}</tr><tr><td className="sticky left-0 bg-superficie p-2">Despesas</td>{totais.map((t) => <td key={t.mes} className="p-1 text-right text-despesa">{fmtR(t.despesas)}</td>)}</tr><tr className="border-t border-borda font-bold"><td className="sticky left-0 bg-superficie p-2">Crédito / débito</td>{totais.map((t) => <td key={t.mes} className={`p-1 text-right ${t.receitas >= t.despesas ? 'text-receita' : 'text-despesa'}`}>{fmtR(t.receitas - t.despesas)}</td>)}</tr></tbody></table></div><div className="border-t border-borda pt-3 text-xs"><p>13 meses · Receitas: <strong>{fmtR(soma.receitas)}</strong> · Despesas: <strong>{fmtR(soma.despesas)}</strong></p><p className={`mt-1 font-bold ${soma.receitas >= soma.despesas ? 'text-receita' : 'text-despesa'}`}>Saldo acumulado: {fmtR(soma.receitas - soma.despesas)}</p></div></Neu>
  </div>
}
