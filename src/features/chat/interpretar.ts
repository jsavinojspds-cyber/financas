import { avancarData, diasAte, hoje } from '@/lib/formato'
import { doMes, statusDe } from '@/state/seletores'
import { FORMAS_PAGAMENTO, type EstadoApp, type FormaPagamento, type Lancamento, type TipoLancamento } from '@/types'

export interface Rascunho {
  tl: TipoLancamento
  nome: string
  valor: number
  vencimento: string
  tp: FormaPagamento
  cat: string
  pago: boolean
  /** de onde veio a categoria — mostrado para o usuário poder corrigir */
  origemCat: 'historico' | 'palavra-chave' | 'padrao'
}

export type Intencao =
  | { t: 'adicionar'; rascunho: Rascunho }
  | { t: 'excluir'; termo: string; candidatos: Lancamento[] }
  | { t: 'pagar'; termo: string; candidatos: Lancamento[] }
  | { t: 'buscar'; termo: string; resultados: Lancamento[] }
  | { t: 'total'; rotulo: string; valor: number; itens: Lancamento[] }
  | { t: 'ajuda' }
  | { t: 'vazio' }

const VERBOS_EXCLUIR = /^(apagar|apaga|excluir|exclui|deletar|deleta|remover|remove|del)\s+/i
const VERBOS_PAGAR = /^(pagar|paga|paguei|quitar|quitei|baixar)\s+/i
const VERBOS_BUSCAR = /^(buscar|busca|procurar|procura|achar|acha|onde|cadê|cade)\s+/i
const PEDE_AJUDA = /^(ajuda|help|\?|comandos|o que (eu )?posso)/i

/** Palavras que o usuário digita e a categoria que elas sugerem. */
const PALAVRAS_CATEGORIA: Record<string, string[]> = {
  Moradia: ['energia', 'luz', 'água', 'agua', 'condomínio', 'condominio', 'aluguel', 'iptu', 'gás', 'gas', 'internet', 'reforma'],
  Alimentação: ['mercado', 'supermercado', 'padaria', 'almoço', 'almoco', 'jantar', 'lanche', 'restaurante', 'ifood', 'feira', 'açougue', 'acougue', 'peixaria'],
  Saúde: ['farmácia', 'farmacia', 'drogaria', 'drogasil', 'médico', 'medico', 'consulta', 'exame', 'plano de saúde', 'dentista', 'psicóloga', 'psicologa', 'academia', 'pilates', 'personal'],
  Educação: ['faculdade', 'escola', 'curso', 'mensalidade', 'material escolar', 'livro'],
  Pet: ['pet', 'ração', 'racao', 'veterinário', 'veterinario', 'petshop', 'banho e tosa'],
  Assinatura: ['netflix', 'spotify', 'assinatura', 'google one', 'apple', 'icloud', 'amazon prime'],
  Lazer: ['cinema', 'viagem', 'passeio', 'bar', 'show', 'hotel', 'passagem'],
  Impostos: ['imposto', 'inss', 'das', 'darf', 'receita federal', 'iss'],
  Pessoal: ['combustível', 'combustivel', 'gasolina', 'uber', 'táxi', 'taxi', 'celular', 'vivo', 'tim', 'claro', 'roupa', 'cabelo', 'barbeiro'],
}

const PALAVRAS_FORMA: Record<FormaPagamento, string[]> = {
  PIX: ['pix'],
  Cartão: ['cartão', 'cartao', 'credito', 'crédito'],
  Boleto: ['boleto'],
  'Débito em Conta': ['débito', 'debito', 'débito em conta'],
  Dinheiro: ['dinheiro', 'espécie', 'especie'],
}

const RECEITA = /\b(receita|recebi|recebo|entrada|sal[áa]rio|prov?ento|aluguel recebido|comiss[ãa]o)\b/i

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    // \p{Diacritic} cobre os acentos combinantes sem depender de como o
    // editor salva caracteres soltos neste arquivo.
    .replace(/\p{Diacritic}/gu, '')
}

/** Converte "1.234,56" ou "1234.56" em número. */
function numero(bruto: string): number {
  const s = bruto.replace(/[^\d.,]/g, '')
  if (!s) return NaN
  const temV = s.includes(',')
  const temP = s.includes('.')
  let n = s
  if (temV && temP) {
    n = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (temV || temP) {
    const sep = temV ? ',' : '.'
    const depois = s.slice(s.lastIndexOf(sep) + 1)
    n = /^\d{3}$/.test(depois) ? s.split(sep).join('') : temV ? s.replace(',', '.') : s
  }
  const v = Number(n)
  return Number.isFinite(v) ? v : NaN
}

/** Extrai a data mencionada e devolve o texto sem ela. */
function extrairData(texto: string): { vencimento: string; resto: string } {
  const hojeStr = hoje()
  let resto = texto

  const rel: [RegExp, number][] = [
    [/\bhoje\b/i, 0],
    [/\bamanh[ãa]\b/i, 1],
    [/\bontem\b/i, -1],
  ]
  for (const [re, delta] of rel) {
    if (re.test(resto)) {
      resto = resto.replace(re, ' ')
      const d = new Date(`${hojeStr}T00:00:00`)
      d.setDate(d.getDate() + delta)
      return {
        vencimento: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
        resto,
      }
    }
  }

  // "15/09" ou "15/09/2026"
  const barra = resto.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/)
  if (barra?.[1] && barra[2]) {
    resto = resto.replace(barra[0], ' ')
    const dia = barra[1].padStart(2, '0')
    const mes = barra[2].padStart(2, '0')
    const ano = barra[3]
      ? barra[3].length === 2
        ? `20${barra[3]}`
        : barra[3]
      : hojeStr.slice(0, 4)
    return { vencimento: `${ano}-${mes}-${dia}`, resto }
  }

  // "dia 15" — se já passou neste mês, entende como o mês que vem
  const diaSolto = resto.match(/\bdia\s+(\d{1,2})\b/i)
  if (diaSolto?.[1]) {
    resto = resto.replace(diaSolto[0], ' ')
    const dia = Number(diaSolto[1])
    const base = `${hojeStr.slice(0, 7)}-${String(dia).padStart(2, '0')}`
    return { vencimento: diasAte(base) < 0 ? avancarData(base, 1) : base, resto }
  }

  return { vencimento: hojeStr, resto }
}

/** Categoria a partir do histórico do próprio usuário — o sinal mais forte:
 *  se "Energia Ap" sempre foi Moradia, "energia" continua sendo. */
function categoriaPorHistorico(
  nome: string,
  estado: EstadoApp,
): { cat: string; tp: FormaPagamento } | null {
  const alvo = normalizar(nome)
  if (alvo.length < 3) return null

  let melhor: { l: Lancamento; peso: number } | null = null
  for (const itens of Object.values(estado.lancamentos)) {
    for (const l of itens) {
      const n = normalizar(l.nome)
      // combina se um contém o outro — "energia" acha "Energia Ap"
      const combina = n.includes(alvo) || alvo.includes(n)
      if (!combina) continue
      // mais recente ganha: hábitos mudam
      const peso = l.updatedAt
      if (!melhor || peso > melhor.peso) melhor = { l, peso }
    }
  }
  return melhor ? { cat: melhor.l.cat, tp: melhor.l.tp } : null
}

function categoriaPorPalavra(texto: string, catsValidas: string[]): string | null {
  const n = normalizar(texto)
  for (const [cat, palavras] of Object.entries(PALAVRAS_CATEGORIA)) {
    if (!catsValidas.includes(cat)) continue
    if (palavras.some((p) => n.includes(normalizar(p)))) return cat
  }
  return null
}

function formaPorPalavra(texto: string): { tp: FormaPagamento; resto: string } | null {
  const n = normalizar(texto)
  for (const forma of FORMAS_PAGAMENTO) {
    for (const p of PALAVRAS_FORMA[forma]) {
      const alvo = normalizar(p)
      if (new RegExp(`\\b${alvo}\\b`).test(n)) {
        return { tp: forma, resto: texto.replace(new RegExp(p, 'i'), ' ') }
      }
    }
  }
  return null
}

/** Lançamentos que combinam com o termo, na conta ativa. */
function procurar(estado: EstadoApp, termo: string, mesChave: string): Lancamento[] {
  const alvo = normalizar(termo)
  if (!alvo) return []
  const conta = estado.config.contaAtiva

  const todos: Lancamento[] = []
  for (const itens of Object.values(estado.lancamentos)) {
    for (const l of itens) {
      if (conta !== 'todas' && l.conta !== conta) continue
      if (normalizar(l.nome).includes(alvo) || normalizar(l.cat).includes(alvo)) todos.push(l)
    }
  }

  // O mês em foco primeiro, depois o mais recente: é quase sempre o que
  // o usuário quer mexer.
  return todos.sort((a, b) => {
    const aNoMes = a.vencimento.startsWith(mesChave) ? 0 : 1
    const bNoMes = b.vencimento.startsWith(mesChave) ? 0 : 1
    if (aNoMes !== bNoMes) return aNoMes - bNoMes
    return b.vencimento.localeCompare(a.vencimento)
  })
}

/**
 * Traduz o que o usuário digitou em uma intenção.
 *
 * Tudo local e determinístico: sem rede, sem chave de API, sem enviar
 * lançamento nenhum para fora. Para "energia 78" virar despesa isso é mais
 * rápido e mais previsível do que um modelo de linguagem — e continua
 * funcionando no avião.
 */
export function interpretar(entrada: string, estado: EstadoApp, mesChave: string): Intencao {
  const texto = (entrada ?? '').trim()
  if (!texto) return { t: 'vazio' }
  if (PEDE_AJUDA.test(texto)) return { t: 'ajuda' }

  const n = normalizar(texto)

  // ── perguntas de total ──
  if (/\bquanto\b/.test(n)) {
    const lista = doMes(estado, mesChave)

    if (/(falta|devo|pendente|pagar)/.test(n)) {
      const itens = lista.filter((l) => l.tl === 'despesa' && !l.pago)
      return {
        t: 'total',
        rotulo: 'Falta pagar neste mês',
        valor: itens.reduce((s, l) => s + l.valor, 0),
        itens,
      }
    }

    // "quanto gastei com alimentação"
    const comCat = texto.match(/\b(?:com|em|de)\s+(.+)$/i)
    if (comCat?.[1]) {
      const alvo = normalizar(comCat[1]);
      const itens = lista.filter(
        (l) => l.tl === 'despesa' && (normalizar(l.cat).includes(alvo) || normalizar(l.nome).includes(alvo)),
      )
      if (itens.length) {
        return {
          t: 'total',
          rotulo: `Gasto com ${comCat[1].trim()} neste mês`,
          valor: itens.reduce((s, l) => s + l.valor, 0),
          itens,
        }
      }
    }

    if (/(recebi|receita|entrou|entrada)/.test(n)) {
      const itens = lista.filter((l) => l.tl === 'receita')
      return {
        t: 'total',
        rotulo: 'Receitas do mês',
        valor: itens.reduce((s, l) => s + l.valor, 0),
        itens,
      }
    }

    const itens = lista.filter((l) => l.tl === 'despesa')
    return {
      t: 'total',
      rotulo: 'Despesas do mês',
      valor: itens.reduce((s, l) => s + l.valor, 0),
      itens,
    }
  }

  if (/\bvenc(e|endo|imento|em)\b/.test(n)) {
    const itens = doMes(estado, mesChave)
      .filter((l) => !l.pago && statusDe(l) !== 'pago')
      .sort((a, b) => a.vencimento.localeCompare(b.vencimento))
      .slice(0, 10)
    return {
      t: 'total',
      rotulo: 'A vencer neste mês',
      valor: itens.reduce((s, l) => s + l.valor, 0),
      itens,
    }
  }

  // ── comandos com verbo ──
  if (VERBOS_EXCLUIR.test(texto)) {
    const termo = texto.replace(VERBOS_EXCLUIR, '').trim()
    return { t: 'excluir', termo, candidatos: procurar(estado, termo, mesChave).slice(0, 8) }
  }
  if (VERBOS_PAGAR.test(texto)) {
    const termo = texto.replace(VERBOS_PAGAR, '').trim()
    return {
      t: 'pagar',
      termo,
      candidatos: procurar(estado, termo, mesChave)
        .filter((l) => !l.pago)
        .slice(0, 8),
    }
  }
  if (VERBOS_BUSCAR.test(texto)) {
    const termo = texto.replace(VERBOS_BUSCAR, '').trim()
    return { t: 'buscar', termo, resultados: procurar(estado, termo, mesChave).slice(0, 15) }
  }

  // ── tem valor? então é um lançamento novo ──
  const valorMatch = texto.match(/(?:r\$\s*)?(\d[\d.,]*)/i)
  const valor = valorMatch?.[1] ? numero(valorMatch[1]) : NaN

  if (Number.isFinite(valor) && valor > 0) {
    let resto = texto.replace(valorMatch?.[0] ?? '', ' ')

    const { vencimento, resto: semData } = extrairData(resto)
    resto = semData

    const forma = formaPorPalavra(resto)
    if (forma) resto = forma.resto

    const pago = /\b(pago|paguei|quitado)\b/i.test(resto)
    resto = resto.replace(/\b(pago|paguei|quitado)\b/gi, ' ')

    const ehReceita = RECEITA.test(resto) || texto.trim().startsWith('+')
    resto = resto.replace(/^\s*\+/, ' ').replace(/\b(receita|recebi|recebo|entrada)\b/gi, ' ')

    const nome = resto.replace(/\s+/g, ' ').trim().replace(/^[-–—,;]+|[-–—,;]+$/g, '').trim()
    if (!nome) return { t: 'buscar', termo: texto, resultados: [] }

    const tl: TipoLancamento = ehReceita ? 'receita' : 'despesa'
    const catsValidas = tl === 'receita' ? estado.catReceita : estado.catDespesa

    const doHistorico = categoriaPorHistorico(nome, estado)
    const porPalavra = doHistorico ? null : categoriaPorPalavra(nome, catsValidas)

    return {
      t: 'adicionar',
      rascunho: {
        tl,
        nome: nome.charAt(0).toUpperCase() + nome.slice(1),
        valor,
        vencimento,
        tp: forma?.tp ?? doHistorico?.tp ?? 'Dinheiro',
        cat: doHistorico?.cat ?? porPalavra ?? catsValidas[0] ?? 'Outros',
        pago,
        origemCat: doHistorico ? 'historico' : porPalavra ? 'palavra-chave' : 'padrao',
      },
    }
  }

  // ── sem valor e sem verbo: é busca ──
  return { t: 'buscar', termo: texto, resultados: procurar(estado, texto, mesChave).slice(0, 15) }
}
