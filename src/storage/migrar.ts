import {
  CAT_DESPESA_PADRAO,
  CAT_RECEITA_PADRAO,
  CONTA_PF,
  CONTA_PJ,
  CONTAS_PADRAO,
  FORMAS_PAGAMENTO,
  estadoVazio,
  type EstadoApp,
  type FormaPagamento,
  type Lancamento,
} from '@/types'
import { SEED_ABRIL_2026 } from '@/dados/seed-abril-2026'
import { idbChaves, idbGet, lsGet } from './idb'
import { novoId } from '@/lib/id'

/** Chaves do storage. As v4 continuam existindo intactas como rede de segurança. */
export const K_ESTADO = 'fin-v5'
export const K_V4_DADOS = 'fin-v4'
export const K_V4_CATS = 'fin-cats'
export const K_PIN = 'fin-pin'
export const K_SYNC = 'fin-sync'

export type OrigemDados = 'v5' | 'migrado-v4' | 'seed' | 'vazio'

export interface ResultadoCarga {
  estado: EstadoApp
  origem: OrigemDados
  /** quantos lançamentos vieram do fin-v4 (para mostrar no aviso de migração) */
  migrados: number
}

/** Formato dos lançamentos no `fin-v4`. Tudo é opcional porque
 *  dado de produção real sempre traz surpresa. */
interface LancamentoV4 {
  id?: number | string
  tl?: string
  nome?: string
  valor?: number | string
  vencimento?: string
  tp?: string
  cat?: string
  pago?: boolean
  data_pgto?: string | null
}

const ehFormaValida = (v: unknown): v is FormaPagamento =>
  typeof v === 'string' && (FORMAS_PAGAMENTO as readonly string[]).includes(v)

/** Regra escolhida na migração: nome começando com "Savino" é da PJ. */
function contaDoNome(nome: string): string {
  return /^\s*savino\b/i.test(nome) ? CONTA_PJ : CONTA_PF
}

const ISO_DATA = /^\d{4}-\d{2}-\d{2}$/

/** Converte um lançamento v4 em v5, descartando o que não dá para salvar. */
function converterLancamento(bruto: LancamentoV4, quando: number): Lancamento | null {
  const nome = typeof bruto.nome === 'string' ? bruto.nome.trim() : ''
  const valor = Number(bruto.valor)
  const vencimento = typeof bruto.vencimento === 'string' ? bruto.vencimento : ''

  // Sem nome, valor ou vencimento o registro é inútil e quebraria as telas.
  if (!nome || !Number.isFinite(valor) || !ISO_DATA.test(vencimento)) return null

  const pagoBruto = bruto.pago === true
  const dataPgto =
    typeof bruto.data_pgto === 'string' && ISO_DATA.test(bruto.data_pgto)
      ? bruto.data_pgto
      : null

  return {
    // ids numéricos (Date.now()) colidem e atrapalham o sync — viram uuid.
    id: novoId(),
    tl: bruto.tl === 'receita' ? 'receita' : 'despesa',
    nome,
    valor: Math.abs(valor),
    vencimento,
    tp: ehFormaValida(bruto.tp) ? bruto.tp : 'Dinheiro',
    cat: typeof bruto.cat === 'string' && bruto.cat ? bruto.cat : 'Outros',
    // se tem data de pagamento, está pago — resolve registros inconsistentes
    pago: pagoBruto || dataPgto !== null,
    data_pgto: dataPgto,
    conta: contaDoNome(nome),
    recorrenciaId: null,
    updatedAt: quando,
  }
}

/** Migra o mapa `{ "YYYY-MM": [...] }` do fin-v4 para o estado v5. */
export function migrarV4(
  dadosV4: Record<string, unknown>,
  catsV4: unknown,
): { estado: EstadoApp; migrados: number } {
  const estado = estadoVazio()
  const quando = Date.now()
  let migrados = 0

  for (const [mes, itens] of Object.entries(dadosV4)) {
    // A chave do mês é preservada como está: no dado real existem lançamentos
    // com vencimento em maio dentro do bucket de abril (fatura do cartão).
    if (!/^\d{4}-\d{2}$/.test(mes) || !Array.isArray(itens)) continue
    const convertidos: Lancamento[] = []
    for (const bruto of itens) {
      if (!bruto || typeof bruto !== 'object') continue
      const l = converterLancamento(bruto as LancamentoV4, quando)
      if (l) convertidos.push(l)
    }
    if (convertidos.length) {
      estado.lancamentos[mes] = convertidos
      migrados += convertidos.length
    }
  }

  if (Array.isArray(catsV4)) {
    const limpas = catsV4.filter((c): c is string => typeof c === 'string' && c.trim() !== '')
    if (limpas.length) estado.catDespesa = limpas
  }

  // Só mantém a conta PJ no seletor se algum lançamento realmente caiu nela.
  const usaPJ = Object.values(estado.lancamentos).some((ls) =>
    ls.some((l) => l.conta === CONTA_PJ),
  )
  if (!usaPJ) estado.contas = estado.contas.filter((c) => c.id !== CONTA_PJ)

  estado.updatedAt = quando
  return { estado, migrados }
}

/** Valida e normaliza um estado v5 vindo do storage ou de um backup. */
export function normalizarEstado(bruto: unknown): EstadoApp | null {
  if (!bruto || typeof bruto !== 'object') return null
  const e = bruto as Partial<EstadoApp>
  if (e.versao !== 5 || !e.lancamentos || typeof e.lancamentos !== 'object') return null

  const base = estadoVazio()
  const lancamentos: Record<string, Lancamento[]> = {}

  for (const [mes, itens] of Object.entries(e.lancamentos)) {
    if (!/^\d{4}-\d{2}$/.test(mes) || !Array.isArray(itens)) continue
    const validos = itens.filter(
      (l): l is Lancamento =>
        !!l &&
        typeof l === 'object' &&
        typeof (l as Lancamento).nome === 'string' &&
        Number.isFinite(Number((l as Lancamento).valor)) &&
        ISO_DATA.test(String((l as Lancamento).vencimento)),
    )
    // Registros antigos podem não ter id/conta/updatedAt — completamos aqui
    // para que nenhuma tela precise checar campo faltando.
    const completos = validos.map((l) => ({
      ...l,
      id: l.id || novoId(),
      conta: l.conta || contaDoNome(l.nome),
      valor: Math.abs(Number(l.valor)),
      pago: l.pago === true || !!l.data_pgto,
      data_pgto: l.data_pgto ?? null,
      updatedAt: Number(l.updatedAt) || Date.now(),
    }))
    if (completos.length) lancamentos[mes] = completos
  }

  const contas =
    Array.isArray(e.contas) && e.contas.length
      ? e.contas.filter((c) => c && typeof c.id === 'string' && typeof c.nome === 'string')
      : base.contas

  return {
    versao: 5,
    lancamentos,
    catDespesa:
      Array.isArray(e.catDespesa) && e.catDespesa.length ? e.catDespesa : CAT_DESPESA_PADRAO,
    catReceita:
      Array.isArray(e.catReceita) && e.catReceita.length ? e.catReceita : CAT_RECEITA_PADRAO,
    contas: contas.length ? contas : CONTAS_PADRAO.map((c) => ({ ...c })),
    recorrencias: Array.isArray(e.recorrencias) ? e.recorrencias : [],
    // Estado gravado antes da carteira existir não tem o campo.
    carteira: Array.isArray(e.carteira) ? e.carteira : [],
    config: { ...base.config, ...(e.config ?? {}) },
    updatedAt: Number(e.updatedAt) || Date.now(),
  }
}

function parse(raw: string | null): unknown {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** Lê uma chave preferindo o IndexedDB, com localStorage como resgate. */
async function lerChave(chave: string): Promise<unknown> {
  const doIdb = parse(await idbGet<string>(chave))
  if (doIdb) return doIdb
  return parse(lsGet(chave))
}

/**
 * Relê o `fin-v4` e migra, ignorando o `fin-v5` que já exista.
 *
 * Existe porque a carga normal é uma escada de prioridade: achou `fin-v5`,
 * nem olha o `fin-v4`. Se o app abriu uma vez num storage vazio, gravou a
 * base inicial como `fin-v5` e a partir daí a migração ficaria bloqueada
 * para sempre, mesmo com os dados antigos intactos ao lado. Este é o botão
 * de resgate para essa situação.
 */
export async function migrarV4Forcado(): Promise<{
  estado: EstadoApp
  migrados: number
} | null> {
  const v4 = await lerChave(K_V4_DADOS)
  if (!v4 || typeof v4 !== 'object' || !Object.keys(v4).length) return null
  const cats = await lerChave(K_V4_CATS)
  return migrarV4(v4 as Record<string, unknown>, cats)
}

export interface ItemDiagnostico {
  chave: string
  /** tamanho em bytes do JSON gravado */
  bytes: number
  /** quantos lançamentos dá para contar dentro, quando aplicável */
  lancamentos: number | null
}

export interface Diagnostico {
  idb: ItemDiagnostico[]
  ls: ItemDiagnostico[]
  idbDisponivel: boolean
}

function contarLancamentos(bruto: string): number | null {
  try {
    const o = JSON.parse(bruto) as Record<string, unknown>
    // aceita tanto o mapa do v4 quanto o estado v5
    const mapa = (o?.['lancamentos'] ?? o) as Record<string, unknown>
    if (!mapa || typeof mapa !== 'object') return null
    let n = 0
    let achouMes = false
    for (const [k, v] of Object.entries(mapa)) {
      if (/^\d{4}-\d{2}$/.test(k) && Array.isArray(v)) {
        achouMes = true
        n += v.length
      }
    }
    return achouMes ? n : null
  } catch {
    return null
  }
}

/** Fotografia do que existe em cada storage. Usado na tela de Ajustes para
 *  diagnosticar à distância um aparelho que não dá para inspecionar. */
export async function diagnosticoStorage(): Promise<Diagnostico> {
  const interessantes = [K_ESTADO, K_V4_DADOS, K_V4_CATS, K_PIN, K_SYNC]

  const chavesIdb = await idbChaves()
  const idb: ItemDiagnostico[] = []
  for (const chave of interessantes) {
    if (!chavesIdb.includes(chave)) continue
    const bruto = await idbGet<string>(chave)
    if (typeof bruto !== 'string') continue
    idb.push({
      chave,
      bytes: bruto.length,
      lancamentos: chave === K_PIN ? null : contarLancamentos(bruto),
    })
  }

  const ls: ItemDiagnostico[] = []
  for (const chave of interessantes) {
    const bruto = lsGet(chave)
    if (typeof bruto !== 'string' || !bruto) continue
    ls.push({
      chave,
      bytes: bruto.length,
      lancamentos: chave === K_PIN ? null : contarLancamentos(bruto),
    })
  }

  return { idb, ls, idbDisponivel: chavesIdb.length > 0 || idb.length > 0 }
}

/**
 * Carrega o estado do app na ordem: v5 → migração do v4 → seed inicial.
 * Nunca lança: qualquer falha cai no estado vazio para o app abrir mesmo assim.
 */
export async function carregarEstado(): Promise<ResultadoCarga> {
  try {
    const v5 = normalizarEstado(await lerChave(K_ESTADO))
    if (v5) return { estado: v5, origem: 'v5', migrados: 0 }

    const v4 = await lerChave(K_V4_DADOS)
    if (v4 && typeof v4 === 'object' && Object.keys(v4).length > 0) {
      const cats = await lerChave(K_V4_CATS)
      const { estado, migrados } = migrarV4(v4 as Record<string, unknown>, cats)
      return { estado, origem: 'migrado-v4', migrados }
    }

    // Não achou nada. NÃO gravamos nada aqui de propósito.
    //
    // A versão anterior carregava a base de abril automaticamente e o
    // auto-save a persistia como `fin-v5` em seguida. O efeito colateral era
    // grave: como a carga é uma escada (achou v5, nem olha o v4), bastava
    // abrir o app uma vez num storage vazio — outro navegador, outro
    // container do iOS — para a migração ficar bloqueada para sempre, com os
    // dados antigos intactos e inalcançáveis ao lado.
    //
    // Agora o app pergunta o que fazer antes de escrever qualquer coisa.
    return { estado: estadoVazio(), origem: 'vazio', migrados: 0 }
  } catch {
    return { estado: estadoVazio(), origem: 'vazio', migrados: 0 }
  }
}

/** Base de abril/2026 do app original, oferecida como opção na primeira
 *  abertura em vez de aplicada sozinha. */
export function estadoDeExemplo(): EstadoApp {
  const estado = estadoVazio()
  estado.lancamentos['2026-04'] = SEED_ABRIL_2026.map((l) => ({ ...l }))
  return estado
}
