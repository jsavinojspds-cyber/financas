import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { EstadoApp } from '@/types'
import { carregarEstado, K_ESTADO, type OrigemDados } from '@/storage/migrar'
import { criarPersistidor, type EstadoGravacao } from '@/storage/persistir'
import { reducer, estadoInicial, type Acao } from './reducer'
import { chave } from '@/lib/formato'
import { somarMeses } from '@/lib/recorrencia'

interface Loja {
  estado: EstadoApp
  dispatch: (a: Acao) => void
  carregando: boolean
  gravacao: EstadoGravacao
  origem: OrigemDados
  /** quantos lançamentos vieram da migração do fin-v4 */
  migrados: number
  /** força a gravação imediata (usado antes de exportar backup) */
  salvarAgora: () => Promise<void>
  /** não havia nada no storage: o app espera o usuário decidir antes de gravar */
  precisaEscolher: boolean
  /** aplica a escolha da primeira abertura e libera o auto-save */
  resolverPrimeiraAbertura: (e: EstadoApp) => void
}

const Ctx = createContext<Loja | null>(null)

export function ProvedorLoja({ children }: { children: ReactNode }) {
  const [estado, dispatch] = useReducer(reducer, estadoInicial)
  const [carregando, setCarregando] = useState(true)
  const [gravacao, setGravacao] = useState<EstadoGravacao>('salvo')
  const [origem, setOrigem] = useState<OrigemDados>('vazio')
  const [migrados, setMigrados] = useState(0)
  const [precisaEscolher, setPrecisaEscolher] = useState(false)

  const persistidor = useMemo(() => criarPersistidor(K_ESTADO), [])
  // Evita gravar o estado inicial vazio por cima do que está no disco
  // antes de a carga terminar.
  const pronto = useRef(false)

  useEffect(() => persistidor.assinar(setGravacao), [persistidor])

  useEffect(() => {
    let vivo = true
    void (async () => {
      const r = await carregarEstado()
      if (!vivo) return
      dispatch({ t: 'carregar', estado: r.estado })
      setOrigem(r.origem)
      setMigrados(r.migrados)
      // Storage vazio: nada é gravado até o usuário escolher o que fazer.
      // Gravar aqui seria o bastante para bloquear a migração do fin-v4.
      setPrecisaEscolher(r.origem === 'vazio')
      setCarregando(false)
      pronto.current = true

      // Gera as ocorrências das recorrências até o mês que vem, para que o
      // resumo e o fluxo já mostrem o que está por vir. É idempotente.
      const agora = new Date()
      dispatch({
        t: 'materializar',
        ateMes: somarMeses(chave(agora.getFullYear(), agora.getMonth()), 1),
      })

      // A migração do v4 precisa ser gravada logo: se o app for fechado antes
      // do primeiro auto-save, ela seria refeita do zero na próxima abertura.
      if (r.origem === 'migrado-v4') persistidor.agendar(JSON.stringify(r.estado))
    })()
    return () => {
      vivo = false
    }
  }, [persistidor])

  // ── Auto-save: substitui o botão "💾 Salvar" do app antigo ──
  useEffect(() => {
    if (!pronto.current || precisaEscolher) return
    persistidor.agendar(JSON.stringify(estado))
  }, [estado, persistidor, precisaEscolher])

  const salvarAgora = useCallback(() => persistidor.flush(), [persistidor])

  const resolverPrimeiraAbertura = useCallback((e: EstadoApp) => {
    dispatch({ t: 'substituir', estado: e })
    setPrecisaEscolher(false)
  }, [])

  const valor = useMemo<Loja>(
    () => ({
      estado,
      dispatch,
      carregando,
      gravacao,
      origem,
      migrados,
      salvarAgora,
      precisaEscolher,
      resolverPrimeiraAbertura,
    }),
    [
      estado,
      carregando,
      gravacao,
      origem,
      migrados,
      salvarAgora,
      precisaEscolher,
      resolverPrimeiraAbertura,
    ],
  )

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function useLoja(): Loja {
  const c = useContext(Ctx)
  if (!c) throw new Error('useLoja precisa estar dentro de <ProvedorLoja>')
  return c
}
