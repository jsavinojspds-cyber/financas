import { useMemo, useState } from 'react'
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

function CampoValor({ valor, aoSalvar, titulo }: { valor: number; aoSalvar: (valor: number) => void; titulo: string }) {
  const [texto, setTexto] = useState(String(valor))
  const [foco, setFoco] = useState(false)
  const exibir = foco ? texto : String(valor)
  function salvar() {
    setFoco(false)
    const n = Number(texto.replace(',', '.'))
    if (Number.isFinite(n) && n >= 0) aoSalvar(Math.round(n * 100) / 100)
    else setTexto(String(valor))
  }
  return <input aria-label={titulo} type="text" inputMode="decimal" value={exibir} onFocus={() => { setTexto(String(valor)); setFoco(true) }} onChange={(e) => setTexto(e.target.value)} onBlur={salvar} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} className="w-[76px] rounded-lg bg-fundo px-1.5 py-1.5 text-right font-mono text-[11px] text-tinta shadow-neu-in-sm" />
}

export function Planejamento({ estado, inicio, aoAjustar, aoAdicionar, aoRemover }: {
  estado: EstadoApp
  inicio: string
  aoAjustar: (chave: string, valor: number | null) => void
  aoAdicionar: (item: ItemPlanejamento) => void
  aoRemover: (id: string) => void
}) {
  const [primeiroMes, setPrimeiroMes] = useState(inicio)
  const [nome, setNome] = useState('')
  const [valor, setValor] = useState('')
  const [tipo, setTipo] = useState<TipoLancamento>('despesa')
  const [conta, setConta] = useState(estado.contas[0]?.id ?? 'pf')
  const [mesNovo, setMesNovo] = useState(inicio)
  const meses = useMemo(() => Array.from({ length: 4 }, (_, i) => somarMeses(primeiroMes, i)), [primeiroMes])
  const linhas = useMemo(() => linhasDoPlano(estado, meses), [estado, meses])
  const contaNome = (id: string) => id === 'cartao' ? 'Cartão de crédito' : estado.contas.find((c) => c.id === id)?.nome ?? 'Outra conta'
  const valorDa = (linha: Linha, mes: string) => estado.planejamento.ajustes[`${linha.id}:${mes}`] ?? linha.valores[mes] ?? 0
  const totais = meses.map((mes) => ({
    mes,
    receitas: linhas.filter((l) => l.tl === 'receita').reduce((s, l) => s + valorDa(l, mes), 0),
    despesas: linhas.filter((l) => l.tl === 'despesa').reduce((s, l) => s + valorDa(l, mes), 0),
  }))
  const soma = totais.reduce((a, t) => ({ receitas: a.receitas + t.receitas, despesas: a.despesas + t.despesas }), { receitas: 0, despesas: 0 })
  const rotuloCurto = (mes: string) => `${mes.slice(5)}/${mes.slice(2, 4)}`

  function adicionar() {
    const numero = Number(valor.replace(',', '.'))
    if (!nome.trim() || !Number.isFinite(numero) || numero < 0 || !meses.includes(mesNovo)) return
    aoAdicionar({ id: novoId(), nome: nome.trim(), valor: Math.round(numero * 100) / 100, tl: tipo, conta, mes: mesNovo })
    setNome(''); setValor('')
  }

  const tabela = (tipoLinha: TipoLancamento) => {
    const escolhidas = linhas.filter((l) => l.tl === tipoLinha)
    const titulo = tipoLinha === 'receita' ? 'Receitas' : 'Despesas'
    return <section className="space-y-2"><h3 className="font-bold text-tinta">{titulo}</h3>
      <div className="overflow-x-auto overscroll-x-contain"><table className="w-full min-w-[460px] table-fixed border-collapse text-xs"><colgroup><col className="w-[128px]" />{meses.map((mes) => <col key={mes} />)}</colgroup><thead><tr><th className="sticky left-0 z-10 bg-superficie px-1.5 py-2 text-left">Descrição</th>{meses.map((mes) => <th key={mes} className="px-1 py-2 text-right">{rotuloCurto(mes)}</th>)}</tr></thead><tbody>{escolhidas.map((linha) => <tr key={linha.id} className="border-t border-borda/60"><td className="sticky left-0 z-10 bg-superficie px-1.5 py-1.5"><span title={linha.nome} className="block truncate font-semibold text-tinta">{linha.nome}</span><span className="block truncate text-[10px] text-tinta-3">{contaNome(linha.conta)}{linha.origem === 'manual' ? <button type="button" onClick={() => aoRemover(linha.id.slice(2))} className="ml-1 text-despesa">Excluir</button> : null}</span></td>{meses.map((mes) => <td key={mes} className="px-0.5 py-1 text-right">{linha.valores[mes] !== undefined || estado.planejamento.ajustes[`${linha.id}:${mes}`] !== undefined ? <CampoValor titulo={`${linha.nome} em ${mes}`} valor={valorDa(linha, mes)} aoSalvar={(v) => aoAjustar(`${linha.id}:${mes}`, v)} /> : <span className="pr-2 text-tinta-3">—</span>}</td>)}</tr>)}</tbody><tfoot><tr className="border-t border-borda font-bold"><td className="sticky left-0 bg-superficie px-1.5 py-2">Total {titulo.toLowerCase()}</td>{totais.map((t) => <td key={t.mes} className={`px-1 py-2 text-right ${tipoLinha === 'receita' ? 'text-receita' : 'text-despesa'}`}>{fmtR(tipoLinha === 'receita' ? t.receitas : t.despesas)}</td>)}</tr></tfoot></table></div>
      {!escolhidas.length ? <p className="text-xs text-tinta-3">Nenhuma {tipoLinha === 'receita' ? 'receita' : 'despesa'} prevista. Adicione uma abaixo.</p> : null}
    </section>
  }

  return <div className="space-y-4">
    <div><h2 className="text-xl font-bold text-tinta">Planejamento</h2><p className="mt-1 text-xs text-tinta-3">Quatro meses à frente, com valores que você pode ajustar. As alterações ficam só no plano.</p></div>
    <Neu className="p-4"><label className="text-xs font-semibold text-tinta-2">Primeiro mês <input type="month" value={primeiroMes} onChange={(e) => { if (/^\d{4}-\d{2}$/.test(e.target.value)) { setPrimeiroMes(e.target.value); setMesNovo(e.target.value) } }} className="ml-2 rounded-lg bg-fundo px-2 py-2 text-tinta" /></label><p className="mt-2 text-xs text-tinta-3">Lançamentos futuros e contas fixas aparecem automaticamente. Parcelas identificadas no último PDF de cada cartão entram como previsão.</p></Neu>
    <Neu className="space-y-5 p-4">{tabela('receita')}{tabela('despesa')}</Neu>
    <Neu className="space-y-3 p-4"><h3 className="font-bold text-tinta">Adicionar ao plano</h3><div className="grid grid-cols-2 gap-2 sm:grid-cols-5"><select aria-label="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoLancamento)} className="rounded-lg bg-fundo px-2 py-2 text-xs text-tinta"><option value="receita">Receita</option><option value="despesa">Despesa</option></select><select aria-label="Conta" value={conta} onChange={(e) => setConta(e.target.value)} className="rounded-lg bg-fundo px-2 py-2 text-xs text-tinta">{estado.contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}<option value="cartao">Cartão de crédito</option></select><select aria-label="Mês" value={mesNovo} onChange={(e) => setMesNovo(e.target.value)} className="rounded-lg bg-fundo px-2 py-2 text-xs text-tinta">{meses.map((mes) => <option key={mes} value={mes}>{labelMes(Number(mes.slice(0, 4)), Number(mes.slice(5)) - 1)}</option>)}</select><input aria-label="Descrição" placeholder="Descrição" value={nome} onChange={(e) => setNome(e.target.value)} className="rounded-lg bg-fundo px-2 py-2 text-xs text-tinta" /><input aria-label="Valor" placeholder="Valor" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} className="rounded-lg bg-fundo px-2 py-2 text-xs text-tinta" /></div><button type="button" onClick={adicionar} className="rounded-lg bg-accent px-4 py-2 text-xs font-bold text-white">+ Adicionar</button></Neu>
    <Neu className="space-y-3 p-4"><h3 className="font-bold text-tinta">Resultado mês a mês</h3><div className="overflow-x-auto"><table className="min-w-[520px] w-full text-xs"><thead><tr><th className="p-2 text-left"> </th>{totais.map((t) => <th key={t.mes} className="p-2 text-right">{labelMes(Number(t.mes.slice(0, 4)), Number(t.mes.slice(5)) - 1)}</th>)}</tr></thead><tbody><tr><td className="p-2">Receitas</td>{totais.map((t) => <td key={t.mes} className="p-2 text-right text-receita">{fmtR(t.receitas)}</td>)}</tr><tr><td className="p-2">Despesas</td>{totais.map((t) => <td key={t.mes} className="p-2 text-right text-despesa">{fmtR(t.despesas)}</td>)}</tr><tr className="border-t border-borda font-bold"><td className="p-2">Crédito / débito</td>{totais.map((t) => <td key={t.mes} className={`p-2 text-right ${t.receitas >= t.despesas ? 'text-receita' : 'text-despesa'}`}>{fmtR(t.receitas - t.despesas)}</td>)}</tr></tbody></table></div><div className="border-t border-borda pt-3 text-xs"><p>Quatro meses · Receitas: <strong>{fmtR(soma.receitas)}</strong> · Despesas: <strong>{fmtR(soma.despesas)}</strong></p><p className={`mt-1 font-bold ${soma.receitas >= soma.despesas ? 'text-receita' : 'text-despesa'}`}>Saldo acumulado: {fmtR(soma.receitas - soma.despesas)}</p></div></Neu>
  </div>
}
