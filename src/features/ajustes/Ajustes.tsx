import { useRef, useState } from 'react'
import { Botao, Campo, Confirmar, Folha, Neu, Rotulo, cx } from '@/components/ui'
import { useLoja } from '@/state/store'
import { gravarPin } from '@/features/pin/pin'
import { migrarV4, normalizarEstado } from '@/storage/migrar'
import type { ArquivoBackup, Conta } from '@/types'
import { novoId } from '@/lib/id'
import {
  ehPwaInstalado,
  notificacoesSuportadas,
  pedirPermissao,
  permissaoAtual,
} from '@/features/notificacoes/notificacoes'
import { PainelSync } from '@/sync/PainelSync'

type Secao = 'menu' | 'pin' | 'contas' | 'backup' | 'notificacoes' | 'sync'

export function Ajustes({
  aberto,
  aoFechar,
  aoAvisar,
}: {
  aberto: boolean
  aoFechar: () => void
  aoAvisar: (msg: string) => void
}) {
  const [secao, setSecao] = useState<Secao>('menu')

  const titulos: Record<Secao, string> = {
    menu: 'Ajustes',
    pin: 'Alterar PIN',
    contas: 'Contas',
    backup: 'Backup e restauração',
    notificacoes: 'Notificações',
    sync: 'Sincronização',
  }

  return (
    <Folha
      aberta={aberto}
      aoFechar={() => {
        setSecao('menu')
        aoFechar()
      }}
      titulo={titulos[secao]}
      rodape={
        secao !== 'menu' ? (
          <Botao className="w-full" onClick={() => setSecao('menu')}>
            ‹ Voltar
          </Botao>
        ) : undefined
      }
    >
      {secao === 'menu' ? <Menu aoAbrir={setSecao} /> : null}
      {secao === 'pin' ? <SecaoPin aoAvisar={aoAvisar} /> : null}
      {secao === 'contas' ? <SecaoContas aoAvisar={aoAvisar} /> : null}
      {secao === 'backup' ? <SecaoBackup aoAvisar={aoAvisar} /> : null}
      {secao === 'notificacoes' ? <SecaoNotificacoes aoAvisar={aoAvisar} /> : null}
      {secao === 'sync' ? <PainelSync aoAvisar={aoAvisar} /> : null}
    </Folha>
  )
}

function Menu({ aoAbrir }: { aoAbrir: (s: Secao) => void }) {
  const { estado, origem, gravacao } = useLoja()
  const totalLancamentos = Object.values(estado.lancamentos).reduce((s, l) => s + l.length, 0)

  const itens: { s: Secao; icone: string; titulo: string; dica: string }[] = [
    { s: 'pin', icone: '🔒', titulo: 'Alterar PIN', dica: '4 dígitos de acesso' },
    {
      s: 'contas',
      icone: '👥',
      titulo: 'Contas',
      dica: `${estado.contas.length} cadastrada(s)`,
    },
    { s: 'backup', icone: '💾', titulo: 'Backup e restauração', dica: 'Exportar / importar JSON' },
    {
      s: 'notificacoes',
      icone: '🔔',
      titulo: 'Notificações',
      dica: estado.config.notificacoes ? 'Ligadas' : 'Desligadas',
    },
    { s: 'sync', icone: '☁️', titulo: 'Sincronização', dica: 'Supabase (opcional)' },
  ]

  return (
    <div className="flex flex-col gap-2.5">
      {itens.map((i) => (
        <button
          key={i.s}
          type="button"
          onClick={() => aoAbrir(i.s)}
          className="flex items-center gap-3 rounded-2xl bg-superficie p-3.5 text-left shadow-neu-xs active:shadow-neu-in-sm"
        >
          <span className="text-lg">{i.icone}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-bold text-tinta">{i.titulo}</span>
            <span className="block text-[11px] text-tinta-3">{i.dica}</span>
          </span>
          <span className="text-tinta-3">›</span>
        </button>
      ))}

      <Neu className="mt-2 p-3.5" sombra="neu-in">
        <h4 className="text-[11px] font-bold uppercase tracking-wider text-tinta-3">
          Estado dos dados
        </h4>
        <dl className="mt-2 flex flex-col gap-1 text-[12px]">
          <Linha rotulo="Lançamentos" valor={String(totalLancamentos)} />
          <Linha rotulo="Meses com dados" valor={String(Object.keys(estado.lancamentos).length)} />
          <Linha rotulo="Lançamentos fixos" valor={String(estado.recorrencias.length)} />
          <Linha
            rotulo="Origem"
            valor={
              origem === 'v5'
                ? 'Storage atual'
                : origem === 'migrado-v4'
                  ? 'Migrado do app antigo'
                  : origem === 'seed'
                    ? 'Dados iniciais'
                    : 'Vazio'
            }
          />
          <Linha rotulo="Gravação" valor={gravacao === 'salvo' ? 'Tudo salvo' : gravacao} />
        </dl>
        <p className="mt-2.5 text-[11px] leading-relaxed text-tinta-3">
          Salvamento é automático a cada alteração, em IndexedDB com espelho no localStorage.
        </p>
      </Neu>
    </div>
  )
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-tinta-2">{rotulo}</dt>
      <dd className="font-mono font-bold text-tinta">{valor}</dd>
    </div>
  )
}

// ── PIN ─────────────────────────────────────────────────────────────

function SecaoPin({ aoAvisar }: { aoAvisar: (m: string) => void }) {
  const [novo, setNovo] = useState('')
  const [conf, setConf] = useState('')

  const valido = /^\d{4}$/.test(novo) && novo === conf

  async function salvar() {
    if (!valido) return
    const ok = await gravarPin(novo)
    aoAvisar(ok ? 'PIN alterado' : 'Não foi possível gravar o PIN')
    setNovo('')
    setConf('')
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Rotulo>Novo PIN</Rotulo>
        <Campo
          value={novo}
          onChange={(e) => setNovo(e.target.value.replace(/\D/g, '').slice(0, 4))}
          inputMode="numeric"
          type="password"
          placeholder="••••"
          className="font-mono tracking-[0.5em]"
        />
      </div>
      <div>
        <Rotulo>Confirmar</Rotulo>
        <Campo
          value={conf}
          onChange={(e) => setConf(e.target.value.replace(/\D/g, '').slice(0, 4))}
          inputMode="numeric"
          type="password"
          placeholder="••••"
          className="font-mono tracking-[0.5em]"
        />
      </div>
      {conf && novo !== conf ? (
        <p className="text-[12px] font-semibold text-despesa">Os PINs não coincidem</p>
      ) : null}
      <Botao variante="primario" disabled={!valido} onClick={() => void salvar()}>
        Salvar PIN
      </Botao>
      <p className="text-[11px] leading-relaxed text-tinta-3">
        O PIN passa a ser guardado no IndexedDB, não só no localStorage. Antes, quando o Safari
        limpava o site, ele voltava para 1234 sem aviso.
      </p>
    </div>
  )
}

// ── Contas ──────────────────────────────────────────────────────────

const CORES_CONTA = ['#7c3aed', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#7c6b9e']
const ICONES_CONTA = ['👤', '🏢', '💼', '🏠', '🚗', '🐾']

function SecaoContas({ aoAvisar }: { aoAvisar: (m: string) => void }) {
  const { estado, dispatch } = useLoja()
  const [editando, setEditando] = useState<Conta | null>(null)
  const [removendo, setRemovendo] = useState<Conta | null>(null)

  const usos = (id: string) =>
    Object.values(estado.lancamentos).reduce(
      (s, itens) => s + itens.filter((l) => l.conta === id).length,
      0,
    )

  function salvar(c: Conta) {
    const existe = estado.contas.some((x) => x.id === c.id)
    dispatch({
      t: 'contas',
      contas: existe ? estado.contas.map((x) => (x.id === c.id ? c : x)) : [...estado.contas, c],
    })
    setEditando(null)
    aoAvisar('Conta salva')
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] leading-relaxed text-tinta-2">
        Separe finanças pessoais das da empresa. O seletor no topo filtra tudo — resumo, listas,
        fluxo e análise.
      </p>

      {estado.contas.map((c) => (
        <Neu key={c.id} className="p-3.5" sombra="neu-xs">
          <div className="flex items-center gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[15px]"
              style={{ background: `${c.cor}1f` }}
            >
              {c.icone}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-bold text-tinta">{c.nome}</span>
              <span className="block text-[11px] text-tinta-3">{usos(c.id)} lançamento(s)</span>
            </span>
            <button
              type="button"
              aria-label={`Editar ${c.nome}`}
              onClick={() => setEditando(c)}
              className="px-2 text-tinta-2"
            >
              ✏️
            </button>
            {estado.contas.length > 1 ? (
              <button
                type="button"
                aria-label={`Excluir ${c.nome}`}
                onClick={() => setRemovendo(c)}
                className="px-2 text-tinta-2"
              >
                🗑
              </button>
            ) : null}
          </div>
        </Neu>
      ))}

      <Botao
        variante="primario"
        onClick={() =>
          setEditando({
            id: novoId(),
            nome: '',
            cor: CORES_CONTA[estado.contas.length % CORES_CONTA.length] ?? '#7c3aed',
            icone: ICONES_CONTA[estado.contas.length % ICONES_CONTA.length] ?? '👤',
          })
        }
      >
        + Nova conta
      </Botao>

      {editando ? (
        <Neu className="p-4" sombra="neu-in">
          <Rotulo>Nome</Rotulo>
          <Campo
            value={editando.nome}
            onChange={(e) => setEditando({ ...editando, nome: e.target.value })}
            placeholder="Ex: Savino Group"
            autoCapitalize="words"
          />

          <div className="mt-3">
            <Rotulo>Ícone</Rotulo>
            <div className="flex flex-wrap gap-2">
              {ICONES_CONTA.map((i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setEditando({ ...editando, icone: i })}
                  className={cx(
                    'h-10 w-10 rounded-xl text-lg',
                    editando.icone === i ? 'bg-accent/15 shadow-neu-xs' : 'shadow-neu-in-sm',
                  )}
                >
                  {i}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3">
            <Rotulo>Cor</Rotulo>
            <div className="flex flex-wrap gap-2">
              {CORES_CONTA.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Cor ${c}`}
                  onClick={() => setEditando({ ...editando, cor: c })}
                  className={cx(
                    'h-9 w-9 rounded-full transition-transform',
                    editando.cor === c && 'scale-110 ring-2 ring-tinta ring-offset-2 ring-offset-superficie',
                  )}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>

          <div className="mt-4 flex gap-2.5">
            <Botao className="flex-1" onClick={() => setEditando(null)}>
              Cancelar
            </Botao>
            <Botao
              className="flex-[2]"
              variante="primario"
              disabled={!editando.nome.trim()}
              onClick={() => salvar({ ...editando, nome: editando.nome.trim() })}
            >
              Salvar
            </Botao>
          </div>
        </Neu>
      ) : null}

      <Confirmar
        aberto={removendo !== null}
        titulo="Excluir conta?"
        descricao={
          removendo && usos(removendo.id) > 0
            ? `${usos(removendo.id)} lançamento(s) estão nesta conta e deixarão de aparecer nos filtros. Eles não são apagados.`
            : undefined
        }
        rotuloOk="Excluir"
        perigo
        aoConfirmar={() => {
          if (removendo) {
            dispatch({ t: 'contas', contas: estado.contas.filter((c) => c.id !== removendo.id) })
            aoAvisar('Conta removida')
          }
          setRemovendo(null)
        }}
        aoCancelar={() => setRemovendo(null)}
      />
    </div>
  )
}

// ── Backup ──────────────────────────────────────────────────────────

function SecaoBackup({ aoAvisar }: { aoAvisar: (m: string) => void }) {
  const { estado, dispatch, salvarAgora } = useLoja()
  const inputRef = useRef<HTMLInputElement>(null)
  const [confirmarImport, setConfirmarImport] = useState<ArquivoBackup | null>(null)

  async function exportar() {
    await salvarAgora()
    const pacote: ArquivoBackup = {
      versao: '5.0',
      data: new Date().toISOString(),
      estado,
      // mantém as chaves v4 no arquivo para que um backup novo ainda possa
      // ser lido pelo app antigo, se for preciso voltar atrás
      financas: estado.lancamentos as unknown as Record<string, unknown[]>,
      categorias: estado.catDespesa,
    }
    const blob = new Blob([JSON.stringify(pacote, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `financas-backup-${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    aoAvisar('Backup exportado')
  }

  function aoEscolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const arq = e.target.files?.[0]
    if (!arq) return
    const leitor = new FileReader()
    leitor.onload = (ev) => {
      try {
        const dados = JSON.parse(String(ev.target?.result)) as ArquivoBackup
        if (!dados.estado && !dados.financas) throw new Error('inválido')
        setConfirmarImport(dados)
      } catch {
        aoAvisar('Arquivo de backup inválido')
      }
    }
    leitor.readAsText(arq)
    // permite reimportar o mesmo arquivo depois de cancelar
    e.target.value = ''
  }

  function aplicarImport(dados: ArquivoBackup) {
    // Backup novo (v5) entra direto; backup do app antigo passa pela migração.
    const novo =
      normalizarEstado(dados.estado) ??
      (dados.financas
        ? migrarV4(dados.financas as Record<string, unknown>, dados.categorias).estado
        : null)

    if (!novo) {
      aoAvisar('Não foi possível ler este backup')
      setConfirmarImport(null)
      return
    }
    dispatch({ t: 'substituir', estado: novo })
    setConfirmarImport(null)
    aoAvisar('Backup restaurado')
  }

  const qtdNoArquivo = confirmarImport
    ? Object.values(
        (confirmarImport.estado?.lancamentos ?? confirmarImport.financas ?? {}) as Record<
          string,
          unknown[]
        >,
      ).reduce((s, l) => s + (Array.isArray(l) ? l.length : 0), 0)
    : 0

  return (
    <div className="flex flex-col gap-4">
      <Neu className="p-4" sombra="neu-xs">
        <h4 className="text-[13px] font-bold text-tinta">Exportar</h4>
        <p className="mt-1 text-[12px] leading-relaxed text-tinta-2">
          Baixa um JSON com todos os lançamentos, categorias, contas e fixos. Guarde no iCloud
          Drive — é a garantia contra qualquer limpeza do Safari.
        </p>
        <Botao variante="primario" className="mt-3 w-full" onClick={() => void exportar()}>
          💾 Exportar backup
        </Botao>
      </Neu>

      <Neu className="p-4" sombra="neu-xs">
        <h4 className="text-[13px] font-bold text-tinta">Importar</h4>
        <p className="mt-1 text-[12px] leading-relaxed text-tinta-2">
          Aceita backups deste app e do formato antigo (fin-v4). Substitui os dados atuais.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          onChange={aoEscolherArquivo}
          className="hidden"
        />
        <Botao className="mt-3 w-full" onClick={() => inputRef.current?.click()}>
          📂 Escolher arquivo
        </Botao>
      </Neu>

      <Confirmar
        aberto={confirmarImport !== null}
        titulo="Substituir todos os dados?"
        descricao={`O backup tem ${qtdNoArquivo} lançamento(s). Os dados atuais deste aparelho serão substituídos.`}
        rotuloOk="Restaurar"
        perigo
        aoConfirmar={() => confirmarImport && aplicarImport(confirmarImport)}
        aoCancelar={() => setConfirmarImport(null)}
      />
    </div>
  )
}

// ── Notificações ────────────────────────────────────────────────────

function SecaoNotificacoes({ aoAvisar }: { aoAvisar: (m: string) => void }) {
  const { estado, dispatch } = useLoja()
  const [permissao, setPermissao] = useState(permissaoAtual())
  const instalado = ehPwaInstalado()
  const suportado = notificacoesSuportadas()

  async function ligar() {
    const p = await pedirPermissao()
    setPermissao(p)
    if (p === 'granted') {
      dispatch({ t: 'config', patch: { notificacoes: true } })
      aoAvisar('Notificações ligadas')
    } else if (p === 'denied') {
      aoAvisar('Permissão negada nos ajustes do iOS')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Neu className="p-4" sombra="neu-xs">
        <h4 className="text-[13px] font-bold text-tinta">Aviso de vencimento</h4>
        <p className="mt-1 text-[12px] leading-relaxed text-tinta-2">
          Uma notificação por dia com as contas a vencer, no máximo. O aviso é gerado pelo próprio
          aparelho quando você abre o app ou volta para ele — não depende de servidor e funciona
          offline. Em compensação, ele não chega com o app totalmente fechado.
        </p>
      </Neu>

      {!suportado ? (
        <div className="rounded-2xl bg-alerta/10 p-3.5 text-[12px] font-semibold text-alerta">
          Este navegador não suporta notificações.
        </div>
      ) : !instalado ? (
        <div className="rounded-2xl bg-alerta/10 p-3.5 text-[12px] leading-relaxed text-alerta">
          <strong>Instale o app primeiro.</strong> No iOS as notificações só funcionam com o app
          adicionado à tela de início (Compartilhar → Adicionar à Tela de Início).
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3 rounded-2xl bg-superficie p-3.5 shadow-neu-xs">
        <span className="text-[13px] font-bold text-tinta">Notificações</span>
        {estado.config.notificacoes && permissao === 'granted' ? (
          <Botao
            onClick={() => {
              dispatch({ t: 'config', patch: { notificacoes: false } })
              aoAvisar('Notificações desligadas')
            }}
          >
            Desligar
          </Botao>
        ) : (
          <Botao variante="primario" disabled={!suportado} onClick={() => void ligar()}>
            Ligar
          </Botao>
        )}
      </div>

      <div>
        <Rotulo>Avisar com quantos dias de antecedência</Rotulo>
        <Campo
          type="number"
          min={0}
          max={30}
          value={estado.config.diasAviso}
          onChange={(e) =>
            dispatch({
              t: 'config',
              patch: { diasAviso: Math.min(30, Math.max(0, Number(e.target.value) || 0)) },
            })
          }
          className="font-mono"
        />
        <p className="mt-1.5 text-[11px] text-tinta-3">
          Também define o que aparece como &ldquo;urgente&rdquo; nas listas.
        </p>
      </div>

      {permissao === 'denied' ? (
        <p className="text-[11px] leading-relaxed text-despesa">
          A permissão foi negada. Para reverter: Ajustes do iOS → Finanças → Notificações.
        </p>
      ) : null}
    </div>
  )
}
