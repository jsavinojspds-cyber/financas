// worker.js — Fase 3. Triagem, resumo e sugestao de resposta.
// Uso: node src/worker.js [--limit 500] [--chat <jid>] [--dry-run]
//
// Le a fila (wa_messages.processed = false), agrupa por conversa, decide o que
// merece IA e grava em wa_threads_analysis.
//
// Economia de token, na ordem (CLAUDE.md regra 7):
//   1. pessoal          -> nunca vai para a IA
//   2. ruido / muted    -> so vai se bater keyword critica
//   3. indefinido       -> fica na fila ate ser classificado
//   4. comercial ativo  -> vai para a IA
//
// O `rascunho` que sai daqui e para o Jean COPIAR e enviar a mao. Este
// processo nao envia nada (CLAUDE.md secao 2).

import { pathToFileURL } from 'node:url';

import { config, exigir } from './config.js';
import { chamarClaude, parseJson, comImagens } from './claude.js';
import { consultar, salvarAnalise, marcarProcessadas } from './db.js';
import { baixarDoLote } from './midia.js';
import { agora, decorrido, hora } from './tempo.js';

const LIMITE_PADRAO = 500;
const MAX_MSGS_POR_CONVERSA = 60;   // contexto por chamada
const MAX_CHARS_POR_MSG = 400;
// Imagem custa token: uma foto tipica gasta ~1.500 de entrada. Grupo de
// merchandising manda dezenas por dia, entao o teto e por conversa.
const MAX_IMAGENS_POR_CONVERSA = 4;

const SYSTEM = `Voce faz triagem do WhatsApp de Jean Savino, Head de Vendas Centro-Norte da
Duty Cosmeticos, em Manaus. Territorio: Norte (AM, RR, PA, AP, RO, AC) e Centro-Oeste.
Ele gerencia RCAs (representantes comerciais autonomos), redes KA e distribuidores.
Tambem e socio da Savino Locacoes (locadora em Manaus, franqueada Locagora).

Sua tarefa: dizer o que aconteceu na conversa, se a bola esta com o Jean, e
escrever um rascunho de resposta quando ele precisar responder.

PRIORIDADE
5 - trava faturamento ou venda agora: ruptura, pedido bloqueado, rejeicao fiscal,
    prazo que vence hoje, cobranca direta de superior
4 - precisa de resposta hoje: cliente esperando retorno, decisao pendente dele
3 - precisa de resposta nos proximos dias
2 - acompanhar, sem acao imediata
1 - informativo, nao exige nada

AGUARDANDO_JEAN
true quando alguem pediu algo a ele e ele ainda nao respondeu, ou quando o
assunto so anda com uma decisao dele. false quando a ultima palavra foi dele,
quando e so comunicado, ou quando a acao esta com outra pessoa.

CHAMADO DIRETO
[CITOU O JEAN] e [RESPONDEU O JEAN] marcam quem falou COM ele, nao perto dele.
Se houver um desses sem resposta dele depois, a bola esta com ele — trate
como aguardando_jean e escreva o rascunho respondendo exatamente o que foi
perguntado. Num grupo de 40 pessoas e o unico jeito de saber o que e para ele.

RASCUNHO — como o Jean escreve
- portugues brasileiro, direto, frases curtas
- sem emoji
- sem "espero que esteja bem", sem "tudo bem?", sem rodeio
- cobranca SEMPRE com data explicita ("me confirma ate sexta, 08/08")
- trata RCA e cliente pelo primeiro nome
- se falta informacao para responder de verdade, o rascunho pede exatamente
  a informacao que falta, sem prometer prazo que o Jean nao pode cumprir
- null quando aguardando_jean e false

IMAGENS
Quando houver imagem anexada, ela faz parte da conversa e vem antes do texto.
No canal comercial do Norte, foto quase sempre e documento: tabela de preco,
print de pedido, nota fiscal, comprovante, gondola com ruptura, planilha
fotografada da tela. LEIA o que esta escrito na imagem e use no resumo —
numero de pedido, SKU, valor, data, codigo de rejeicao. Se a imagem for
irrelevante (meme, foto social), ignore em vez de descrever.
Nunca invente conteudo de imagem que nao foi anexada.

Vocabulario: sell-in, sell-out, positivacao, ruptura, verba/trade, JBP, RTM,
canal tradicional/farma/alimentar, DDE/DDR, fundo cooperado, acordo comercial,
Salesforce, Scanntech, Nielsen, Power BI.

Responda SOMENTE com JSON puro, sem cercas de codigo, sem texto antes ou depois:
{"assunto":"3 a 6 palavras","resumo":"2 a 4 frases, o que aconteceu e o que trava","prioridade":1,"aguardando_jean":false,"pendencia":"o que exatamente esta parado, ou null","rascunho":"texto pronto para copiar, ou null"}`;

// --- argumentos -------------------------------------------------------------
function args() {
  const a = process.argv.slice(2);
  const valor = (nome, padrao) => {
    const i = a.indexOf(nome);
    return i !== -1 && a[i + 1] ? a[i + 1] : padrao;
  };
  return {
    limite: Number.parseInt(valor('--limit', String(LIMITE_PADRAO)), 10) || LIMITE_PADRAO,
    chat: valor('--chat', null),
    dryRun: a.includes('--dry-run'),
    semImagens: a.includes('--sem-imagens'),
  };
}

// --- keywords criticas ------------------------------------------------------
/** Termos que furam o silenciamento. Casamento local, sem gastar token. */
async function carregarKeywords() {
  const r = await consultar('wa_keywords_criticas', (q) => q.eq('ativo', true));
  return r.linhas.map((k) => ({
    termo: k.termo,
    alvo: k.termo.toLowerCase(),
    categoria: k.categoria,
  }));
}

export function acharKeywords(mensagens, keywords) {
  const achadas = new Set();
  for (const m of mensagens) {
    if (!m.conteudo) continue;
    const texto = m.conteudo.toLowerCase();
    for (const k of keywords) {
      if (texto.includes(k.alvo)) achadas.add(k.termo);
    }
  }
  return [...achadas];
}

// --- chamado direto ---------------------------------------------------------
/**
 * Chamaram o Jean e ele ainda nao voltou a falar?
 *
 * Chamar = marcar com @ ou responder uma mensagem dele. E o sinal mais forte
 * de que a bola esta com ele, porque e explicito — nao depende de a IA inferir
 * nada nem de relogio de SLA.
 *
 * Qualquer mensagem dele zera: se o Jean falou depois que o chamaram, ele ja
 * viu. Nao interessa se respondeu bem, interessa que a conversa andou.
 *
 * @param {object[]} mensagens em ordem crescente de tempo
 * @returns {{houve: boolean, pergunta: boolean, quem: string|null}}
 */
export function chamadoDireto(mensagens = []) {
  let alvo = null;

  for (const m of mensagens) {
    if (m.from_me) { alvo = null; continue; }
    if (m.mencionou_me || m.respondeu_me) alvo = m;
  }

  if (!alvo) return { houve: false, pergunta: false, quem: null };

  return {
    houve: true,
    // Pergunta direta e mais urgente que ser citado de passagem num
    // comunicado. O "?" e grosseiro, mas erra para o lado seguro.
    pergunta: /\?/.test(alvo.conteudo ?? ''),
    quem: alvo.sender_name ?? null,
  };
}

// --- decisao de triagem -----------------------------------------------------
/**
 * @returns {{acao: 'ia'|'descartar'|'segurar', motivo: string}}
 */
export function decidir(chat, keywordsAchadas, chamado = { houve: false }) {
  if (!chat) return { acao: 'segurar', motivo: 'conversa desconhecida' };

  if (chat.classificado_por === 'nenhum' || chat.bucket === 'indefinido') {
    // Fica na fila. Depois de `npm run classificar` ela e reavaliada.
    return { acao: 'segurar', motivo: 'sem classificacao' };
  }

  if (chat.bucket === 'pessoal') {
    return { acao: 'descartar', motivo: 'pessoal' };
  }

  const silenciado = chat.muted || chat.bucket === 'ruido';
  if (silenciado) {
    if (keywordsAchadas.length > 0) {
      return { acao: 'ia', motivo: `silenciado, mas bateu: ${keywordsAchadas.join(', ')}` };
    }
    // Segundo furo do silenciamento: chamar o Jean pelo nome. Silenciar um
    // grupo diz "nao me avise de tudo", nao "nao me avise quando falarem
    // comigo". CONEXAO DUTY e muted e mesmo assim pode ter RH cobrando ele.
    if (chamado.houve) {
      return { acao: 'ia', motivo: `silenciado, mas ${chamado.quem ?? 'alguem'} chamou voce` };
    }
    return { acao: 'descartar', motivo: chat.muted ? 'silenciado' : 'ruido' };
  }

  return { acao: 'ia', motivo: chat.segmento ?? 'comercial' };
}

// --- prompt -----------------------------------------------------------------
export function montarPrompt(chat, mensagens, keywordsAchadas, imagens = []) {
  // Só marca como anexada a imagem que realmente foi baixada. O resto vira
  // "nao recuperada", para o modelo nao inventar o que nao viu.
  const anexadas = new Set(imagens.map((i) => i.msg_id));

  const linhas = mensagens
    .slice(-MAX_MSGS_POR_CONVERSA)
    .map((m) => {
      const quem = m.from_me ? 'JEAN' : (m.sender_name ?? 'contato');

      let texto;
      if (m.conteudo) {
        texto = m.conteudo.slice(0, MAX_CHARS_POR_MSG);
        if (m.tipo === 'imagem') {
          texto = anexadas.has(m.msg_id)
            ? `[imagem anexada] ${texto}`
            : `[imagem nao recuperada] ${texto}`;
        }
      } else if (m.tipo === 'imagem') {
        texto = anexadas.has(m.msg_id) ? '[imagem anexada]' : '[imagem nao recuperada]';
      } else if (m.tipo === 'audio') {
        texto = '[audio — ainda nao transcrito]';
      } else {
        texto = `[${m.tipo}]`;
      }

      const citada = m.citada ? ` (respondendo: "${m.citada.slice(0, 120)}")` : '';
      const arroba = m.from_me
        ? ''
        : (m.mencionou_me ? ' [CITOU O JEAN]' : (m.respondeu_me ? ' [RESPONDEU O JEAN]' : ''));
      return `[${hora(m.timestamp)}] ${quem}${arroba}: ${texto}${citada}`;
    })
    .join('\n');

  const cabecalho = [
    `Conversa: ${chat.nome ?? chat.chat_id}`,
    `Tipo: ${chat.is_group ? 'grupo' : 'conversa 1:1'}`,
    `Segmento: ${chat.segmento ?? 'nao definido'}`,
    chat.responsavel ? `Responsavel: ${chat.responsavel}` : null,
    chat.uf ? `UF: ${chat.uf}` : null,
    chat.sla_horas ? `SLA: ${chat.sla_horas}h` : null,
    `Ultima mensagem ha ${decorrido(chat.last_message_at)}`,
    chat.last_message_from_me
      ? 'A ultima palavra foi do Jean.'
      : 'A ultima palavra NAO foi do Jean.',
    keywordsAchadas.length
      ? `Termos criticos encontrados: ${keywordsAchadas.join(', ')}`
      : null,
  ].filter(Boolean).join('\n');

  // As imagens chegam nos blocos de conteudo, antes deste texto. Esta lista
  // diz ao modelo qual e qual, para ele nao trocar uma pela outra.
  const listaImagens = imagens.length
    ? `\n\nImagens anexadas, na ordem em que aparecem acima:\n` +
      imagens
        .map((img, i) => `${i + 1}. ${hora(img.timestamp)}` +
                         (img.legenda ? ` — legenda: "${img.legenda.slice(0, 120)}"` : ' — sem legenda'))
        .join('\n')
    : '';

  const naoRecuperadas = mensagens.filter(
    (m) => m.tipo === 'imagem' && !anexadas.has(m.msg_id),
  ).length;

  const pendencias = [];
  if (mensagens.some((m) => m.tipo === 'audio')) {
    pendencias.push('ha audio que ainda nao e transcrito (Fase 3.5)');
  }
  if (naoRecuperadas > 0) {
    pendencias.push(`${naoRecuperadas} imagem(ns) nao pode(m) ser recuperada(s)`);
  }

  const aviso = pendencias.length
    ? `\n\nATENCAO: ${pendencias.join('; ')}. Considere o resumo incompleto e ` +
      'diga isso no campo resumo. Nao especule sobre o conteudo que faltou.'
    : '';

  return `${cabecalho}\n\nMensagens novas (${mensagens.length}):\n${linhas}${listaImagens}${aviso}`;
}

// --- validacao da saida da IA -----------------------------------------------
export function validar(bruto, keywordsAchadas, chamado = { houve: false }) {
  const texto = (v, max) =>
    typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;

  let prioridade = Number.parseInt(bruto?.prioridade, 10);
  if (!Number.isFinite(prioridade) || prioridade < 1 || prioridade > 5) prioridade = 3;

  // Keyword critica manda: forca 5 mesmo que a IA tenha achado pouco relevante,
  // e mesmo em grupo silenciado (CLAUDE.md secao 6).
  if (keywordsAchadas.length > 0) prioridade = 5;

  // Chamado direto tambem manda, mas so levanta — nunca abaixa. Pergunta
  // direta com o nome dele vai a 5; ser citado de passagem, a 4.
  if (chamado.houve) {
    prioridade = Math.max(prioridade, chamado.pergunta ? 5 : 4);
  }

  return {
    assunto: texto(bruto?.assunto, 120),
    resumo: texto(bruto?.resumo, 2000),
    prioridade,
    // Chamado em aberto vence o julgamento da IA. Se marcaram o Jean e ele
    // nao voltou a falar, a bola esta com ele — nao ha o que interpretar.
    aguardando_jean: Boolean(bruto?.aguardando_jean) || chamado.houve,
    pendencia: texto(bruto?.pendencia, 1000),
    rascunho: texto(bruto?.rascunho, 3000),
    keywords_criticas: keywordsAchadas,
    chamado_direto: chamado.houve,
  };
}

// --- processamento de uma conversa ------------------------------------------
async function analisar(chat, mensagens, keywordsAchadas, chamado, dryRun, comMidia = true) {
  // So baixa depois da triagem: conversa silenciada, pessoal ou ruido nunca
  // chega aqui, entao nunca gera trafego de download.
  let imagens = [];
  if (comMidia && mensagens.some((m) => m.tipo === 'imagem')) {
    const r = await baixarDoLote(mensagens, MAX_IMAGENS_POR_CONVERSA);
    imagens = r.imagens;
    if (r.tentadas > 0) {
      const kb = Math.round(imagens.reduce((s, i) => s + i.bytes, 0) / 1024);
      console.log(`  imagens: ${imagens.length}/${r.tentadas} baixadas (${kb}KB)` +
                  (r.falhas ? `, ${r.falhas} falhou/expirou` : ''));
    }
  }

  const resposta = await chamarClaude(
    comImagens(montarPrompt(chat, mensagens, keywordsAchadas, imagens), imagens),
    { system: SYSTEM, maxTokens: 1500 },
  );

  if (!resposta.ok) {
    console.log(`  ERRO API: ${resposta.erro}`);
    console.log('  mensagens ficam na fila para a proxima rodada');
    return { ok: false };
  }

  const bruto = parseJson(resposta.texto);
  if (!bruto) {
    // Regra 6: parse ruim nao derruba o lote. A conversa volta na proxima.
    console.log('  ERRO: resposta nao veio em JSON valido, pulando');
    console.log(`  recebido: ${resposta.texto.slice(0, 160)}`);
    return { ok: false };
  }

  const dados = validar(bruto, keywordsAchadas, chamado);
  const ts = mensagens.map((m) => new Date(m.timestamp).getTime());

  const linha = {
    chat_id: chat.chat_id,
    janela_inicio: new Date(Math.min(...ts)).toISOString(),
    janela_fim: new Date(Math.max(...ts)).toISOString(),
    msgs_analisadas: mensagens.length,
    ...dados,
    modelo: resposta.uso.modelo,
    tokens_in: resposta.uso.entrada,
    tokens_out: resposta.uso.saida,
  };

  console.log(`  P${dados.prioridade}  ${dados.assunto ?? '(sem assunto)'}` +
              `${dados.aguardando_jean ? '  [AGUARDANDO VOCE]' : ''}` +
              `${dados.chamado_direto ? `  [${chamado.quem ?? 'alguem'} chamou voce]` : ''}`);
  if (dados.resumo) console.log(`  ${dados.resumo}`);
  if (dados.rascunho) console.log(`  rascunho: ${dados.rascunho.slice(0, 120)}...`);

  if (dryRun) {
    console.log('  [dry-run] nada gravado');
    return { ok: true, gravado: false, uso: resposta.uso };
  }

  const r = await salvarAnalise(linha);
  if (!r.ok) return { ok: false };

  // So sai da fila DEPOIS que a analise gravou.
  const ids = mensagens.map((m) => m.id);
  const marcado = await marcarProcessadas(ids);
  if (!marcado.ok) {
    console.log('  AVISO: analise gravada mas a fila nao limpou. Vai repetir na proxima.');
  }

  return { ok: true, gravado: true, uso: resposta.uso };
}

// --- main -------------------------------------------------------------------
async function main() {
  exigir(['supabaseUrl', 'supabaseKey', 'anthropicKey']);
  const { limite, chat: soEsteChat, dryRun, semImagens } = args();

  console.log(`\nWA-AGENT — triagem em ${agora()} (Manaus)`);
  console.log(`Modelo: ${config.anthropicModel}${dryRun ? '   [DRY-RUN]' : ''}` +
              `${semImagens ? '   [SEM IMAGENS]' : ''}\n`);

  // 1. fila
  const fila = await consultar('wa_messages', (q) => {
    let base = q.eq('processed', false).order('timestamp', { ascending: true }).limit(limite);
    if (soEsteChat) base = base.eq('chat_id', soEsteChat);
    return base;
  });

  if (!fila.ok) {
    console.error('Nao consegui ler a fila. Confira o Supabase.');
    process.exit(1);
  }
  if (fila.linhas.length === 0) {
    console.log('Fila vazia. Nada a processar.\n');
    return;
  }

  // 2. agrupa por conversa
  const porChat = new Map();
  for (const m of fila.linhas) {
    if (!porChat.has(m.chat_id)) porChat.set(m.chat_id, []);
    porChat.get(m.chat_id).push(m);
  }

  console.log(`${fila.linhas.length} mensagem(ns) em ${porChat.size} conversa(s).\n`);

  // 3. contexto das conversas e keywords, em duas leituras
  const ids = [...porChat.keys()];
  const chats = await consultar('vw_wa_inbox', (q) => q.in('chat_id', ids));
  const porId = new Map(chats.linhas.map((c) => [c.chat_id, c]));
  const keywords = await carregarKeywords();

  // 4. triagem
  const relatorio = { ia: 0, descartadas: 0, seguradas: 0, falhas: 0, msgsDescartadas: 0 };
  const silenciadas = [];
  const semClassificacao = [];
  let tokensIn = 0;
  let tokensOut = 0;
  const paraDescartar = [];

  for (const [chatId, mensagens] of porChat) {
    const chat = porId.get(chatId);
    const achadas = acharKeywords(mensagens, keywords);
    const chamado = chamadoDireto(mensagens);
    const { acao, motivo } = decidir(chat, achadas, chamado);
    const nome = chat?.nome ?? chatId;

    if (acao === 'segurar') {
      relatorio.seguradas += 1;
      semClassificacao.push(`${nome} (${mensagens.length})`);
      continue;
    }

    if (acao === 'descartar') {
      relatorio.descartadas += 1;
      relatorio.msgsDescartadas += mensagens.length;
      silenciadas.push(`${nome} (${mensagens.length}, ${motivo})`);
      if (!dryRun) paraDescartar.push(...mensagens.map((m) => m.id));
      continue;
    }

    console.log(`${nome}  — ${mensagens.length} msg, ${motivo}`);
    const r = await analisar(chat, mensagens, achadas, chamado, dryRun, !semImagens);
    if (r.ok) {
      relatorio.ia += 1;
      tokensIn += r.uso?.entrada ?? 0;
      tokensOut += r.uso?.saida ?? 0;
    } else {
      relatorio.falhas += 1;
    }
    console.log('');
  }

  // Descartadas saem da fila em uma tacada so.
  if (paraDescartar.length > 0) {
    const r = await marcarProcessadas(paraDescartar);
    if (!r.ok) console.log('AVISO: nao consegui limpar as descartadas da fila.');
  }

  // 5. relatorio
  console.log('---');
  console.log(`analisadas com IA:   ${relatorio.ia}`);
  console.log(`descartadas:         ${relatorio.descartadas} conversa(s), ${relatorio.msgsDescartadas} msg`);
  if (relatorio.seguradas > 0) {
    console.log(`sem classificacao:   ${relatorio.seguradas} conversa(s) — rode: npm run classificar`);
    for (const s of semClassificacao.slice(0, 10)) console.log(`  ${s}`);
  }
  if (relatorio.falhas > 0) {
    console.log(`falharam:            ${relatorio.falhas} (seguem na fila)`);
  }
  if (tokensIn || tokensOut) {
    console.log(`tokens:              ${tokensIn} entrada, ${tokensOut} saida`);
  }
  if (silenciadas.length > 0) {
    console.log(`\nsilenciadas: ${silenciadas.slice(0, 12).join('; ')}`);
  }
  console.log('');
}

// So roda quando executado direto. Importar para teste nao dispara nada.
const executadoDireto =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (executadoDireto) {
  main().catch((err) => {
    console.error('\nworker falhou:', err?.message ?? err);
    process.exit(1);
  });
}
