/**
 * Gera public/mercado.json com os indicadores da manhã.
 *
 * Roda no GitHub Actions, não no navegador — e é justamente esse o ponto:
 * Ibovespa e IFIX não têm fonte gratuita com CORS liberado, então o app
 * nunca conseguiria buscá-los direto. Aqui, do lado do servidor, não há
 * CORS. O app só lê o JSON pronto, que o Service Worker guarda em cache e
 * continua mostrando offline.
 *
 * Nenhuma chave de API é necessária: todas as fontes são abertas.
 */
import { writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const destino = resolve(raiz, 'public/mercado.json')

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

async function json(url, opcoes = {}) {
  const r = await fetch(url, { headers: { 'User-Agent': UA }, ...opcoes })
  if (!r.ok) throw new Error(`HTTP ${r.status} em ${url}`)
  return r.json()
}

/** Índice via Yahoo Finance. Devolve valor e variação % do dia. */
async function indiceYahoo(simbolo, rotulo) {
  const d = await json(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      simbolo,
    )}?interval=1d&range=5d`,
  )
  const meta = d?.chart?.result?.[0]?.meta
  if (!meta?.regularMarketPrice) throw new Error(`sem preço para ${simbolo}`)
  const atual = meta.regularMarketPrice
  const anterior = meta.chartPreviousClose ?? meta.previousClose ?? atual
  return {
    id: rotulo.id,
    rotulo: rotulo.nome,
    valor: atual,
    variacao: anterior ? ((atual - anterior) / anterior) * 100 : 0,
    formato: rotulo.formato,
  }
}

/** Série do Banco Central (SGS). Os valores vêm como string com vírgula decimal? Não: ponto. */
async function serieBcb(codigo, rotulo) {
  const d = await json(
    `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${codigo}/dados/ultimos/1?formato=json`,
  )
  const valor = Number(d?.[0]?.valor)
  if (!Number.isFinite(valor)) throw new Error(`série ${codigo} sem valor`)
  return {
    id: rotulo.id,
    rotulo: rotulo.nome,
    valor,
    variacao: null,
    formato: rotulo.formato,
    nota: rotulo.nota,
  }
}

async function dolar() {
  const d = await json('https://economia.awesomeapi.com.br/last/USD-BRL')
  const u = d?.USDBRL
  if (!u) throw new Error('câmbio sem dados')
  return {
    id: 'usd',
    rotulo: 'Dólar',
    valor: Number(u.bid),
    variacao: Number(u.pctChange),
    formato: 'moeda',
  }
}

/** A Selic diária do SGS vem ao dia; anualizar deixa o número comparável
 *  com o que o usuário vê no noticiário. */
function anualizar(indicador) {
  if (!indicador) return null
  const aoAno = (Math.pow(1 + indicador.valor / 100, 252) - 1) * 100
  return { ...indicador, valor: aoAno }
}

const fontes = [
  () => indiceYahoo('^BVSP', { id: 'ibov', nome: 'Ibovespa', formato: 'pontos' }),
  () => indiceYahoo('IFIX.SA', { id: 'ifix', nome: 'IFIX', formato: 'pontos' }),
  () => dolar(),
  () =>
    serieBcb(11, { id: 'selic', nome: 'Selic', formato: 'percent', nota: 'a.a.' }).then(anualizar),
  () => serieBcb(12, { id: 'cdi', nome: 'CDI', formato: 'percent', nota: 'a.a.' }).then(anualizar),
  // O IPCA da série 433 já é a variação do mês — anualizar aqui seria erro.
  () => serieBcb(433, { id: 'ipca', nome: 'IPCA', formato: 'percent', nota: 'no mês' }),
]

const indicadores = []
const falhas = []

// Cada fonte é independente: uma API fora do ar não pode derrubar o briefing
// inteiro. O que vier, vem; o que faltar fica registrado.
for (const buscar of fontes) {
  try {
    const r = await buscar()
    if (r) indicadores.push(r)
  } catch (e) {
    falhas.push(String(e.message ?? e))
  }
}

if (indicadores.length === 0) {
  console.error('Nenhuma fonte respondeu — mantendo o mercado.json anterior.')
  console.error(falhas.join('\n'))
  process.exit(1)
}

const saida = {
  gerado_em: new Date().toISOString(),
  indicadores,
  ...(falhas.length ? { falhas } : {}),
}

await mkdir(dirname(destino), { recursive: true })
await writeFile(destino, `${JSON.stringify(saida, null, 2)}\n`, 'utf8')

console.log(`✓ ${indicadores.length} indicadores gravados em public/mercado.json`)
for (const i of indicadores) {
  const v = i.variacao === null ? '' : ` (${i.variacao >= 0 ? '+' : ''}${i.variacao.toFixed(2)}%)`
  console.log(`  ${i.rotulo}: ${i.valor.toFixed(2)}${v}`)
}
if (falhas.length) console.warn(`⚠ ${falhas.length} fonte(s) falharam:\n  ${falhas.join('\n  ')}`)
