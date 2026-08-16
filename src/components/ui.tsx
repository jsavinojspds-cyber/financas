import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { useEffect } from 'react'

export function cx(...partes: (string | false | null | undefined)[]): string {
  return partes.filter(Boolean).join(' ')
}

/** Card neumórfico — o elemento base de toda a interface. */
export function Neu({
  children,
  className,
  onClick,
  sombra = 'neu',
}: {
  children: ReactNode
  className?: string
  onClick?: () => void
  sombra?: 'neu' | 'neu-sm' | 'neu-xs' | 'neu-in'
}) {
  const sombras = {
    neu: 'shadow-neu',
    'neu-sm': 'shadow-neu-sm',
    'neu-xs': 'shadow-neu-xs',
    'neu-in': 'shadow-neu-in',
  } as const
  return (
    <div
      className={cx('rounded-2xl bg-superficie', sombras[sombra], className)}
      {...(onClick ? { onClick, role: 'button' } : {})}
    >
      {children}
    </div>
  )
}

type VarianteBotao = 'primario' | 'suave' | 'perigo' | 'fantasma'

export function Botao({
  variante = 'suave',
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: VarianteBotao }) {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-bold ' +
    'transition-[box-shadow,transform] duration-100 active:scale-[.98] disabled:opacity-40 ' +
    'disabled:active:scale-100'
  const variantes: Record<VarianteBotao, string> = {
    primario: 'bg-accent text-superficie shadow-neu-sm active:shadow-neu-in-sm',
    suave: 'bg-superficie text-tinta-2 shadow-neu-sm active:shadow-neu-in-sm',
    perigo: 'bg-despesa text-white shadow-neu-sm active:shadow-neu-in-sm',
    fantasma: 'bg-transparent text-tinta-2',
  }
  return (
    <button type="button" className={cx(base, variantes[variante], className)} {...props}>
      {children}
    </button>
  )
}

export function Rotulo({ children }: { children: ReactNode }) {
  return (
    <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-tinta-3">
      {children}
    </span>
  )
}

export function Campo({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx('w-full px-3.5 py-3 text-tinta', className)} {...props} />
}

export function Selecao({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    // seta desenhada à mão: o `appearance-none` remove a nativa do iOS
    <div className="relative">
      <select className={cx('w-full px-3.5 py-3 pr-9 text-tinta', className)} {...props}>
        {children}
      </select>
      <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] text-tinta-3">
        ▼
      </span>
    </div>
  )
}

/** Bottom sheet — o padrão de modal do iOS. */
export function Folha({
  aberta,
  aoFechar,
  titulo,
  children,
  rodape,
}: {
  aberta: boolean
  aoFechar: () => void
  titulo: string
  children: ReactNode
  rodape?: ReactNode
}) {
  // trava o scroll do fundo enquanto a folha está aberta
  useEffect(() => {
    if (!aberta) return
    const anterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = anterior
    }
  }, [aberta])

  useEffect(() => {
    if (!aberta) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [aberta, aoFechar])

  if (!aberta) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 animate-fadeIn bg-tinta/30" onClick={aoFechar} />
      <div className="pad-base relative max-h-[92dvh] w-full max-w-xl animate-sheetIn overflow-y-auto rounded-t-3xl bg-fundo shadow-neu">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-borda bg-fundo px-5 pb-3 pt-4">
          <h2 className="text-[15px] font-bold text-tinta">{titulo}</h2>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-superficie text-tinta-2 shadow-neu-xs"
          >
            ✕
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {rodape ? (
          <div className="sticky bottom-0 border-t border-borda bg-fundo px-5 py-3">{rodape}</div>
        ) : null}
      </div>
    </div>
  )
}

/** Diálogo curto de confirmação, centralizado. */
export function Confirmar({
  aberto,
  titulo,
  descricao,
  rotuloOk = 'Confirmar',
  perigo,
  aoConfirmar,
  aoCancelar,
}: {
  aberto: boolean
  titulo: string
  descricao?: string
  rotuloOk?: string
  perigo?: boolean
  aoConfirmar: () => void
  aoCancelar: () => void
}) {
  if (!aberto) return null
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-6">
      <div className="absolute inset-0 animate-fadeIn bg-tinta/30" onClick={aoCancelar} />
      <Neu className="relative w-full max-w-sm animate-fadeIn p-5">
        <h3 className="text-[15px] font-bold text-tinta">{titulo}</h3>
        {descricao ? <p className="mt-1.5 text-[13px] text-tinta-2">{descricao}</p> : null}
        <div className="mt-4 flex gap-2.5">
          <Botao className="flex-1" onClick={aoCancelar}>
            Cancelar
          </Botao>
          <Botao
            className="flex-1"
            variante={perigo ? 'perigo' : 'primario'}
            onClick={aoConfirmar}
          >
            {rotuloOk}
          </Botao>
        </div>
      </Neu>
    </div>
  )
}

export interface DadosToast {
  msg: string
  /** ação opcional — usada pelo "Desfazer" da exclusão */
  acao?: { rotulo: string; fn: () => void }
}

export function Toast({ dados, aoFechar }: { dados: DadosToast | null; aoFechar: () => void }) {
  if (!dados) return null
  return (
    <div className="pad-base fixed bottom-4 left-1/2 z-[70] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 animate-slideUp">
      <div className="flex items-center gap-3 rounded-2xl bg-tinta px-4 py-3 text-[13px] font-semibold text-superficie shadow-lg">
        <span className="flex-1">{dados.msg}</span>
        {dados.acao ? (
          <button
            type="button"
            className="shrink-0 rounded-lg bg-white/15 px-3 py-1.5 text-[12px] font-bold"
            onClick={() => {
              dados.acao?.fn()
              aoFechar()
            }}
          >
            {dados.acao.rotulo}
          </button>
        ) : (
          <button type="button" aria-label="Fechar aviso" onClick={aoFechar} className="shrink-0 opacity-60">
            ✕
          </button>
        )}
      </div>
    </div>
  )
}

/** Barra de progresso simples com trilho inset. */
export function Barra({ pct, cor = '#7c3aed' }: { pct: number; cor?: string }) {
  const v = Math.max(0, Math.min(100, pct))
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-fundo shadow-neu-in-sm">
      <div
        className="h-full rounded-full transition-[width] duration-300"
        style={{ width: `${v}%`, background: cor }}
      />
    </div>
  )
}

export function Vazio({ icone, titulo, dica }: { icone: string; titulo: string; dica?: string }) {
  return (
    <div className="py-14 text-center">
      <div className="text-4xl opacity-50">{icone}</div>
      <p className="mt-3 text-[14px] font-semibold text-tinta-3">{titulo}</p>
      {dica ? <p className="mt-1 text-[12px] text-tinta-3">{dica}</p> : null}
    </div>
  )
}
