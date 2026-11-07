import type { GastoCartao } from '@/types'
import { novoId } from '@/lib/id'

export type GastoImportado = Omit<GastoCartao, 'id'>

function valor(bruto: string): number {
  const s = bruto.replace(/[^\d,.-]/g, '').trim()
  if (!s) return NaN
  const decimal = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'))
  const cents = decimal >= 0 ? s.slice(decimal + 1) : ''
  const inteiro = decimal >= 0 ? s.slice(0, decimal) : s
  const n = Number(inteiro.replace(/[.,]/g, '') + (cents.length === 2 ? `.${cents}` : ''))
  return Number.isFinite(n) ? n : NaN
}

function dataIso(bruto: string, mesFatura: string): string | null {
  const m = bruto.trim().match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/)
  if (!m) return null
  const dia = Number(m[1]); const mes = Number(m[2])
  let ano = m[3] ? Number(m[3]) : Number(mesFatura.slice(0, 4))
  if (ano < 100) ano += 2000
  if (!m[3] && mes > Number(mesFatura.slice(5))) ano--
  const d = new Date(ano, mes - 1, dia)
  if (d.getFullYear() !== ano || d.getMonth() !== mes - 1 || d.getDate() !== dia) return null
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

function separarCsv(linha: string, sep: string): string[] {
  const campos: string[] = []; let atual = ''; let aspas = false
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i]!
    if (c === '"') { if (aspas && linha[i + 1] === '"') { atual += '"'; i++ } else aspas = !aspas }
    else if (c === sep && !aspas) { campos.push(atual.trim()); atual = '' }
    else atual += c
  }
  campos.push(atual.trim())
  return campos
}

export function importarTexto(texto: string, mesFatura: string): { gastos: GastoImportado[]; ignoradas: number } {
  const linhas = texto.replace(/^\uFEFF/, '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const separador = linhas[0]?.includes(';') ? ';' : linhas[0]?.includes('\t') ? '\t' : ','
  const cabecalho = separarCsv(linhas[0] ?? '', separador).map((c) => c.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
  const colData = cabecalho.findIndex((c) => /^(data|date|data da compra|data compra)$/.test(c))
  const colDescricao = cabecalho.findIndex((c) => /descricao|estabelecimento|historico|lancamento|merchant/.test(c))
  const colValor = cabecalho.findIndex((c) => /^(valor|amount|valor r\$|valor da compra)$/.test(c))
  const temCabecalho = colData >= 0 && colDescricao >= 0 && colValor >= 0
  const gastos: GastoImportado[] = []; let ignoradas = 0
  for (const linha of linhas.slice(temCabecalho ? 1 : 0)) {
    let data: string | null = null; let descricao = ''; let quantia = NaN
    if (temCabecalho) {
      const c = separarCsv(linha, separador)
      data = dataIso(c[colData] ?? '', mesFatura)
      descricao = (c[colDescricao] ?? '').trim()
      quantia = valor(c[colValor] ?? '')
    } else {
      const m = linha.match(/^(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\s+(.+?)\s+(?:R\$\s*)?(-?[\d.,]+)$/)
      if (m) { data = dataIso(m[1]!, mesFatura); descricao = m[2]!.trim(); quantia = valor(m[3]!) }
    }
    if (data && descricao && Number.isFinite(quantia) && quantia > 0) gastos.push({ data, descricao, valor: quantia })
    else ignoradas++
  }
  return { gastos, ignoradas }
}

export function comIds(gastos: GastoImportado[]): GastoCartao[] {
  return gastos.map((g) => ({ ...g, id: novoId() }))
}
