// bomdia.js — rascunho de bom dia para o time, com contexto real das ultimas 24h.
//
// Sai no digest da manha, pronto para o Jean COPIAR e enviar a mao no horario
// que ele quiser. Este modulo nao envia nada (CLAUDE.md secao 2).
//
// Por que com contexto: bom dia generico o time aprende a ignorar em duas
// semanas. Uma linha do que realmente aconteceu no grupo ontem — execucao,
// ruptura, pendencia — faz a mensagem valer a leitura.

import { config } from './config.js';
import { chamarClaude } from './claude.js';
import { consultar } from './db.js';
import { hora } from './tempo.js';

const MAX_MSGS = 40;
const MAX_CHARS_POR_MSG = 300;

const SYSTEM = `Voce escreve a mensagem de bom dia que Jean Savino manda para o time dele no
WhatsApp. Jean e Head de Vendas Centro-Norte da Duty Cosmeticos, em Manaus.

COMO O JEAN ESCREVE
- portugues brasileiro, direto, frases curtas
- SEM emoji
- SEM "espero que esteja bem", SEM "otimo dia a todos", SEM frase motivacional
  generica, SEM citacao inspiradora
- quando cobra algo, sempre com data explicita
- trata o time como gente que sabe o que esta fazendo

ESTRUTURA
Duas a quatro linhas, nesta ordem:
1. Um "Bom dia" curto.
2. UMA linha com o que realmente importa hoje, tirada do que aconteceu no grupo
   nas ultimas 24h. Se ficou algo pendente, e isso. Se fecharam algo bom, e isso.
3. Se houver pendencia com prazo, uma cobranca com data.

REGRA DURA
Use SOMENTE fatos que aparecem nas mensagens fornecidas. Nao invente numero,
meta, loja, SKU, nome ou resultado. Se as mensagens nao trouxerem nada
aproveitavel, escreva so o bom dia com uma linha neutra sobre o dia — e melhor
curto e verdadeiro do que longo e inventado.

Vocabulario do time: sell-out, positivacao, ruptura, planograma, execucao,
gondola, ponto extra, PDV, verba/trade, canal tradicional/farma/alimentar.

Responda SOMENTE com o texto da mensagem. Sem aspas, sem explicacao, sem
cabecalho, sem alternativas.`;

/** Fallback quando nao ha IA disponivel ou a chamada falha. */
const PADRAO = 'Bom dia. Semana de execucao, foco em gondola e ruptura.\nQualquer trava no PDV, me chama aqui.';

/**
 * Acha o grupo pelo nome. Aceita pedaco do nome, sem acento obrigatorio.
 * @returns {object|null} linha de vw_wa_inbox
 */
export async function acharGrupo(padrao) {
  const r = await consultar('vw_wa_inbox', (q) => q.ilike('nome', `%${padrao}%`).limit(5));
  if (!r.ok || r.linhas.length === 0) return null;

  // Mais de um casando: fica com o de maior volume, que e o grupo de verdade.
  return r.linhas.sort((a, b) => (b.msg_count ?? 0) - (a.msg_count ?? 0))[0];
}

/** Mensagens do grupo na janela, mais antigas primeiro. */
export async function mensagensRecentes(chatId, horas = 24) {
  const desde = new Date(Date.now() - horas * 3600000).toISOString();
  const r = await consultar('wa_messages', (q) =>
    q.eq('chat_id', chatId)
     .gte('timestamp', desde)
     .order('timestamp', { ascending: false })
     .limit(MAX_MSGS));

  return r.ok ? r.linhas.reverse() : [];
}

/** Transcreve a conversa para o prompt. */
export function montarPrompt(grupo, mensagens) {
  if (mensagens.length === 0) {
    return `Grupo: ${grupo.nome}\n\n` +
           'Nao houve mensagem nas ultimas 24h. Escreva so o bom dia, curto, ' +
           'sem inventar contexto.';
  }

  const linhas = mensagens
    .map((m) => {
      const quem = m.from_me ? 'JEAN' : (m.sender_name ?? 'time');
      const texto = m.conteudo
        ? m.conteudo.slice(0, MAX_CHARS_POR_MSG)
        : `[${m.tipo}${m.tipo === 'audio' ? ' — nao transcrito' : ''}]`;
      return `[${hora(m.timestamp)}] ${quem}: ${texto}`;
    })
    .join('\n');

  const temMidia = mensagens.some((m) => m.tipo === 'audio');
  const aviso = temMidia
    ? '\n\nATENCAO: ha audio nao transcrito. Nao especule o que foi dito neles.'
    : '';

  return `Grupo: ${grupo.nome}\n` +
         `Segmento: ${grupo.segmento ?? 'trade'}\n\n` +
         `Ultimas 24h (${mensagens.length} mensagens):\n${linhas}${aviso}\n\n` +
         'Escreva o bom dia de hoje.';
}

/**
 * Gera o rascunho. Nunca lanca: em qualquer falha devolve o texto padrao,
 * porque o digest nao pode quebrar por causa disto.
 *
 * @param {string} padraoGrupo pedaco do nome do grupo
 * @returns {{texto:string, grupo:string|null, origem:'ia'|'padrao', msgs:number, nota?:string}}
 */
export async function gerarBomDia(padraoGrupo) {
  const grupo = await acharGrupo(padraoGrupo);

  if (!grupo) {
    return {
      texto: PADRAO,
      grupo: null,
      origem: 'padrao',
      msgs: 0,
      nota: `grupo "${padraoGrupo}" ainda nao apareceu na coleta`,
    };
  }

  const mensagens = await mensagensRecentes(grupo.chat_id);

  if (!config.anthropicKey) {
    return {
      texto: PADRAO,
      grupo: grupo.nome,
      origem: 'padrao',
      msgs: mensagens.length,
      nota: 'sem ANTHROPIC_API_KEY: texto generico',
    };
  }

  const r = await chamarClaude(montarPrompt(grupo, mensagens), {
    system: SYSTEM,
    maxTokens: 400,
  });

  if (!r.ok) {
    return {
      texto: PADRAO,
      grupo: grupo.nome,
      origem: 'padrao',
      msgs: mensagens.length,
      nota: `API falhou: ${r.erro?.slice(0, 80)}`,
    };
  }

  const texto = limpar(r.texto);
  if (!texto) {
    return {
      texto: PADRAO,
      grupo: grupo.nome,
      origem: 'padrao',
      msgs: mensagens.length,
      nota: 'resposta vazia da IA',
    };
  }

  return { texto, grupo: grupo.nome, origem: 'ia', msgs: mensagens.length };
}

/**
 * Tira o que o modelo as vezes acrescenta por conta: aspas em volta,
 * cerca de codigo, e emoji — que o Jean nao usa.
 */
export function limpar(bruto) {
  if (typeof bruto !== 'string') return null;

  let t = bruto.trim()
    .replace(/^```[a-z]*\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  // Aspas envolvendo a mensagem inteira.
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith('“') && t.endsWith('”'))) {
    t = t.slice(1, -1).trim();
  }

  // Sem emoji, em qualquer circunstancia (CLAUDE.md secao 1).
  t = t.replace(/\p{Extended_Pictographic}/gu, '').replace(/️/g, '');

  // Espaco duplo que sobra depois de tirar emoji.
  t = t.split('\n').map((l) => l.replace(/[ \t]{2,}/g, ' ').trimEnd()).join('\n').trim();

  return t || null;
}

/** Bloco do digest. */
export function formatar(r) {
  const L = ['', '---', `BOM DIA — ${r.grupo ?? 'time'} (copie e envie você mesmo)`, ''];
  for (const linha of r.texto.split('\n')) L.push(`   ${linha}`);
  if (r.nota) L.push('', `   [${r.nota}]`);
  else if (r.origem === 'ia') L.push('', `   [gerado a partir de ${r.msgs} mensagem(ns) das ultimas 24h]`);
  return L.join('\n');
}
