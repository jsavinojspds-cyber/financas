import { useEffect, useState } from 'react'
import { Botao, Campo, Neu, Rotulo } from '@/components/ui'
import { useLoja } from '@/state/store'
import { novoId } from '@/lib/id'
import {
  confirmarCodigo,
  emailLogado,
  enviarCodigo,
  gravarConfigSync,
  lerConfigSync,
  sair,
  sincronizar,
  testarConexao,
  type ConfigSync,
} from './supabase'

type Passo = 'carregando' | 'configurar' | 'login' | 'codigo' | 'conectado'

export function PainelSync({ aoAvisar }: { aoAvisar: (m: string) => void }) {
  const { estado, dispatch } = useLoja()
  const [passo, setPasso] = useState<Passo>('carregando')
  const [config, setConfig] = useState<ConfigSync | null>(null)
  const [url, setUrl] = useState('')
  const [chave, setChave] = useState('')
  const [email, setEmail] = useState('')
  const [codigo, setCodigo] = useState('')
  const [conta, setConta] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const c = await lerConfigSync()
      if (!c) {
        setPasso('configurar')
        return
      }
      setConfig(c)
      setUrl(c.url)
      setChave(c.anonKey)
      const e = await emailLogado(c)
      if (e) {
        setConta(e)
        setPasso('conectado')
      } else {
        setPasso('login')
      }
    })()
  }, [])

  async function salvarConfig() {
    const limpaUrl = url.trim().replace(/\/+$/, '')
    if (!/^https:\/\/.+\.supabase\.co$/.test(limpaUrl)) {
      setErro('A URL precisa ser o endereço do projeto, terminando em .supabase.co')
      return
    }
    if (chave.trim().length < 20) {
      setErro('A chave parece incompleta. Copie o valor inteiro.')
      return
    }

    const c: ConfigSync = {
      url: limpaUrl,
      anonKey: chave.trim(),
      dispositivo: config?.dispositivo ?? novoId().slice(0, 8),
      ultimoSync: null,
    }

    // Testa antes de gravar: melhor falhar aqui, com a causa na tela, do que
    // no meio do login sem o usuário saber o que deu errado.
    setOcupado(true)
    setErro(null)
    const teste = await testarConexao(c)
    setOcupado(false)

    if (!teste.ok) {
      setErro(teste.msg)
      return
    }

    await gravarConfigSync(c)
    setConfig(c)
    setPasso('login')
    aoAvisar('Conexão confirmada')
  }

  async function enviar() {
    if (!config) return
    setOcupado(true)
    const erro = await enviarCodigo(config, email.trim())
    setOcupado(false)
    if (erro) {
      aoAvisar(erro)
      return
    }
    setPasso('codigo')
    aoAvisar('Código enviado para o seu e-mail')
  }

  async function confirmar() {
    if (!config) return
    setOcupado(true)
    const erro = await confirmarCodigo(config, email.trim(), codigo)
    setOcupado(false)
    if (erro) {
      aoAvisar(erro)
      return
    }
    setConta(email.trim())
    setPasso('conectado')
    aoAvisar('Conectado')
    void sincronizarAgora()
  }

  async function sincronizarAgora() {
    if (!config) return
    setOcupado(true)
    const r = await sincronizar(config, estado)
    setOcupado(false)

    if (r.estadoRemoto) {
      dispatch({ t: 'substituir', estado: r.estadoRemoto })
      aoAvisar('Dados atualizados a partir da nuvem')
      return
    }
    switch (r.status.t) {
      case 'ok':
        aoAvisar('Sincronizado')
        break
      case 'offline':
        aoAvisar('Sem conexão — os dados continuam salvos no aparelho')
        break
      case 'sem-login':
        setPasso('login')
        break
      case 'erro':
        aoAvisar(`Erro: ${r.status.msg}`)
        break
      default:
        break
    }
  }

  async function desconectar() {
    if (config) await sair(config)
    setConta('')
    setPasso('login')
    aoAvisar('Desconectado — os dados locais continuam intactos')
  }

  async function esquecerProjeto() {
    if (config) await sair(config)
    await gravarConfigSync(null)
    setConfig(null)
    setUrl('')
    setChave('')
    setPasso('configurar')
    aoAvisar('Configuração removida')
  }

  if (passo === 'carregando') {
    return <p className="py-6 text-center text-[13px] text-tinta-3">Verificando…</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <Neu className="p-4" sombra="neu-xs">
        <h4 className="text-[13px] font-bold text-tinta">Sincronização opcional</h4>
        <p className="mt-1 text-[12px] leading-relaxed text-tinta-2">
          O app funciona 100% offline sem isto. Ligando o Supabase, os dados passam a ser
          espelhados na nuvem e ficam disponíveis em outros aparelhos. Se cair a conexão, tudo
          continua salvo no próprio iPhone.
        </p>
      </Neu>

      {passo === 'configurar' ? (
        <>
          <div>
            <Rotulo>URL do projeto</Rotulo>
            <Campo
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://xxxx.supabase.co"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
            />
          </div>
          <div>
            <Rotulo>Chave anon (public)</Rotulo>
            <Campo
              value={chave}
              onChange={(e) => setChave(e.target.value)}
              placeholder="eyJhbGciOi…"
              autoCapitalize="off"
              autoCorrect="off"
            />
          </div>
          <p className="text-[11px] leading-relaxed text-tinta-3">
            Encontre os dois em Supabase → Project Settings → API. A chave é pública por natureza;
            quem protege os dados é a política RLS do banco.{' '}
            <strong>A URL não abre no navegador</strong> — é endereço de API, e aberta direto ela
            responde &ldquo;requested path is invalid&rdquo;. É só colar aqui.
          </p>
          {erro ? (
            <p className="rounded-xl bg-despesa/10 p-3 text-[12px] font-semibold leading-relaxed text-despesa">
              {erro}
            </p>
          ) : null}
          <Botao variante="primario" disabled={ocupado} onClick={() => void salvarConfig()}>
            {ocupado ? 'Testando conexão…' : 'Conectar'}
          </Botao>
        </>
      ) : null}

      {passo === 'login' ? (
        <>
          <div>
            <Rotulo>Seu e-mail</Rotulo>
            <Campo
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@exemplo.com"
              inputMode="email"
              autoCapitalize="off"
              autoCorrect="off"
            />
          </div>
          <p className="text-[11px] leading-relaxed text-tinta-3">
            Login sem senha: o Supabase envia um código de 6 dígitos por e-mail.
          </p>
          <Botao
            variante="primario"
            disabled={ocupado || !email.includes('@')}
            onClick={() => void enviar()}
          >
            {ocupado ? 'Enviando…' : 'Enviar código'}
          </Botao>
          <Botao onClick={() => void esquecerProjeto()}>Trocar projeto</Botao>
        </>
      ) : null}

      {passo === 'codigo' ? (
        <>
          <div>
            <Rotulo>Código ou link do e-mail</Rotulo>
            <Campo
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="000000"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="font-mono"
            />
          </div>
          <p className="text-[11px] leading-relaxed text-tinta-3">
            Se o e-mail trouxer um código de 6 dígitos, digite-o. Se trouxer um botão ou link,
            copie o endereço dele (mantenha pressionado → Copiar) e cole aqui — não clique, para
            não sair do app.
          </p>
          <Botao
            variante="primario"
            disabled={ocupado || codigo.trim().length < 6}
            onClick={() => void confirmar()}
          >
            {ocupado ? 'Confirmando…' : 'Confirmar'}
          </Botao>
          <Botao onClick={() => setPasso('login')}>Voltar</Botao>
        </>
      ) : null}

      {passo === 'conectado' ? (
        <>
          <Neu className="p-3.5" sombra="neu-in">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-receita" />
              <span className="text-[13px] font-bold text-tinta">Conectado</span>
            </div>
            <p className="mt-1 break-all text-[12px] text-tinta-2">{conta}</p>
            {config?.ultimoSync ? (
              <p className="mt-1 text-[11px] text-tinta-3">
                Último sync: {new Date(config.ultimoSync).toLocaleString('pt-BR')}
              </p>
            ) : null}
          </Neu>

          <Botao variante="primario" disabled={ocupado} onClick={() => void sincronizarAgora()}>
            {ocupado ? 'Sincronizando…' : '☁️ Sincronizar agora'}
          </Botao>

          <p className="text-[11px] leading-relaxed text-tinta-3">
            A sincronização compara o carimbo de tempo dos dois lados e mantém a versão mais
            recente do conjunto inteiro. Editar offline em dois aparelhos ao mesmo tempo faz o
            último a sincronizar prevalecer — por isso vale exportar um backup antes de mexer
            muito em dois lugares.
          </p>

          <Botao onClick={() => void desconectar()}>Sair da conta</Botao>
          <Botao onClick={() => void esquecerProjeto()}>Remover configuração</Botao>
        </>
      ) : null}
    </div>
  )
}
