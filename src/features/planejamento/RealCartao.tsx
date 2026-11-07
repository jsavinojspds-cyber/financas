import { useState } from 'react'
import { Neu } from '@/components/ui'
import { fmtR, labelMes } from '@/lib/formato'
import { novoId } from '@/lib/id'
import type { EstadoApp } from '@/types'

type Real = EstadoApp['planejamento']['realCartao'][number]

function ValorReal({ valor, nome, salvar, remover }: { valor?: number; nome: string; salvar: (valor: number) => void; remover: () => void }) {
  const [texto, setTexto] = useState('')
  const [foco, setFoco] = useState(false)
  function confirmar() {
    setFoco(false)
    if (!texto.trim()) { if (valor !== undefined) remover(); return }
    const numero = Number(texto.replace(',', '.'))
    if (Number.isFinite(numero) && numero >= 0) salvar(Math.round(numero * 100) / 100)
  }
  return <input aria-label={`Valor real de ${nome}`} inputMode="decimal" value={foco ? texto : valor === undefined ? '' : String(valor)} placeholder="Em branco" onFocus={() => { setTexto(valor === undefined ? '' : String(valor)); setFoco(true) }} onChange={(e) => setTexto(e.target.value)} onBlur={confirmar} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} className="w-24 rounded-lg bg-fundo px-2 py-2 text-right font-mono text-xs text-tinta shadow-neu-in-sm" />
}

export function RealCartao({ estado, salvar, remover }: { estado: EstadoApp; salvar: (item: Real) => void; remover: (id: string) => void }) {
  const [mes, setMes] = useState(estado.planejamento.inicio)
  const [nomeNovo, setNomeNovo] = useState('')
  const [valorNovo, setValorNovo] = useState('')
  const previstos = estado.planejamento.itens.filter((i) => i.mes === mes && i.conta === 'cartao' && i.tl === 'despesa' && !estado.planejamento.ocultos.includes(`m:${i.id}`))
  const realizados = estado.planejamento.realCartao.filter((i) => i.mes === mes)
  const extras = realizados.filter((i) => !i.planoId)
  const total = realizados.reduce((s, i) => s + i.valor, 0)
  function adicionar() {
    const valor = Number(valorNovo.replace(',', '.'))
    if (!nomeNovo.trim() || !Number.isFinite(valor) || valor < 0) return
    salvar({ id: novoId(), mes, nome: nomeNovo.trim(), valor: Math.round(valor * 100) / 100 })
    setNomeNovo(''); setValorNovo('')
  }
  return <Neu className="space-y-3 p-4">
    <div><h3 className="font-bold text-tinta">Realizado do cartão</h3><p className="mt-1 text-xs text-tinta-3">Preencha o valor efetivo de cada gasto. Células vazias ainda não foram informadas. Estes valores ficam separados das despesas pagas para evitar dupla contagem.</p></div>
    <label className="block text-xs font-semibold text-tinta-2">Mês <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="ml-2 rounded-lg bg-fundo px-2 py-2 text-tinta" /></label>
    <p className="text-xs font-semibold text-tinta-2">{labelMes(Number(mes.slice(0, 4)), Number(mes.slice(5)) - 1)}</p>
    <div className="space-y-1">{previstos.map((item) => {
      const real = realizados.find((i) => i.planoId === item.id)
      return <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-borda/60 py-1.5"><div className="min-w-0"><p className="truncate text-xs font-semibold text-tinta" title={item.nome}>{estado.planejamento.nomes[`m:${item.id}`] || item.nome}</p><p className="text-[11px] text-tinta-3">Previsto: {fmtR(estado.planejamento.ajustes[`m:${item.id}:${mes}`] ?? item.valor)}</p></div><ValorReal nome={item.nome} valor={real?.valor} salvar={(valor) => salvar({ id: real?.id ?? novoId(), mes, nome: item.nome, planoId: item.id, valor })} remover={() => { if (real) remover(real.id) }} /></div>
    })}</div>
    {!previstos.length ? <p className="text-xs text-tinta-3">Nenhuma linha de cartão prevista neste mês. Você pode registrar um gasto abaixo.</p> : null}
    {extras.length ? <div className="space-y-1"><h4 className="text-xs font-bold text-tinta">Outros gastos reais</h4>{extras.map((i) => <div key={i.id} className="flex items-center justify-between gap-2 border-b border-borda/60 py-1 text-xs"><span className="min-w-0 truncate">{i.nome}</span><ValorReal nome={i.nome} valor={i.valor} salvar={(valor) => salvar({ ...i, valor })} remover={() => remover(i.id)} /><button type="button" aria-label={`Excluir ${i.nome}`} onClick={() => remover(i.id)} className="text-despesa">×</button></div>)}</div> : null}
    <div className="grid grid-cols-[1fr_90px] gap-2"><input aria-label="Descrição de outro gasto real" placeholder="Outro gasto" value={nomeNovo} onChange={(e) => setNomeNovo(e.target.value)} className="min-w-0 rounded-lg bg-fundo px-2 py-2 text-xs text-tinta" /><input aria-label="Valor de outro gasto real" inputMode="decimal" placeholder="Valor" value={valorNovo} onChange={(e) => setValorNovo(e.target.value)} className="rounded-lg bg-fundo px-2 py-2 text-xs text-tinta" /></div><button type="button" onClick={adicionar} className="rounded-lg bg-accent px-3 py-2 text-xs font-bold text-white">+ Registrar gasto real</button>
    <p className="border-t border-borda pt-3 text-sm font-bold text-tinta">Total registrado: {fmtR(total)}</p>
  </Neu>
}
