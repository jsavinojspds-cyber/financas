import { useEffect, useState } from 'react'
import { cx } from './ui'
import { aplicarAtualizacao, assinarAtualizacao, procurarAtualizacao } from '@/registrarSW'

/**
 * Botão 🔄 do cabeçalho — o mesmo do app antigo, mas agora com trabalho de
 * verdade por trás: procura uma versão nova no servidor e a instala.
 *
 * Num PWA com Service Worker isso não é luxo. O app é servido do cache para
 * funcionar offline, então sem um caminho explícito de atualização o usuário
 * poderia ficar preso numa versão antiga sem entender por quê.
 */
export function BotaoAtualizar({
  aoAvisar,
  aoAtualizarDados,
}: {
  aoAvisar: (msg: string) => void
  /** recarrega o que vem da rede (cotações) quando já estamos na última versão */
  aoAtualizarDados: () => void
}) {
  const [disponivel, setDisponivel] = useState(false)
  const [girando, setGirando] = useState(false)

  useEffect(() => assinarAtualizacao(setDisponivel), [])

  async function clicar() {
    // Já há versão em espera: aplica direto, sem nova ida ao servidor.
    if (disponivel) {
      aoAvisar('Atualizando…')
      aplicarAtualizacao()
      return
    }

    setGirando(true)
    const r = await procurarAtualizacao()
    setGirando(false)

    if (r === 'atualizando') {
      aoAvisar('Versão nova encontrada, atualizando…')
      // pequeno atraso para o toast aparecer antes do recarregamento
      setTimeout(() => aplicarAtualizacao(), 400)
      return
    }

    aoAtualizarDados()
    aoAvisar(
      r === 'indisponivel'
        ? 'Dados recarregados'
        : 'Você já está na versão mais recente',
    )
  }

  return (
    <button
      type="button"
      onClick={() => void clicar()}
      aria-label={disponivel ? 'Instalar atualização disponível' : 'Procurar atualização'}
      className={cx(
        // 44px: alvo mínimo de toque recomendado no iOS
        'relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[15px] shadow-neu-xs transition-colors active:shadow-neu-in-sm',
        disponivel ? 'bg-accent text-superficie' : 'bg-superficie',
      )}
    >
      <span className={cx('inline-block', girando && 'animate-spin')}>🔄</span>
      {disponivel ? (
        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-fundo bg-alerta" />
      ) : null}
    </button>
  )
}

/** Faixa que aparece quando uma versão nova terminou de baixar. */
export function AvisoAtualizacao() {
  const [disponivel, setDisponivel] = useState(false)
  useEffect(() => assinarAtualizacao(setDisponivel), [])

  if (!disponivel) return null

  return (
    <div className="mx-auto mt-2 flex max-w-xl items-center gap-3 rounded-xl bg-accent/10 px-3.5 py-2">
      <span className="text-[12px] font-bold text-accent">✨ Nova versão disponível</span>
      <button
        type="button"
        onClick={() => aplicarAtualizacao()}
        className="ml-auto shrink-0 rounded-lg bg-accent px-3 py-1 text-[11px] font-bold text-superficie"
      >
        Atualizar
      </button>
    </div>
  )
}
