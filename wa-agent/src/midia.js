// midia.js — baixa e descriptografa imagem do WhatsApp, sob demanda.
//
// Quem chama e o worker, nao o listener. Motivos:
//   - o listener fica enxuto: nenhum trafego extra amarrado ao socket vivo
//   - so conversa que vai para a IA baixa. Silenciada, pessoal e ruido nunca
//   - nada e arquivado: o binario vive em memoria, vira leitura e e descartado
//
// Nao existe pedido de reenvio de midia aqui. Se a URL expirou, a imagem se
// perde e o resumo diz isso. Pedir reenvio e operacao de ENVIO, proibida
// (CLAUDE.md secao 2).

import { downloadContentFromMessage } from '@whiskeysockets/baileys';

import { desembrulhar } from './mensagem.js';

// A API do Claude aceita imagem ate 5MB em base64. Acima disso nem tenta.
export const MAX_BYTES = 5 * 1024 * 1024;
const TIPOS_ACEITOS = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const TIMEOUT_MS = 20000;

/**
 * Acha o imageMessage dentro do raw guardado em wa_messages.
 * @returns {object|null} objeto com url/mediaKey/mimetype, ou null
 */
export function extrairImagem(raw) {
  try {
    const conteudo = desembrulhar(raw?.message);
    const img = conteudo?.imageMessage;
    if (!img) return null;
    // Sem mediaKey nao ha como descriptografar.
    if (!img.mediaKey || !(img.url || img.directPath)) return null;
    return img;
  } catch {
    return null;
  }
}

/** O Claude precisa de um media_type que ele aceite. */
export function tipoAceito(mimetype) {
  const limpo = String(mimetype ?? '').split(';')[0].trim().toLowerCase();
  return TIPOS_ACEITOS.has(limpo) ? limpo : null;
}

/**
 * Baixa, descriptografa e devolve base64. Nunca lanca.
 *
 * Aborta assim que o acumulado passa de MAX_BYTES, em vez de baixar tudo e
 * so entao descobrir que nao cabe.
 *
 * @returns {{ok:true, base64:string, tipo:string, bytes:number}|{ok:false, erro:string}}
 */
export async function baixarImagem(img, { maxBytes = MAX_BYTES, timeoutMs = TIMEOUT_MS } = {}) {
  // Mimetype declarado e nao suportado: recusa em vez de rotular errado.
  // Mentir o media_type para a API faz ela rejeitar ou ler lixo. Ausente e
  // outro caso: o WhatsApp entrega imagem como JPEG, entao o default vale.
  const tipo = img?.mimetype ? tipoAceito(img.mimetype) : 'image/jpeg';
  if (!tipo) {
    return { ok: false, erro: `formato nao suportado: ${img.mimetype}` };
  }

  // fileLength vem do proprio WhatsApp: da para recusar antes de abrir conexao.
  const tamanhoDeclarado = Number(img?.fileLength?.low ?? img?.fileLength ?? 0);
  if (tamanhoDeclarado > maxBytes) {
    return { ok: false, erro: `imagem de ${(tamanhoDeclarado / 1048576).toFixed(1)}MB, acima do limite` };
  }

  let temporizador;
  try {
    const corrida = new Promise((_, rejeitar) => {
      temporizador = setTimeout(() => rejeitar(new Error('timeout no download')), timeoutMs);
    });

    const baixar = (async () => {
      const stream = await downloadContentFromMessage(img, 'image');
      const partes = [];
      let total = 0;

      for await (const pedaco of stream) {
        total += pedaco.length;
        if (total > maxBytes) {
          throw new Error(`imagem passou de ${(maxBytes / 1048576).toFixed(0)}MB durante o download`);
        }
        partes.push(pedaco);
      }

      if (total === 0) throw new Error('download vazio');
      return Buffer.concat(partes);
    })();

    const buffer = await Promise.race([baixar, corrida]);

    return {
      ok: true,
      base64: buffer.toString('base64'),
      tipo,
      bytes: buffer.length,
    };
  } catch (err) {
    // URL expirada cai aqui. Sem reenvio: a imagem se perde e o resumo avisa.
    return { ok: false, erro: String(err?.message ?? err) };
  } finally {
    clearTimeout(temporizador);
  }
}

/**
 * Baixa as imagens de um lote de mensagens, respeitando um teto.
 *
 * O teto existe porque imagem custa token: uma foto tipica gasta na faixa de
 * 1.500 tokens de entrada. Grupo de merchandising manda 30 fotos por dia.
 *
 * Prioriza as mais recentes: em cobranca, a ultima foto costuma ser a que
 * importa (a tabela corrigida, o print do pedido que travou).
 *
 * @param {object[]} mensagens linhas de wa_messages
 * @param {number} maxImagens teto por conversa
 * @returns {{imagens: Array, tentadas: number, falhas: number}}
 */
export async function baixarDoLote(mensagens, maxImagens = 4) {
  const candidatas = mensagens
    .filter((m) => m.tipo === 'imagem')
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, maxImagens);

  const imagens = [];
  let falhas = 0;

  for (const m of candidatas) {
    const img = extrairImagem(m.raw);
    if (!img) {
      falhas += 1;
      continue;
    }

    const r = await baixarImagem(img);
    if (r.ok) {
      imagens.push({
        msg_id: m.msg_id,
        timestamp: m.timestamp,
        legenda: m.conteudo ?? null,
        base64: r.base64,
        tipo: r.tipo,
        bytes: r.bytes,
      });
    } else {
      falhas += 1;
    }
  }

  return { imagens, tentadas: candidatas.length, falhas };
}
