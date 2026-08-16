/**
 * Gera os PNGs do PWA a partir de src/assets/icone.svg.
 *
 * O app antigo usava um SVG em data-URI no apple-touch-icon; o iOS aceita,
 * mas o resultado sai sem o polimento dos ícones nativos e o manifest exige
 * PNG de verdade. Rodar: npm run gen:icons
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(resolve(raiz, 'src/assets/icone.svg'))
const saida = resolve(raiz, 'public/icons')

const TAMANHOS = [
  { arquivo: 'icon-32.png', tam: 32 },
  { arquivo: 'icon-64.png', tam: 64 },
  { arquivo: 'icon-badge.png', tam: 96 },
  { arquivo: 'icon-192.png', tam: 192 },
  { arquivo: 'icon-512.png', tam: 512 },
  // o iOS não aplica máscara: o ícone precisa vir com os cantos já arredondados
  { arquivo: 'apple-touch-icon.png', tam: 180 },
]

await mkdir(saida, { recursive: true })

for (const { arquivo, tam } of TAMANHOS) {
  const png = await sharp(svg, { density: 400 }).resize(tam, tam).png({ compressionLevel: 9 }).toBuffer()
  await writeFile(resolve(saida, arquivo), png)
  console.log(`✓ ${arquivo} (${tam}×${tam}, ${(png.length / 1024).toFixed(1)} KB)`)
}

// Ícone maskable: o Android corta em círculo, então o conteúdo precisa caber
// na zona segura de 80%. Aqui o SVG é reduzido sobre um fundo roxo cheio.
const interno = await sharp(svg, { density: 400 }).resize(410, 410).png().toBuffer()
const maskable = await sharp({
  create: { width: 512, height: 512, channels: 4, background: '#6d28d9' },
})
  .composite([{ input: interno, top: 51, left: 51 }])
  .png({ compressionLevel: 9 })
  .toBuffer()
await writeFile(resolve(saida, 'icon-maskable-512.png'), maskable)
console.log(`✓ icon-maskable-512.png (512×512, ${(maskable.length / 1024).toFixed(1)} KB)`)
