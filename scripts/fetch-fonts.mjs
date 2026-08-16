/**
 * Baixa DM Sans e DM Mono do Google Fonts para public/fonts/.
 *
 * O index.html original carregava as fontes por <link> para fonts.googleapis.com:
 * numa primeira abertura offline o app subia sem tipografia. Self-hospedadas,
 * elas entram no precache do Service Worker. Rodar: npm run gen:fonts
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const saida = resolve(raiz, 'public/fonts')

// O Google entrega o formato conforme o User-Agent. Com UA de Safari ele
// devolve .woff; só com UA de Chrome recente vem o .woff2, que é ~30% menor.
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const FAMILIAS = [
  { css: 'DM+Sans:wght@400', arquivo: 'dm-sans-400.woff2' },
  { css: 'DM+Sans:wght@500', arquivo: 'dm-sans-500.woff2' },
  { css: 'DM+Sans:wght@700', arquivo: 'dm-sans-700.woff2' },
  { css: 'DM+Mono:wght@500', arquivo: 'dm-mono-500.woff2' },
]

await mkdir(saida, { recursive: true })

for (const { css, arquivo } of FAMILIAS) {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${css}&display=swap`
  const folha = await fetch(cssUrl, { headers: { 'User-Agent': UA } }).then((r) => r.text())

  // Pega o subset latin (o primeiro @font-face com woff2 serve para pt-BR).
  const urls = [...folha.matchAll(/url\((https:\/\/[^)]+\.woff2)\)/g)].map((m) => m[1])
  const alvo = urls[urls.length - 1]
  if (!alvo) throw new Error(`Nenhum woff2 encontrado para ${css}`)

  const buf = Buffer.from(await fetch(alvo).then((r) => r.arrayBuffer()))
  await writeFile(resolve(saida, arquivo), buf)
  console.log(`✓ ${arquivo} (${(buf.length / 1024).toFixed(1)} KB)`)
}
