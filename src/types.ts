/** Modelo de dados v5. Evolui o `fin-v4` original acrescentando
 *  id textual (uuid), conta, recorrência e carimbo de tempo para sync. */

export type TipoLancamento = 'receita' | 'despesa'

export const FORMAS_PAGAMENTO = [
  'Dinheiro',
  'PIX',
  'Cartão',
  'Débito em Conta',
  'Boleto',
] as const
export type FormaPagamento = (typeof FORMAS_PAGAMENTO)[number]

export type StatusLancamento = 'pago' | 'vencido' | 'alerta' | 'pendente'

export interface Lancamento {
  id: string
  tl: TipoLancamento
  nome: string
  valor: number
  /** YYYY-MM-DD */
  vencimento: string
  tp: FormaPagamento
  cat: string
  pago: boolean
  /** YYYY-MM-DD — data real do pagamento, null se não pago */
  data_pgto: string | null
  /** id da conta (ver Conta). Todo lançamento pertence a exatamente uma. */
  conta: string
  /** id da Recorrencia que gerou este lançamento, se houver */
  recorrenciaId?: string | null
  /** epoch ms — base do last-write-wins no sync */
  updatedAt: number
}

export interface Conta {
  id: string
  nome: string
  /** hex, usado no seletor e nas bordas */
  cor: string
  icone: string
  arquivada?: boolean
}

export const FREQUENCIAS = {
  mensal: { label: 'Mensal', meses: 1 },
  bimestral: { label: 'Bimestral', meses: 2 },
  trimestral: { label: 'Trimestral', meses: 3 },
  semestral: { label: 'Semestral', meses: 6 },
  anual: { label: 'Anual', meses: 12 },
} as const
export type Frequencia = keyof typeof FREQUENCIAS

export interface Recorrencia {
  id: string
  tl: TipoLancamento
  nome: string
  valor: number
  /** dia do vencimento (1–31); meses curtos grudam no último dia */
  dia: number
  tp: FormaPagamento
  cat: string
  conta: string
  frequencia: Frequencia
  /** YYYY-MM em que a série começa */
  inicio: string
  /** YYYY-MM em que a série termina (inclusive), null = indefinida */
  fim: string | null
  ativa: boolean
  updatedAt: number
}

/**
 * Posição em um fundo. Só acompanhamento: não há compra, venda nem
 * recomendação — o app registra o que você tem e mostra como evoluiu.
 */
export interface Posicao {
  /** código de negociação, ex.: HGLG11 */
  ticker: string
  quantidade: number
  /** preço médio de aquisição; null quando não informado — aí só dá para
   *  mostrar a variação do dia, não a rentabilidade */
  precoMedio: number | null
  updatedAt: number
}

export interface ConfigApp {
  /** id da conta selecionada, ou 'todas' */
  contaAtiva: string
  /** notificações locais de vencimento ligadas */
  notificacoes: boolean
  /** dias de antecedência do aviso de vencimento */
  diasAviso: number
  /** último YYYY-MM em que as recorrências foram materializadas */
  ultimaGeracaoRec: string | null
}

export interface EstadoApp {
  versao: 5
  /** lançamentos indexados por "YYYY-MM" */
  lancamentos: Record<string, Lancamento[]>
  catDespesa: string[]
  catReceita: string[]
  contas: Conta[]
  recorrencias: Recorrencia[]
  /** carteira de fundos, só para acompanhamento */
  carteira: Posicao[]
  config: ConfigApp
  updatedAt: number
}

/** Formato do arquivo de backup exportado. */
export interface ArquivoBackup {
  versao: string
  data: string
  /** v4: mapa mês -> lançamentos antigos. v5: estado completo. */
  financas?: Record<string, unknown[]>
  categorias?: string[]
  estado?: EstadoApp
}

// ── Constantes de domínio ──────────────────────────────────────────

export const CONTA_PF = 'pf'
export const CONTA_PJ = 'pj'

export const CONTAS_PADRAO: Conta[] = [
  { id: CONTA_PF, nome: 'Pessoal', cor: '#7c3aed', icone: '👤' },
  { id: CONTA_PJ, nome: 'Savino Group', cor: '#0ea5e9', icone: '🏢' },
]

export const CAT_RECEITA_PADRAO = ['Duty', 'Proventos', 'Aluguel', 'Comissão', 'Outros']

export const CAT_DESPESA_PADRAO = [
  'Moradia',
  'Alimentação',
  'Saúde',
  'Educação',
  'Pet',
  'Pessoal',
  'Assinatura',
  'Lazer',
  'Impostos',
  'Outros',
]

export const COR_TIPO: Record<FormaPagamento, string> = {
  Dinheiro: '#10b981',
  PIX: '#8b5cf6',
  Cartão: '#7c3aed',
  'Débito em Conta': '#f59e0b',
  Boleto: '#ef4444',
}

export const ICON_TIPO: Record<FormaPagamento, string> = {
  Dinheiro: '💵',
  PIX: '💜',
  Cartão: '💳',
  'Débito em Conta': '🏦',
  Boleto: '📄',
}

export const COR_CAT = [
  '#7c3aed',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#f97316',
  '#ec4899',
  '#84cc16',
  '#7c6b9e',
]

export function estadoVazio(): EstadoApp {
  return {
    versao: 5,
    lancamentos: {},
    catDespesa: [...CAT_DESPESA_PADRAO],
    catReceita: [...CAT_RECEITA_PADRAO],
    contas: CONTAS_PADRAO.map((c) => ({ ...c })),
    recorrencias: [],
    carteira: [],
    config: {
      contaAtiva: 'todas',
      notificacoes: false,
      diasAviso: 3,
      ultimaGeracaoRec: null,
    },
    updatedAt: Date.now(),
  }
}
