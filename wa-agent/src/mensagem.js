// mensagem.js — traduz o payload do Baileys para o formato de wa_messages.
//
// Nada aqui pode lancar excecao: uma mensagem malformada nao pode derrubar o
// listener (CLAUDE.md regra 5). Em caso de duvida, marca tipo 'desconhecido'
// e guarda o raw inteiro, que e o que da rastreabilidade depois.

/** Wrappers que escondem a mensagem real dentro de outra. */
const INVOLUCROS = [
  'ephemeralMessage',      // mensagem temporaria (Aprovacao NENO/CO usa 7 dias)
  'viewOnceMessage',
  'viewOnceMessageV2',
  'viewOnceMessageV2Extension',
  'documentWithCaptionMessage',
  'editedMessage',
];

/**
 * Desembrulha involucros ate chegar no conteudo real.
 * O WhatsApp apaga a mensagem temporaria do aparelho; o que gravamos aqui fica.
 */
export function desembrulhar(message, profundidade = 0) {
  if (!message || profundidade > 6) return message ?? null;

  for (const chave of INVOLUCROS) {
    const interno = message[chave]?.message;
    if (interno) return desembrulhar(interno, profundidade + 1);
  }
  return message;
}

/** Mapeia a chave do Baileys para o `tipo` da nossa tabela. */
const TIPOS = {
  conversation: 'texto',
  extendedTextMessage: 'texto',
  imageMessage: 'imagem',
  videoMessage: 'video',
  audioMessage: 'audio',
  documentMessage: 'documento',
  stickerMessage: 'figurinha',
  reactionMessage: 'reacao',
  locationMessage: 'localizacao',
  liveLocationMessage: 'localizacao',
  contactMessage: 'contato',
  contactsArrayMessage: 'contato',
  pollCreationMessage: 'enquete',
  pollCreationMessageV3: 'enquete',
  protocolMessage: 'sistema',
  senderKeyDistributionMessage: 'sistema',
};

const COM_MIDIA = new Set(['imagem', 'video', 'audio', 'documento', 'figurinha']);

/** Extrai texto visivel de qualquer variante conhecida. */
function extrairTexto(m) {
  if (!m) return null;
  return (
    m.conversation ??
    m.extendedTextMessage?.text ??
    m.imageMessage?.caption ??
    m.videoMessage?.caption ??
    m.documentMessage?.caption ??
    m.documentWithCaptionMessage?.message?.documentMessage?.caption ??
    m.pollCreationMessage?.name ??
    m.pollCreationMessageV3?.name ??
    m.buttonsResponseMessage?.selectedDisplayText ??
    m.listResponseMessage?.title ??
    m.templateButtonReplyMessage?.selectedDisplayText ??
    (m.reactionMessage?.text ? `reagiu ${m.reactionMessage.text}` : null) ??
    null
  );
}

function contexto(m) {
  if (!m) return null;
  for (const chave of Object.keys(m)) {
    const ctx = m[chave]?.contextInfo;
    if (ctx) return ctx;
  }
  return null;
}

/**
 * @param {object} msg objeto de messages.upsert do Baileys
 * @param {string} meuJid JID do Jean, ja normalizado
 * @returns {object|null} linha pronta para wa_messages, ou null se ignoravel
 */
export function normalizar(msg, meuJid) {
  try {
    const chatId = msg?.key?.remoteJid;
    const msgId = msg?.key?.id;
    if (!chatId || !msgId) return null;

    const conteudoReal = desembrulhar(msg.message);

    // Sem conteudo util: recibo, chave de sessao, sincronizacao. Nao interessa.
    if (!conteudoReal) return null;

    const chaves = Object.keys(conteudoReal).filter((k) => conteudoReal[k] != null);
    const chavePrincipal = chaves.find((k) => TIPOS[k]) ?? chaves[0] ?? 'desconhecido';
    const tipo = TIPOS[chavePrincipal] ?? 'desconhecido';

    // Mensagem de protocolo (apagar, editar, revogar) nao vira linha propria.
    if (tipo === 'sistema') return null;

    const isGroup = chatId.endsWith('@g.us');
    const fromMe = Boolean(msg.key.fromMe);

    let senderJid = fromMe
      ? (meuJid || null)
      : (isGroup ? (msg.key.participant ?? msg.participant ?? null) : chatId);
    senderJid = normalizarJid(senderJid);

    const ctx = contexto(conteudoReal);
    const mencoes = ctx?.mentionedJid ?? [];
    const citadaTexto = extrairTexto(desembrulhar(ctx?.quotedMessage));

    return {
      chat_id: chatId,
      msg_id: msgId,
      from_me: fromMe,
      sender_jid: senderJid,
      sender_name: msg.pushName ?? null,
      tipo,
      conteudo: recortar(extrairTexto(conteudoReal), 8000),
      tem_midia: COM_MIDIA.has(tipo),
      citada: recortar(citadaTexto, 1000),
      mencionou_me: Boolean(
        meuJid && mencoes.some((j) => normalizarJid(j) === meuJid),
      ),
      // Responder uma mensagem do Jean e chama-lo, mesmo sem o @. No grupo
      // grande e ate mais comum que a marcacao: a pessoa segura a mensagem
      // dele e responde ali. `contextInfo.participant` e quem escreveu a
      // mensagem citada.
      respondeu_me: Boolean(
        meuJid && ctx?.participant && normalizarJid(ctx.participant) === meuJid,
      ),
      timestamp: paraIso(msg.messageTimestamp),
      raw: enxugar(msg),
      processed: false,
    };
  } catch (err) {
    console.error('[mensagem] falha ao normalizar, ignorando:', err?.message);
    return null;
  }
}

/** Remove o sufixo de device (`:12`) e uniformiza o dominio. */
export function normalizarJid(jid) {
  if (!jid || typeof jid !== 'string') return null;
  const [usuario, dominio] = jid.split('@');
  if (!dominio) return jid;
  return `${usuario.split(':')[0]}@${dominio}`;
}

function paraIso(ts) {
  // messageTimestamp pode vir number, string ou Long do protobuf.
  let segundos = ts;
  if (ts && typeof ts === 'object' && typeof ts.toNumber === 'function') {
    segundos = ts.toNumber();
  }
  const n = Number(segundos);
  if (!Number.isFinite(n) || n <= 0) return new Date().toISOString();
  return new Date(n * 1000).toISOString();
}

function recortar(texto, max) {
  if (typeof texto !== 'string') return null;
  const limpo = texto.trim();
  if (!limpo) return null;
  return limpo.length > max ? `${limpo.slice(0, max)}...` : limpo;
}

/**
 * Campos pesados que nao servem para nada depois. `jpegThumbnail` e uma
 * previa em base64 dentro do proprio payload: infla o jsonb e nao substitui
 * a imagem real, que o worker baixa quando precisa.
 */
const DESCARTAR = ['jpegThumbnail', 'thumbnailDirectPath', 'streamingSidecar'];

/**
 * Enxuga o raw sem quebrar o download posterior.
 *
 * ATENCAO: `mediaKey`, `fileEncSha256` e `directPath` ficam. Sao eles que
 * permitem ao worker baixar e descriptografar a imagem depois (src/midia.js).
 * Remove-los deixa a midia irrecuperavel: o WhatsApp so entrega o arquivo
 * cifrado, e a unica forma de pedir de novo e um retry de midia, que e
 * operacao de ENVIO — proibida aqui (CLAUDE.md secao 2).
 *
 * Consequencia de LGPD: o raw carrega a chave de decriptacao da midia de
 * terceiros. Ela vive so neste projeto Supabase, separado da base
 * corporativa, e some no fn_wa_purge_old.
 */
function enxugar(msg) {
  try {
    return JSON.parse(
      JSON.stringify(msg, (chave, valor) => {
        if (DESCARTAR.includes(chave)) return undefined;
        if (valor?.type === 'Buffer') return undefined;
        return valor;
      }),
    );
  } catch {
    return null;
  }
}
