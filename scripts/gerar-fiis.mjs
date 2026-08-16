/**
 * Gera public/fiis.json com as cotações do universo de FIIs.
 *
 * Roda no GitHub Actions junto com o mercado. Publica um UNIVERSO de fundos
 * líquidos, não a carteira do usuário: o arquivo fica publicamente legível na
 * URL do Pages, e as posições — quais fundos, quantas cotas — nunca saem do
 * aparelho. O app cruza os preços localmente.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const destino = resolve(raiz, 'public/fiis.json')

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

/** Requisições em paralelo. Alto demais e a fonte devolve 429. */
const CONCORRENCIA = 6

const universo = JSON.parse(await readFile(resolve(raiz, 'scripts/universo-fiis.json'), 'utf8'))
const tickers = universo.tickers

async function cotacao(ticker) {
  const r = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}.SA?interval=1d&range=5d`,
    { headers: { 'User-Agent': UA } },
  )
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const meta = (await r.json())?.chart?.result?.[0]?.meta
  const preco = meta?.regularMarketPrice
  if (!preco) throw new Error('sem preço')
  const anterior = meta.chartPreviousClose ?? meta.previousClose ?? preco
  return {
    preco,
    variacao: anterior ? ((preco - anterior) / anterior) * 100 : 0,
    // O nome curto da fonte vem truncado ("FII HGLG PAXCI"); serve de apoio,
    // o ticker continua sendo a identificação.
    nome: (meta.shortName ?? ticker).trim(),
  }
}

const cotacoes = {}
const falhas = []

// Fila com concorrência limitada: 43 requisições sequenciais deixariam o
// workflow lento, e todas de uma vez levariam 429.
let indice = 0
async function trabalhador() {
  while (indice < tickers.length) {
    const t = tickers[indice++]
    try {
      cotacoes[t] = await cotacao(t)
    } catch (e) {
      falhas.push(`${t}: ${e.message ?? e}`)
    }
  }
}
await Promise.all(Array.from({ length: CONCORRENCIA }, trabalhador))

if (Object.keys(cotacoes).length === 0) {
  console.error('Nenhuma cotação obtida — mantendo o fiis.json anterior.')
  process.exit(1)
}

await mkdir(dirname(destino), { recursive: true })
await writeFile(
  destino,
  `${JSON.stringify(
    { gerado_em: new Date().toISOString(), cotacoes, ...(falhas.length ? { falhas } : {}) },
    null,
    2,
  )}\n`,
  'utf8',
)

console.log(`✓ ${Object.keys(cotacoes).length}/${tickers.length} cotações em public/fiis.json`)
if (falhas.length) console.warn(`⚠ falhas:\n  ${falhas.join('\n  ')}`)
