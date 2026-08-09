// embeddings.js — vetores para a busca semantica (Fase 6).
//
// A Anthropic nao tem API de embeddings, entao isto exige um fornecedor a
// parte. O padrao e a Voyage AI, que e a parceira recomendada pela Anthropic e
// tem modelo multilingue — importante, porque o historico e em portugues com
// vocabulario de trade.
//
// SEM CHAVE, NADA QUEBRA. A busca continua funcionando so com a metade
// textual do 007_busca.sql, que ja resolve boa parte dos casos.
//
// ATENCAO: a dimensao precisa bater com a coluna `wa_messages.embedding`,
// declarada como vector(1024) no 007. Trocar de modelo por um de dimensao
// diferente exige recriar a coluna. As funcoes daqui conferem e param com
// mensagem clara em vez de gravar vetor torto.

import { config } from './config.js';

const TENTAR_DE_NOVO = new Set([408, 429, 500, 502, 503, 529]);

/** Quantos textos por chamada. A Voyage aceita bem mais, mas lote grande
 *  aumenta o custo de uma falha: se der erro, o lote inteiro volta. */
export const LOTE = 64;

export function disponivel() {
  return Boolean(config.embeddingKey);
}

/**
 * Gera embeddings. Nunca lanca.
 *
 * @param {string[]} textos
 * @param {'document'|'query'} tipo `query` para a busca, `document` para indexar.
 *        A Voyage otimiza os dois lados de forma diferente; usar o mesmo para
 *        ambos piora o resultado.
 * @returns {{ok:true, vetores:number[][], tokens:number}|{ok:false, erro:string}}
 */
export async function gerar(textos, tipo = 'document', tentativas = 3) {
  if (!Array.isArray(textos) || textos.length === 0) {
    return { ok: true, vetores: [], tokens: 0 };
  }
  if (!disponivel()) {
    return { ok: false, erro: 'sem EMBEDDING_API_KEY' };
  }

  let ultimoErro = 'sem tentativa';

  for (let n = 1; n <= tentativas; n += 1) {
    try {
      const resp = await fetch(`${config.embeddingBaseUrl}/v1/embeddings`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.embeddingKey}`,
        },
        body: JSON.stringify({
          model: config.embeddingModel,
          input: textos,
          input_type: tipo,
        }),
      });

      if (resp.ok) {
        const dados = await resp.json();
        const linhas = dados?.data ?? [];

        if (linhas.length !== textos.length) {
          return {
            ok: false,
            erro: `pedi ${textos.length} vetores, vieram ${linhas.length}`,
          };
        }

        // A API pode devolver fora de ordem; `index` e quem manda.
        const vetores = new Array(textos.length);
        for (const linha of linhas) {
          const i = Number.isInteger(linha?.index) ? linha.index : linhas.indexOf(linha);
          vetores[i] = linha?.embedding;
        }

        const errado = vetores.findIndex(
          (v) => !Array.isArray(v) || v.length !== config.embeddingDim,
        );
        if (errado !== -1) {
          const t = vetores[errado]?.length ?? 'nenhum';
          return {
            ok: false,
            erro:
              `o modelo "${config.embeddingModel}" devolveu vetor de ${t} dimensoes, ` +
              `mas a coluna wa_messages.embedding e vector(${config.embeddingDim}).\n` +
              '  Ajuste EMBEDDING_DIM e recrie a coluna, ou volte para um modelo ' +
              'com a dimensao certa. Nao gravei nada.',
          };
        }

        return { ok: true, vetores, tokens: dados?.usage?.total_tokens ?? 0 };
      }

      const corpo = await resp.text().catch(() => '');
      ultimoErro = `HTTP ${resp.status} ${corpo.slice(0, 200)}`;

      if (!TENTAR_DE_NOVO.has(resp.status) || n === tentativas) {
        return { ok: false, erro: ultimoErro };
      }

      const sugerido = Number(resp.headers.get('retry-after'));
      const espera = Number.isFinite(sugerido) && sugerido > 0 ? sugerido * 1000 : 2 ** n * 1000;
      console.warn(`  embeddings ${resp.status}, de novo em ${espera / 1000}s (${n}/${tentativas})`);
      await dormir(espera);
    } catch (err) {
      ultimoErro = String(err?.message ?? err);
      if (n === tentativas) return { ok: false, erro: ultimoErro };
      await dormir(2 ** n * 1000);
    }
  }

  return { ok: false, erro: ultimoErro };
}

/** Um texto so, para a consulta da busca. */
export async function gerarUm(texto, tipo = 'query') {
  const r = await gerar([texto], tipo);
  if (!r.ok) return r;
  return { ok: true, vetor: r.vetores[0], tokens: r.tokens };
}

function dormir(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
