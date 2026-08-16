import { useEffect, useRef } from 'react'
import type { EstadoApp } from '@/types'
import { avisarVencimentos } from './notificacoes'

/**
 * Dispara o aviso de vencimentos na abertura do app e sempre que ele volta
 * ao primeiro plano — os dois únicos momentos em que um PWA iOS roda código
 * sem servidor de push.
 */
export function usarNotificacoes(estado: EstadoApp) {
  // Ref para o listener não precisar ser recriado a cada mudança de estado.
  const ref = useRef(estado)
  ref.current = estado

  useEffect(() => {
    const verificar = () => void avisarVencimentos(ref.current)

    // pequeno atraso: dá tempo do Service Worker ficar pronto
    const t = setTimeout(verificar, 1500)

    const aoVoltar = () => {
      if (document.visibilityState === 'visible') verificar()
    }
    document.addEventListener('visibilitychange', aoVoltar)

    return () => {
      clearTimeout(t)
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [])
}
