import { useState, type ChangeEvent } from 'react'
import { Botao, Neu } from '@/components/ui'
import { fmtR } from '@/lib/formato'
import { novoId } from '@/lib/id'
import type { FaturaCartao } from '@/types'
import { comIds, importarTexto, importarPdfItau, detectarMesFaturaItau, type GastoImportado } from './importar'

export function CartaoCredito({ faturas, mes, aoSalvar, aoRemover }: { faturas: FaturaCartao[]; mes: string; aoSalvar: (f: FaturaCartao) => void; aoRemover: (id: string) => void }) {
  const [cartao, setCartao] = useState('')
  const [mesFatura, setMesFatura] = useState(mes)
  const [arquivo, setArquivo] = useState('')
  const [gastos, setGastos] = useState<GastoImportado[]>([])
  const [aviso, setAviso] = useState('')
  const [carregando, setCarregando] = useState(false)
  const atuais = faturas.filter((f) => f.mes === mes)

  async function lerArquivo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setArquivo(file.name); setGastos([]); setAviso(''); setCarregando(true)
    try {
      let texto: string | null = null
      if (file.name.toLowerCase().endsWith('.pdf')) {
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
        const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
        const paginas = []
        for (let p = 1; p <= pdf.numPages; p++) {
          const conteudo = await (await pdf.getPage(p)).getTextContent()
          paginas.push({ items: conteudo.items.filter((i): i is typeof i & { str: string; transform: number[] } => 'str' in i) })
        }
        const mesDetectado = detectarMesFaturaItau(paginas) ?? mesFatura
        setMesFatura(mesDetectado)
        const resultado = importarPdfItau(paginas, mesDetectado)
        setGastos(resultado.gastos)
        const soma = resultado.gastos.reduce((s, g) => s + g.valor, 0)
        setAviso(resultado.gastos.length ? `${resultado.gastos.length} lançamento(s) encontrado(s). Soma: ${fmtR(soma)}.${resultado.totalInformado !== null ? ` Total informado na fatura: ${fmtR(resultado.totalInformado)}.` : ''} Confira antes de salvar.` : 'Não encontrei gastos nesse PDF. Envie uma fatura de exemplo para ajustarmos a leitura.')
      } else if (/\.(csv|txt)$/i.test(file.name)) texto = await file.text()
      else throw new Error('Selecione uma fatura em PDF, CSV ou TXT.')
      if (texto !== null) {
        const resultado = importarTexto(texto, mesFatura)
        setGastos(resultado.gastos)
        setAviso(resultado.gastos.length ? `${resultado.gastos.length} gasto(s) encontrado(s). ${resultado.ignoradas} linha(s) ignorada(s). Confira os valores antes de salvar.` : 'Não encontrei gastos nesse formato. Envie uma fatura de exemplo para ajustarmos a leitura.')
      }
    } catch (erro) { setAviso(erro instanceof Error ? erro.message : 'Não consegui ler a fatura.') }
    finally { setCarregando(false); e.target.value = '' }
  }

  function salvar() {
    if (!cartao.trim() || !gastos.length) return
    aoSalvar({ id: novoId(), cartao: cartao.trim(), mes: mesFatura, arquivo, gastos: comIds(gastos), criadaEm: Date.now() })
    setGastos([]); setArquivo(''); setAviso('Fatura salva.')
  }

  return <div className="space-y-4">
    <div><h2 className="text-xl font-bold text-tinta">💳 Cartão de crédito</h2><p className="mt-1 text-xs text-tinta-3">Importe a fatura e confira os gastos antes de salvar.</p></div>
    <Neu className="space-y-3 p-4">
      <label className="block text-xs font-semibold text-tinta-2">Nome do cartão<input value={cartao} onChange={(e) => setCartao(e.target.value)} placeholder="Ex.: Nubank" className="mt-1 w-full rounded-xl bg-fundo px-3 py-3 text-tinta" /></label>
      <label className="block text-xs font-semibold text-tinta-2">Mês da fatura<input type="month" value={mesFatura} onChange={(e) => setMesFatura(e.target.value)} className="mt-1 w-full rounded-xl bg-fundo px-3 py-3 text-tinta" /></label>
      <label className="block text-xs font-semibold text-tinta-2">Arquivo PDF, CSV ou TXT<input type="file" accept=".pdf,.csv,.txt,application/pdf,text/csv,text/plain" onChange={(e) => void lerArquivo(e)} className="mt-1 block w-full text-xs text-tinta-2 file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-2 file:font-bold file:text-white" /></label>
      {carregando ? <p className="text-xs text-tinta-3">Lendo fatura…</p> : null}
      {aviso ? <p role="status" className="text-xs text-tinta-2">{aviso}</p> : null}
      {gastos.length > 0 ? <div className="space-y-2"><p className="text-sm font-bold text-tinta">Prévia · {fmtR(gastos.reduce((s, g) => s + g.valor, 0))}</p><div className="max-h-72 overflow-y-auto">{gastos.map((g, i) => <div key={i} className="flex justify-between gap-3 border-b border-borda/60 py-2 text-xs"><span>{g.data.slice(8)}/{g.data.slice(5, 7)} · {g.descricao}</span><strong className="shrink-0">{fmtR(g.valor)}</strong></div>)}</div><Botao variante="primario" disabled={!cartao.trim()} onClick={salvar}>Salvar fatura</Botao></div> : null}
    </Neu>
    <p className="text-xs text-tinta-3">Os gastos da fatura ficam separados dos lançamentos comuns, para evitar contagem duplicada.</p>
    {atuais.map((f) => <Neu key={f.id} className="p-4"><div className="flex items-start justify-between gap-2"><div><h3 className="font-bold text-tinta">{f.cartao}</h3><p className="text-xs text-tinta-3">{f.arquivo} · {f.gastos.length} gastos</p></div><strong className="text-sm text-tinta">{fmtR(f.gastos.reduce((s, g) => s + g.valor, 0))}</strong></div><details className="mt-3 text-xs"><summary className="cursor-pointer font-semibold text-accent">Ver gastos</summary>{f.gastos.map((g) => <div key={g.id} className="flex justify-between gap-3 border-b border-borda/60 py-2"><span>{g.data.slice(8)}/{g.data.slice(5, 7)} · {g.descricao}</span><span>{fmtR(g.valor)}</span></div>)}</details><button type="button" className="mt-3 text-xs font-semibold text-despesa" onClick={() => { if (window.confirm('Excluir esta fatura?')) aoRemover(f.id) }}>Excluir fatura</button></Neu>)}
    {!atuais.length ? <p className="text-center text-xs text-tinta-3">Nenhuma fatura salva neste mês.</p> : null}
  </div>
}
