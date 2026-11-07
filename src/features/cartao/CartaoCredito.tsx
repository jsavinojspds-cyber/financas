import { useState, type ChangeEvent } from 'react'
import { Botao, Neu } from '@/components/ui'
import { fmtR, labelMes } from '@/lib/formato'
import { novoId } from '@/lib/id'
import type { FaturaCartao } from '@/types'
import { CATEGORIAS_CARTAO } from './categorias'
import { comIds, detectarMesFaturaItau, identificarCartaoItau, importarPdfItau, importarTexto, type GastoImportado } from './importar'

function rotuloMes(mes: string): string {
  return labelMes(Number(mes.slice(0, 4)), Number(mes.slice(5)) - 1)
}

function total(f: FaturaCartao): number { return f.gastos.reduce((s, g) => s + g.valor, 0) }

export function CartaoCredito({ faturas, mes, aoSalvar, aoImportar, aoRemover, aoCategoria }: {
  faturas: FaturaCartao[]
  mes: string
  aoSalvar: (f: FaturaCartao) => void
  aoImportar: (f: FaturaCartao[]) => void
  aoRemover: (id: string) => void
  aoCategoria: (faturaId: string, gastoId: string, categoria: string) => void
}) {
  const [cartao, setCartao] = useState('')
  const [mesFatura, setMesFatura] = useState(mes)
  const [arquivo, setArquivo] = useState('')
  const [arquivoHash, setArquivoHash] = useState('')
  const [gastos, setGastos] = useState<GastoImportado[]>([])
  const [aviso, setAviso] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [totalInformado, setTotalInformado] = useState<number | null>(null)
  const [filtroMes, setFiltroMes] = useState('todos')
  const ordenadas = [...faturas].sort((a, b) => b.mes.localeCompare(a.mes) || b.criadaEm - a.criadaEm)
  const exibidas = filtroMes === 'todos' ? ordenadas : ordenadas.filter((f) => f.mes === filtroMes)
  const meses = [...new Set(faturas.map((f) => f.mes))].sort().reverse()
  const porCategoria = new Map<string, number>()
  const porMes = new Map<string, number>()
  for (const f of faturas) {
    porMes.set(f.mes, (porMes.get(f.mes) ?? 0) + total(f))
    for (const g of f.gastos) {
      const cat = g.categoria || 'Outros'
      porCategoria.set(cat, (porCategoria.get(cat) ?? 0) + g.valor)
    }
  }
  const categorias = [...porCategoria].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  const maxCategoria = Math.max(...categorias.map(([, v]) => v), 1)
  const historico = [...porMes].sort((a, b) => b[0].localeCompare(a[0]))

  async function lerArquivo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setArquivo(file.name); setGastos([]); setAviso(''); setCarregando(true); setTotalInformado(null)
    try {
      const bytes = await file.arrayBuffer()
      const hash = await crypto.subtle.digest('SHA-256', bytes)
      const hashHex = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('')
      if (faturas.some((f) => f.arquivoHash === hashHex)) { setAviso('Esta fatura já está arquivada.'); return }
      setArquivoHash(hashHex)
      if (file.name.toLowerCase().endsWith('.pdf')) {
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
        const pdf = await pdfjs.getDocument({ data: bytes }).promise
        const paginas = []
        for (let p = 1; p <= pdf.numPages; p++) {
          const conteudo = await (await pdf.getPage(p)).getTextContent()
          paginas.push({ items: conteudo.items.filter((i): i is typeof i & { str: string; transform: number[] } => 'str' in i) })
        }
        const detectado = detectarMesFaturaItau(paginas)
        if (detectado) setMesFatura(detectado)
        const nome = identificarCartaoItau(paginas)
        if (nome) setCartao(nome)
        const resultado = importarPdfItau(paginas, detectado ?? mesFatura)
        setGastos(resultado.gastos)
        setTotalInformado(resultado.totalInformado)
        const soma = resultado.gastos.reduce((s, g) => s + g.valor, 0)
        const confere = resultado.totalInformado !== null && Math.abs(soma - resultado.totalInformado) < 0.01
        setAviso(resultado.gastos.length ? `${resultado.gastos.length} lançamentos encontrados. ${confere ? 'A soma confere com o total da fatura.' : 'Confira a soma antes de salvar.'}` : 'Não encontrei gastos nesse PDF. O formato pode precisar de adaptação.')
      } else if (/\.(csv|txt)$/i.test(file.name)) {
        const resultado = importarTexto(new TextDecoder().decode(bytes), mesFatura)
        setGastos(resultado.gastos)
        setAviso(resultado.gastos.length ? `${resultado.gastos.length} gastos encontrados; ${resultado.ignoradas} linhas ignoradas. Confira os valores antes de salvar.` : 'Não encontrei gastos nesse arquivo.')
      } else throw new Error('Selecione uma fatura em PDF, CSV ou TXT.')
    } catch (erro) { setAviso(erro instanceof Error ? erro.message : 'Não consegui ler a fatura.') }
    finally { setCarregando(false); e.target.value = '' }
  }

  async function importarPacote(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const pacote: unknown = JSON.parse(await file.text())
      if (!pacote || typeof pacote !== 'object' || !('formato' in pacote) || pacote.formato !== 'financas-faturas-v1' || !('faturas' in pacote) || !Array.isArray(pacote.faturas)) throw new Error('Arquivo de faturas inválido.')
      const faturasNovas: FaturaCartao[] = pacote.faturas
      if (!faturasNovas.length || !faturasNovas.every((f) => f && typeof f.id === 'string' && typeof f.cartao === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(f.mes) && typeof f.arquivo === 'string' && Array.isArray(f.gastos) && f.gastos.length > 0 && f.gastos.every((g) => typeof g.id === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(g.data) && typeof g.descricao === 'string' && Number.isFinite(g.valor)) && Number.isFinite(f.criadaEm))) throw new Error('O pacote contém faturas incompletas.')
      const novas = faturasNovas.filter((f) => !faturas.some((atual) => (f.arquivoHash && atual.arquivoHash === f.arquivoHash) || (atual.mes === f.mes && atual.cartao.toLowerCase() === f.cartao.toLowerCase())))
      aoImportar(novas)
      setAviso(novas.length ? `${novas.length} faturas adicionadas ao histórico. ${faturasNovas.length - novas.length} já existentes foram ignoradas.` : 'Todas as faturas deste pacote já estão arquivadas.')
      setFiltroMes('todos')
    } catch (erro) { setAviso(erro instanceof Error ? erro.message : 'Não consegui importar o pacote.') }
    finally { e.target.value = '' }
  }

  function salvar() {
    if (!cartao.trim() || !gastos.length || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mesFatura)) return
    const existente = faturas.find((f) => f.mes === mesFatura && f.cartao.toLowerCase() === cartao.trim().toLowerCase())
    if (existente && !window.confirm(`Já existe uma fatura de ${cartao} em ${rotuloMes(mesFatura)}. Substituir essa fatura?`)) return
    aoSalvar({ id: existente?.id ?? novoId(), cartao: cartao.trim(), mes: mesFatura, arquivo, arquivoHash, gastos: comIds(gastos), criadaEm: Date.now() })
    setGastos([]); setArquivo(''); setArquivoHash(''); setTotalInformado(null); setAviso('Fatura arquivada.'); setFiltroMes('todos')
  }

  const somaPrevia = gastos.reduce((s, g) => s + g.valor, 0)
  const divergencia = totalInformado !== null && Math.abs(somaPrevia - totalInformado) >= 0.01

  return <div className="space-y-4">
    <div><h2 className="text-xl font-bold text-tinta">💳 Cartão de crédito</h2><p className="mt-1 text-xs text-tinta-3">Arquive faturas e acompanhe onde o dinheiro está indo.</p></div>
    <Neu className="space-y-3 p-4">
      <h3 className="font-bold text-tinta">Importar fatura</h3>
      <label className="block text-xs font-semibold text-tinta-2">Pacote de faturas preparado (.json)<input type="file" accept=".json,application/json" onChange={(e) => void importarPacote(e)} className="mt-1 block w-full text-xs text-tinta-2 file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-2 file:font-bold file:text-white" /></label>
      <label className="block text-xs font-semibold text-tinta-2">PDF, CSV ou TXT<input type="file" accept=".pdf,.csv,.txt,application/pdf,text/csv,text/plain" onChange={(e) => void lerArquivo(e)} className="mt-1 block w-full text-xs text-tinta-2 file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-2 file:font-bold file:text-white" /></label>
      {carregando ? <p className="text-xs text-tinta-3">Lendo fatura…</p> : null}
      {aviso ? <p role="status" className="text-xs text-tinta-2">{aviso}</p> : null}
      {gastos.length > 0 ? <>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-xs font-semibold text-tinta-2">Cartão identificado<input value={cartao} onChange={(e) => setCartao(e.target.value)} placeholder="Ex.: Itaú Mastercard" className="mt-1 w-full rounded-xl bg-fundo px-3 py-3 text-tinta" /></label>
          <label className="block text-xs font-semibold text-tinta-2">Mês da fatura<input type="month" value={mesFatura} onChange={(e) => setMesFatura(e.target.value)} className="mt-1 w-full rounded-xl bg-fundo px-3 py-3 text-tinta" /></label>
        </div>
        <p className="text-sm font-bold text-tinta">Prévia · {fmtR(somaPrevia)}{totalInformado !== null ? ` · PDF: ${fmtR(totalInformado)}` : ''}</p>
        {divergencia ? <p className="text-xs font-semibold text-despesa">A soma difere do total da fatura. Confira os lançamentos antes de arquivar.</p> : null}
        <div className="max-h-80 overflow-y-auto">{gastos.map((g, i) => <div key={i} className="grid grid-cols-[1fr_auto] gap-x-2 border-b border-borda/60 py-2 text-xs"><span className="min-w-0 break-words">{g.data.slice(8)}/{g.data.slice(5, 7)} · {g.descricao}</span><strong className="shrink-0">{fmtR(g.valor)}</strong><select aria-label={`Categoria de ${g.descricao}`} value={g.categoria ?? 'Outros'} onChange={(e) => setGastos((atual) => atual.map((x, n) => n === i ? { ...x, categoria: e.target.value } : x))} className="mt-1 w-fit rounded-lg bg-fundo px-1 py-1 text-xs text-tinta-2">{CATEGORIAS_CARTAO.map((c) => <option key={c}>{c}</option>)}</select></div>)}</div>
        <Botao variante="primario" disabled={!cartao.trim() || divergencia} onClick={salvar}>Arquivar fatura</Botao>
      </> : null}
    </Neu>
    {faturas.length ? <>
      <Neu className="space-y-4 p-4"><h3 className="font-bold text-tinta">Onde você mais gastou</h3><p className="text-xs text-tinta-3">Total das faturas arquivadas, agrupado por categoria. Você pode corrigir cada categoria abaixo.</p>{categorias.map(([cat, quantia]) => <div key={cat}><div className="mb-1 flex justify-between gap-2 text-xs"><span>{cat}</span><strong>{fmtR(quantia)}</strong></div><div className="h-2 rounded-full bg-fundo"><div className="h-2 rounded-full bg-accent" style={{ width: `${Math.max(2, quantia / maxCategoria * 100)}%` }} /></div></div>)}</Neu>
      <Neu className="p-4"><h3 className="mb-2 font-bold text-tinta">Evolução por mês</h3>{historico.map(([m, quantia]) => <div key={m} className="flex justify-between border-b border-borda/60 py-2 text-xs"><span>{rotuloMes(m)}</span><strong>{fmtR(quantia)}</strong></div>)}</Neu>
      <div className="flex items-center justify-between gap-3"><h3 className="font-bold text-tinta">Faturas arquivadas</h3><select aria-label="Filtrar mês das faturas" value={filtroMes} onChange={(e) => setFiltroMes(e.target.value)} className="max-w-44 rounded-lg bg-superficie px-2 py-2 text-xs text-tinta"><option value="todos">Todos os meses</option>{meses.map((m) => <option key={m} value={m}>{rotuloMes(m)}</option>)}</select></div>
      {exibidas.map((f) => <Neu key={f.id} className="p-4"><div className="flex items-start justify-between gap-2"><div><h4 className="font-bold text-tinta">{f.cartao}</h4><p className="text-xs text-tinta-3">{rotuloMes(f.mes)} · {f.arquivo} · {f.gastos.length} lançamentos</p></div><strong className="shrink-0 text-sm text-tinta">{fmtR(total(f))}</strong></div><details className="mt-3 text-xs"><summary className="cursor-pointer font-semibold text-accent">Ver e classificar gastos</summary>{f.gastos.map((g) => <div key={g.id} className="grid grid-cols-[1fr_auto] gap-x-2 border-b border-borda/60 py-2"><span className="min-w-0 break-words">{g.data.slice(8)}/{g.data.slice(5, 7)} · {g.descricao}</span><strong>{fmtR(g.valor)}</strong><select aria-label={`Categoria de ${g.descricao}`} value={g.categoria ?? 'Outros'} onChange={(e) => aoCategoria(f.id, g.id, e.target.value)} className="mt-1 w-fit rounded-lg bg-fundo px-1 py-1 text-xs text-tinta-2">{CATEGORIAS_CARTAO.map((c) => <option key={c}>{c}</option>)}</select></div>)}</details><button type="button" className="mt-3 text-xs font-semibold text-despesa" onClick={() => { if (window.confirm('Excluir esta fatura?')) aoRemover(f.id) }}>Excluir fatura</button></Neu>)}
    </> : <p className="text-center text-xs text-tinta-3">Nenhuma fatura arquivada ainda.</p>}
    <p className="text-xs text-tinta-3">As faturas ficam separadas das despesas comuns para evitar dupla contagem no fluxo de caixa.</p>
  </div>
}
