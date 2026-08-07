// listener.js — espelha o WhatsApp para o Supabase. READ-ONLY.
//
// ===========================================================================
// REGRA INEGOCIAVEL (CLAUDE.md secao 2)
// ---------------------------------------------------------------------------
// Este processo LE, CLASSIFICA e GRAVA. Nunca envia.
//
// Nao existe aqui, e nao deve passar a existir:
//   - sock.sendMessage        envio de mensagem
//   - sock.readMessages       marcar como lido
//   - sock.sendPresenceUpdate "digitando..." / online
//   - sock.chatModify         alterar estado da conversa
//
// Motivo: automacao via Baileys viola os Termos do WhatsApp, e o numero em
// risco e o pessoal E comercial do Jean ao mesmo tempo. Modo passivo reduz
// muito a chance de banimento. Ha uma trava em `travarEnvio()` mais abaixo
// que neutraliza esses metodos em tempo de execucao.
// ===========================================================================

import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import { pathToFileURL } from 'node:url';
import pino from 'pino';
import qrcode from 'qrcode-terminal';

import { config, PASTA_AUTH } from './config.js';
import { salvarChats, salvarMensagens, aplicarRegras } from './db.js';
import { normalizar, normalizarJid } from './mensagem.js';
import { completo, hora } from './tempo.js';

const log = pino({ level: config.logLevel });

// --- estado do processo -----------------------------------------------------
const buffer = [];                 // mensagens aguardando gravacao
const chatsVistos = new Map();     // chat_id -> { nome, is_group }
const nomesGrupo = new Map();      // chat_id -> assunto (evita refetch)
let timerBuffer = null;
let tentativas = 0;                // backoff exponencial
let meuJid = normalizarJid(config.meuJid) || '';
let encerrando = false;
let sockAtual = null;

// --- trava de envio ---------------------------------------------------------
/**
 * Substitui os metodos de escrita por erro explicito. Se algum dia entrar
 * codigo que tente enviar, ele quebra alto aqui em vez de silenciosamente
 * colocar o numero do Jean em risco.
 */
export function travarEnvio(sock) {
  const proibidos = [
    'sendMessage',
    'readMessages',
    'sendPresenceUpdate',
    'sendReceipt',
    'sendReceipts',
    'chatModify',
    'updateProfileStatus',
    'updateProfilePicture',
  ];

  for (const metodo of proibidos) {
    if (typeof sock[metodo] !== 'function') continue;
    sock[metodo] = async () => {
      throw new Error(
        `[read-only] "${metodo}" esta bloqueado. Este agente nao envia nada. ` +
        'Ver CLAUDE.md secao 2 antes de mexer nisso.',
      );
    };
  }
  return sock;
}

// --- buffer -----------------------------------------------------------------
function agendarFlush() {
  if (timerBuffer) return;
  timerBuffer = setTimeout(() => {
    timerBuffer = null;
    flush().catch((err) => log.error({ err: err?.message }, 'flush falhou'));
  }, config.bufferMs);
  // Nao segura o process.exit por causa do timer.
  timerBuffer.unref?.();
}

async function flush() {
  if (buffer.length === 0) return;

  // Tira do buffer antes de gravar. Se a gravacao falhar, devolvemos.
  const lote = buffer.splice(0, buffer.length);

  const chats = [...chatsVistos.entries()].map(([id, c]) => ({
    id,
    nome: nomesGrupo.get(id) ?? c.nome ?? null,
    is_group: c.is_group,
  }));
  chatsVistos.clear();

  try {
    // Conversas primeiro: wa_messages.chat_id tem FK para wa_chats.
    const r1 = await salvarChats(chats);
    if (!r1.ok) {
      buffer.unshift(...lote);
      agendarFlush();
      return;
    }

    const r2 = await salvarMensagens(lote);
    if (!r2.ok) {
      buffer.unshift(...lote);
      agendarFlush();
      return;
    }

    log.info(
      { gravadas: r2.gravadas, lote: lote.length, chats: chats.length },
      'lote gravado',
    );

    // Conversa nova pode casar com regra conhecida. Barato e evita token.
    if (chats.length > 0) {
      const r3 = await aplicarRegras();
      if (r3.ok && r3.aplicadas.length > 0) {
        for (const a of r3.aplicadas) {
          log.info({ chat: a.nome, bucket: a.bucket, segmento: a.segmento }, 'regra aplicada');
        }
      }
    }
  } catch (err) {
    log.error({ err: err?.message }, 'flush estourou, devolvendo lote ao buffer');
    buffer.unshift(...lote);
    agendarFlush();
  }
}

// --- nome do grupo ----------------------------------------------------------
async function nomeDoGrupo(sock, jid) {
  if (nomesGrupo.has(jid)) return nomesGrupo.get(jid);

  try {
    const meta = await sock.groupMetadata(jid);
    const assunto = meta?.subject ?? null;
    // Grava mesmo se null, para nao repetir a chamada de rede a cada mensagem.
    nomesGrupo.set(jid, assunto);
    return assunto;
  } catch (err) {
    log.warn({ jid, err: err?.message }, 'nao consegui ler o nome do grupo');
    nomesGrupo.set(jid, null);
    return null;
  }
}

// --- conexao ----------------------------------------------------------------
async function conectar() {
  const { state, saveCreds } = await useMultiFileAuthState(PASTA_AUTH);
  const { version } = await fetchLatestBaileysVersion();

  log.info({ versao: version.join('.') }, 'iniciando socket');

  const sock = travarEnvio(
    makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, log),
      },
      logger: log,

      // ---------------------------------------------------------------
      // FLAGS CRITICAS — CLAUDE.md secao 3.
      // Nao mude nenhuma sem explicar a consequencia ao Jean.
      // ---------------------------------------------------------------

      // true faz o WhatsApp achar que o Jean esta online no desktop e PARAR
      // de mandar push para o iPhone dele. Quebra o uso normal do celular.
      markOnlineOnConnect: false,

      // Baixar o historico inteiro gera trafego anomalo e enche o banco.
      syncFullHistory: false,

      // Precisamos ver o que o Jean respondeu: e assim que sabemos se a bola
      // ainda esta com ele (vw_wa_sla_estourado depende disso).
      emitOwnEvents: true,

      // Fingerprint estavel e comum.
      browser: ['Mac OS', 'Safari', '10.15.7'],
      // ---------------------------------------------------------------

      shouldSyncHistoryMessage: () => false,
      generateHighQualityLinkPreview: false,
      // Read-only: nunca pedimos o conteudo de uma mensagem reenviada.
      getMessage: async () => undefined,
    }),
  );

  sockAtual = sock;

  sock.ev.on('creds.update', () => {
    saveCreds().catch((err) => log.error({ err: err?.message }, 'saveCreds falhou'));
  });

  sock.ev.on('connection.update', (u) => {
    const { connection, lastDisconnect, qr } = u;

    if (qr) {
      console.log('\n=== PAREAMENTO ===');
      console.log('WhatsApp > Aparelhos conectados > Conectar aparelho');
      console.log('Leia o QR abaixo. Ele expira em ~60s e um novo aparece.\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      tentativas = 0;
      const jid = normalizarJid(sock.user?.id ?? '');
      if (jid && jid !== meuJid) {
        meuJid = jid;
        log.info({ meuJid }, 'conectado. Coloque este valor em MEU_JID no .env');
      }
      console.log(`\n[${completo(new Date())}] conectado, escutando (read-only)\n`);
    }

    if (connection === 'close') {
      // O erro do Baileys ja e um Boom; o statusCode vem em output.
      const erro = lastDisconnect?.error;
      const codigo = erro?.output?.statusCode ?? erro?.status ?? null;

      if (codigo === DisconnectReason.loggedOut) {
        console.error(
          '\nSessao encerrada pelo WhatsApp (logout no aparelho).\n' +
          `Apague ${PASTA_AUTH} e pareie de novo:\n` +
          '  pm2 restart wa-agent && pm2 logs wa-agent --lines 60\n',
        );
        flush().finally(() => process.exit(1));
        return;
      }

      if (encerrando) return;

      // Backoff exponencial: 2s, 4s, 8s ... teto de 5min.
      tentativas += 1;
      const espera = Math.min(2 ** tentativas * 1000, 300000);
      log.warn({ codigo, tentativa: tentativas, espera_ms: espera }, 'caiu, reconectando');
      setTimeout(() => {
        conectar().catch((err) => {
          log.error({ err: err?.message }, 'reconexao falhou, tentando de novo');
          setTimeout(() => conectar().catch(() => {}), espera);
        });
      }, espera);
    }
  });

  // Nome de grupo chega por aqui sem custo de rede. Aproveita.
  sock.ev.on('chats.upsert', (chats) => {
    for (const c of chats ?? []) {
      if (c?.id?.endsWith('@g.us') && c.name) nomesGrupo.set(c.id, c.name);
    }
  });

  sock.ev.on('groups.update', (updates) => {
    for (const g of updates ?? []) {
      if (g?.id && g.subject) nomesGrupo.set(g.id, g.subject);
    }
  });

  sock.ev.on('groups.upsert', (grupos) => {
    for (const g of grupos ?? []) {
      if (g?.id && g.subject) nomesGrupo.set(g.id, g.subject);
    }
  });

  sock.ev.on('messages.upsert', async (evento) => {
    try {
      // 'append' e sincronizacao de historico. So 'notify' e mensagem viva.
      if (evento.type !== 'notify') return;

      for (const msg of evento.messages ?? []) {
        const linha = normalizar(msg, meuJid);
        if (!linha) continue;

        const isGroup = linha.chat_id.endsWith('@g.us');
        let nome = null;

        if (isGroup) {
          nome = await nomeDoGrupo(sock, linha.chat_id);
        } else if (!linha.from_me) {
          nome = msg.pushName ?? null;
        }

        chatsVistos.set(linha.chat_id, { nome, is_group: isGroup });
        buffer.push(linha);

        log.debug(
          { chat: nome ?? linha.chat_id, tipo: linha.tipo, hora: hora(linha.timestamp) },
          'mensagem recebida',
        );
      }

      // Buffer cheio grava na hora; senao espera a janela de 5s.
      if (buffer.length >= config.bufferMax) {
        if (timerBuffer) {
          clearTimeout(timerBuffer);
          timerBuffer = null;
        }
        await flush();
      } else {
        agendarFlush();
      }
    } catch (err) {
      // Uma mensagem malformada nao derruba o listener (CLAUDE.md regra 5).
      log.error({ err: err?.message }, 'messages.upsert falhou, seguindo');
    }
  });

  return sock;
}

// --- encerramento limpo -----------------------------------------------------
async function encerrar(sinal) {
  if (encerrando) return;
  encerrando = true;

  console.log(`\n[${sinal}] gravando o que esta no buffer antes de sair...`);
  if (timerBuffer) clearTimeout(timerBuffer);

  try {
    await flush();
  } catch (err) {
    console.error('flush final falhou:', err?.message);
  }

  try {
    sockAtual?.end?.(undefined);
  } catch { /* socket ja pode estar morto */ }

  process.exit(0);
}

// So conecta quando executado direto (node src/listener.js). Importar o
// modulo para teste nao abre socket nem registra handler de sinal.
const executadoDireto =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (executadoDireto) {
  process.on('SIGINT', () => encerrar('SIGINT'));
  process.on('SIGTERM', () => encerrar('SIGTERM'));

  process.on('unhandledRejection', (err) => {
    log.error({ err: err?.message ?? err }, 'promessa rejeitada sem catch');
  });

  process.on('uncaughtException', (err) => {
    log.error({ err: err?.message ?? err }, 'excecao nao tratada');
    // Nao mata o processo: o PM2 reiniciaria e perderiamos o buffer.
  });

  conectar().catch((err) => {
    console.error('nao consegui iniciar:', err?.message ?? err);
    process.exit(1);
  });
}
