import { useCallback, useEffect, useState } from 'react';

import { supabase, configurado, buscarPainel, entrar, sair } from './supabase.js';
import { separar, rotulo, decorrido, dataHora, nivelSla } from './painel.js';

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
        {citou > 0 && <span className="tag citou">citou você {citou}x</span>}
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
// Login
// ---------------------------------------------------------------------------
function Login() {
  const [email, setEmail] = useState('');
  const [estado, setEstado] = useState('parado');
  const [erro, setErro] = useState(null);

  async function enviar(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setEstado('enviando');
    setErro(null);

    const r = await entrar(email.trim());
    if (r.ok) setEstado('enviado');
    else { setEstado('parado'); setErro(r.erro); }
  }

  if (estado === 'enviado') {
    return (
      <div className="centro">
        <h1>Confira o e-mail</h1>
        <p className="ajuda">
          Mandei um link de acesso para <strong>{email}</strong>. Abra pelo
          próprio iPhone para o painel já entrar logado.
        </p>
        <button type="button" className="secundario" onClick={() => setEstado('parado')}>
          Usar outro e-mail
        </button>
      </div>
    );
  }

  return (
    <div className="centro">
      <h1>Painel Comercial</h1>
      <p className="ajuda">Entre com o e-mail autorizado. Sem senha: chega um link.</p>
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
          {estado === 'enviando' ? 'Enviando...' : 'Receber link'}
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
