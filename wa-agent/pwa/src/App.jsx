import { useCallback, useEffect, useState } from 'react';

import { supabase, configurado, buscarPainel, entrar, verificarCodigo, sair } from './supabase.js';
import { separar, rotulo, decorrido, dataHora, nivelSla } from './painel.js';
import {
  separarGrupos, totalMensagens, contagem, janela, etiquetas, naoLido,
  plural, rotulo as rotuloGrupo,
} from './grupos.js';

// ---------------------------------------------------------------------------
// Copiar rascunho
// ---------------------------------------------------------------------------
function BotaoCopiar({ texto }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      // Safari antigo sem Clipboard API: cai no textarea escondido.
      const t = document.createElement('textarea');
      t.value = texto;
      t.style.position = 'fixed';
      t.style.opacity = '0';
      document.body.appendChild(t);
      t.select();
      try { document.execCommand('copy'); } catch { /* desiste em silencio */ }
      document.body.removeChild(t);
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1800);
  }

  return (
    <button type="button" className={`copiar${copiado ? ' feito' : ''}`} onClick={copiar}>
      {copiado ? 'Copiado' : 'Copiar rascunho'}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Cartao de conversa
// ---------------------------------------------------------------------------
function Cartao({ c, posicao, mencoes }) {
  const [aberto, setAberto] = useState(false);
  const citou = mencoes?.[c.chat_id] ?? 0;
  const nivel = nivelSla(c.razao_sla);

  return (
    <article className="cartao">
      <header>
        <span className="pos">{posicao}</span>
        <h3>{rotulo(c)}</h3>
        {c.razao_sla != null && (
          <span className={`selo ${nivel}`}>{Number(c.razao_sla).toFixed(2)}x</span>
        )}
      </header>

      {c.resumo && <p className="resumo">{c.resumo}</p>}

      <div className="marcas">
        <span className="meta">
          parado há {decorrido(c.last_message_at)}
          {c.sla_horas ? ` · SLA ${c.sla_horas}h` : ''}
          {c.segmento ? ` · ${c.segmento}` : ''}
        </span>
        {c.chamado_direto && <span className="tag chamado">chamaram você</span>}
        {citou > 0 && <span className="tag citou">{citou}x</span>}
        {(c.keywords_criticas ?? []).map((k) => (
          <span key={k} className="tag critica">{k}</span>
        ))}
      </div>

      {c.rascunho && (
        <div className="rascunho">
          <button type="button" className="ver" onClick={() => setAberto((v) => !v)}>
            {aberto ? 'Ocultar rascunho' : 'Ver rascunho'}
          </button>
          {aberto && <pre>{c.rascunho}</pre>}
          <BotaoCopiar texto={c.rascunho} />
        </div>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Aba Grupos — o retrato do dia
// ---------------------------------------------------------------------------
function CartaoGrupo({ g }) {
  const [aberto, setAberto] = useState(false);
  const tags = etiquetas(g);
  const buracos = naoLido(g);
  const hora = janela(g);
  const texto = g.resumo ?? g.assunto ?? null;

  return (
    <article className={`grupo${g.chamado_direto ? ' destaque' : ''}`}>
      <h3>{rotuloGrupo(g)}</h3>

      <p className="meta">
        {g.segmento && <span className="seg">{g.segmento}</span>}
        {contagem(g)}
        {hora && ` · ${hora}`}
      </p>

      {texto
        ? <p className="texto">{texto}</p>
        : <p className="texto fraco">Sem resumo da IA.</p>}

      {tags.length > 0 && (
        <div className="marcas">
          {tags.map((t) => (
            <span key={t.texto} className={`tag ${t.tom}`}>{t.texto}</span>
          ))}
        </div>
      )}

      {buracos.length > 0 && <p className="buraco">{buracos.join(' · ')}</p>}

      {g.rascunho && (
        <div className="rascunho">
          <button type="button" className="ver" onClick={() => setAberto((v) => !v)}>
            {aberto ? 'Ocultar rascunho' : 'Ver rascunho'}
          </button>
          {aberto && <pre>{g.rascunho}</pre>}
          <BotaoCopiar texto={g.rascunho} />
        </div>
      )}
    </article>
  );
}

/** Conversa sem análise: uma linha, não um cartão. */
function LinhaGrupo({ g }) {
  const hora = janela(g);
  return (
    <div className="linha-grupo">
      <strong>{rotuloGrupo(g)}</strong>
      <span>{contagem(g)}{hora ? ` · ${hora}` : ''}</span>
    </div>
  );
}

function VisaoGrupos({ grupos }) {
  const s = separarGrupos(grupos);

  return (
    <>
      <section>
        <h2>
          Trabalho
          <span className="conta">{s.trabalho.length}</span>
        </h2>
        {s.trabalho.length === 0
          ? <p className="vazio">Nenhum grupo de trabalho teve movimento.</p>
          : (
            <>
              <p className="sub">{totalMensagens(s.trabalho)} mensagens na janela</p>
              {s.trabalho.map((g) => <CartaoGrupo key={g.chat_id} g={g} />)}
            </>
          )}
      </section>

      {s.pessoal.length > 0 && (
        <section>
          <h2>Pessoal <span className="conta">{s.pessoal.length}</span></h2>
          {s.pessoal.map((g) => <LinhaGrupo key={g.chat_id} g={g} />)}
          <p className="nota">Conteúdo não analisado: grupo pessoal não passa pela IA.</p>
        </section>
      )}

      {s.indefinido.length > 0 && (
        <section>
          <h2>A classificar <span className="conta">{s.indefinido.length}</span></h2>
          {s.indefinido.map((g) => <LinhaGrupo key={g.chat_id} g={g} />)}
          <p className="nota">No computador: <code>npm run classificar</code></p>
        </section>
      )}

      {s.ruidoTotais.conversas > 0 && (
        <section>
          <h2>Ruído</h2>
          <p className="vazio">
            {plural(s.ruidoTotais.conversas, 'conversa', 'conversas')},{' '}
            {plural(s.ruidoTotais.mensagens, 'mensagem', 'mensagens')} — ignorado
          </p>
        </section>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------
// Codigo, nao link.
//
// Instalado na tela inicial, o iOS da ao PWA um armazenamento SEPARADO do
// Safari — e o link do e-mail sempre abre no Safari. A sessao caia do lado
// errado e o app pedia e-mail de novo, para sempre. O codigo de 6 digitos e
// digitado aqui dentro, entao a sessao nasce no armazenamento certo.
function Login() {
  const [email, setEmail] = useState('');
  const [codigo, setCodigo] = useState('');
  const [estado, setEstado] = useState('parado');
  const [erro, setErro] = useState(null);

  async function enviar(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setEstado('enviando');
    setErro(null);

    const r = await entrar(email.trim());
    if (r.ok) { setCodigo(''); setEstado('enviado'); }
    else { setEstado('parado'); setErro(r.erro); }
  }

  async function conferir(e) {
    e.preventDefault();
    if (codigo.replace(/\D/g, '').length < 6) return;
    setEstado('verificando');
    setErro(null);

    // Sucesso nao mexe no estado: o onAuthStateChange do App troca a tela.
    const r = await verificarCodigo(email.trim(), codigo);
    if (!r.ok) { setEstado('enviado'); setErro(r.erro); }
  }

  if (estado === 'enviado' || estado === 'verificando') {
    return (
      <div className="centro">
        <h1>Digite o código</h1>
        <p className="ajuda">
          Mandei um código de 6 dígitos para <strong>{email}</strong>. Digite
          aqui dentro do app — não abra o link do e-mail.
        </p>
        <form onSubmit={conferir}>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            className="codigo"
            placeholder="000000"
            value={codigo}
            onChange={(ev) => setCodigo(ev.target.value.replace(/\D/g, '').slice(0, 6))}
            required
            autoFocus
          />
          <button type="submit" disabled={estado === 'verificando' || codigo.length < 6}>
            {estado === 'verificando' ? 'Conferindo...' : 'Entrar'}
          </button>
        </form>
        {erro && <p className="erro">{erro}</p>}
        <button
          type="button"
          className="secundario"
          onClick={() => { setErro(null); setEstado('parado'); }}
        >
          Pedir outro código
        </button>
      </div>
    );
  }

  return (
    <div className="centro">
      <h1>Painel Comercial</h1>
      <p className="ajuda">Entre com o e-mail autorizado. Sem senha: chega um código.</p>
      <form onSubmit={enviar}>
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="seu@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <button type="submit" disabled={estado === 'enviando'}>
          {estado === 'enviando' ? 'Enviando...' : 'Receber código'}
        </button>
      </form>
      {erro && <p className="erro">{erro}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
export default function App() {
  const [sessao, setSessao] = useState(undefined); // undefined = ainda checando
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(false);
  // 'fila'   o que esta parado com ele, em ordem de urgencia
  // 'grupos' o retrato do dia, grupo por grupo
  const [aba, setAba] = useState('fila');

  useEffect(() => {
    if (!supabase) { setSessao(null); return undefined; }

    supabase.auth.getSession().then(({ data }) => setSessao(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSessao(s ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    const r = await buscarPainel(24);
    if (r.ok) setDados(r.dados);
    else setErro(r.erro);
    setCarregando(false);
  }, []);

  useEffect(() => { if (sessao) carregar(); }, [sessao, carregar]);

  if (!configurado) {
    return (
      <div className="centro">
        <h1>Falta configurar</h1>
        <p className="ajuda">
          Defina <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code>{' '}
          e publique de novo.
        </p>
      </div>
    );
  }

  if (sessao === undefined) return <div className="centro"><p className="ajuda">Abrindo...</p></div>;
  if (sessao === null) return <Login />;

  const { aguardando, monitorar } = separar(dados?.conversas ?? []);
  const sil = dados?.silenciadas ?? {};
  const mencoes = dados?.mencoes ?? {};

  return (
    <div className="app">
      <header className="topo">
        <div>
          <h1>Painel Comercial</h1>
          <p className="quando">
            {dados ? dataHora(dados.gerado_em) : '...'} · Manaus
          </p>
        </div>
        <button type="button" className="atualizar" onClick={carregar} disabled={carregando}>
          {carregando ? '...' : 'Atualizar'}
        </button>
      </header>

      {erro && (
        <div className="aviso">
          <p>{erro}</p>
          <button type="button" className="secundario" onClick={carregar}>Tentar de novo</button>
        </div>
      )}

      {!erro && !dados && carregando && <p className="ajuda pad">Carregando...</p>}

      {dados && (
        <nav className="abas">
          <button
            type="button"
            className={aba === 'fila' ? 'ativa' : ''}
            onClick={() => setAba('fila')}
          >
            Fila
            {aguardando.length > 0 && <span className="bolha">{aguardando.length}</span>}
          </button>
          <button
            type="button"
            className={aba === 'grupos' ? 'ativa' : ''}
            onClick={() => setAba('grupos')}
          >
            Grupos
          </button>
        </nav>
      )}

      {dados && aba === 'grupos' && <VisaoGrupos grupos={dados.grupos ?? []} />}

      {dados && aba === 'fila' && (
        <>
          <section>
            <h2>Aguardando você <span className="conta">{aguardando.length}</span></h2>
            {aguardando.length === 0
              ? <p className="vazio">Nada parado com você.</p>
              : aguardando.map((c, i) => (
                  <Cartao key={c.chat_id} c={c} posicao={i + 1} mencoes={mencoes} />
                ))}
          </section>

          {monitorar.length > 0 && (
            <section>
              <h2>Monitorar <span className="conta">{monitorar.length}</span></h2>
              {monitorar.map((c) => (
                <div key={c.chat_id} className="linha">
                  <strong>{rotulo(c)}</strong>
                  <span>{c.pendencia ?? c.assunto ?? 'sem detalhe'}</span>
                  <em>{decorrido(c.last_message_at)}</em>
                </div>
              ))}
            </section>
          )}

          <section>
            <h2>Silenciado</h2>
            <p className="vazio">
              {Number(sil.grupos ?? 0) > 0
                ? `${sil.grupos} grupos, ${sil.mensagens} mensagens, nada relevante`
                : 'Nada nas últimas 24h'}
            </p>
          </section>
        </>
      )}

      <footer>
        <p>O agente lê e escreve rascunho. Quem envia é você, pelo WhatsApp.</p>
        <button type="button" className="secundario" onClick={sair}>Sair</button>
      </footer>
    </div>
  );
}
