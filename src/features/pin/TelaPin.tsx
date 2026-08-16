import { useEffect, useRef, useState } from 'react'
import { cx } from '@/components/ui'
import { lerPin, PIN_PADRAO } from './pin'

/** Tela de bloqueio. 4 dígitos com avanço automático de foco. */
export function TelaPin({ aoDesbloquear }: { aoDesbloquear: () => void }) {
  const [digitos, setDigitos] = useState(['', '', '', ''])
  const [tremendo, setTremendo] = useState(false)
  const [erro, setErro] = useState(false)
  const refs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    // o iOS ignora .focus() cedo demais no ciclo de vida da tela
    const t = setTimeout(() => refs.current[0]?.focus(), 350)
    return () => clearTimeout(t)
  }, [])

  async function verificar(pin: string) {
    const salvo = await lerPin()
    if (pin === salvo) {
      aoDesbloquear()
      return
    }
    setErro(true)
    setTremendo(true)
    setTimeout(() => setTremendo(false), 350)
    setTimeout(() => {
      setDigitos(['', '', '', ''])
      refs.current[0]?.focus()
    }, 380)
  }

  function aoDigitar(i: number, valor: string) {
    const d = valor.replace(/\D/g, '').slice(-1)
    const novos = [...digitos]
    novos[i] = d
    setDigitos(novos)
    setErro(false)

    if (d && i < 3) refs.current[i + 1]?.focus()
    if (d && i === 3) void verificar(novos.join(''))
  }

  function aoTeclar(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    // backspace num campo vazio volta para o anterior
    if (e.key === 'Backspace' && !digitos[i] && i > 0) {
      e.preventDefault()
      const novos = [...digitos]
      novos[i - 1] = ''
      setDigitos(novos)
      refs.current[i - 1]?.focus()
    }
  }

  return (
    <div className="pad-topo pad-base flex min-h-[100dvh] flex-col items-center justify-center px-8">
      <div className="w-full max-w-xs animate-pinIn text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-superficie text-4xl shadow-neu">
          🔒
        </div>
        <h1 className="mt-6 text-xl font-bold text-tinta">Finanças</h1>
        <p className="mt-1 text-[13px] text-tinta-2">Digite seu PIN de 4 dígitos</p>

        <div className={cx('mt-8 flex justify-center gap-3', tremendo && 'animate-shake')}>
          {digitos.map((d, i) => (
            <input
              key={i}
              ref={(el) => {
                refs.current[i] = el
              }}
              value={d}
              onChange={(e) => aoDigitar(i, e.target.value)}
              onKeyDown={(e) => aoTeclar(i, e)}
              // inputMode numeric abre o teclado numérico do iOS;
              // type=password mascara sem virar campo de senha do Safari.
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={1}
              aria-label={`Dígito ${i + 1} do PIN`}
              className={cx(
                'h-16 w-14 rounded-2xl text-center !text-2xl font-bold caret-transparent',
                erro && '!shadow-[inset_3px_3px_6px_#e7a5a5,inset_-3px_-3px_6px_#ffffff]',
              )}
            />
          ))}
        </div>

        {/* ocupa o espaço sempre para o layout não pular, mas só é anunciado
            pelo leitor de tela quando há erro de fato */}
        <p
          role="alert"
          aria-hidden={!erro}
          className={cx(
            'mt-4 text-[12px] font-semibold transition-opacity',
            erro ? 'text-despesa opacity-100' : 'opacity-0',
          )}
        >
          PIN incorreto
        </p>

        <p className="mt-10 text-[11px] text-tinta-3">
          PIN padrão {PIN_PADRAO} — troque em Ajustes
        </p>
      </div>
    </div>
  )
}
