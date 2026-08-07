// claude.js — chamada a API do Claude e leitura de JSON. Usado pelo
// classificar.js e pelo worker.js.
//
// CLAUDE.md regra 6: pedir JSON puro no system, limpar cercas ```json antes
// do JSON.parse, e tratar falha de parse sem derrubar o lote.

import { config } from './config.js';

const VERSAO = '2023-06-01';

/** Erros que valem nova tentativa. 4xx (menos 429) e problema nosso. */
const TENTAR_DE_NOVO = new Set([408, 409, 429, 500, 502, 503, 529]);

/**
 * Chama a API. Nunca lanca: devolve {ok, texto, uso} ou {ok:false, erro}.
 * Faz backoff em erro transitorio (429 e 5xx).
 *
 * @param {string} prompt
 * @param {object} opcoes
 * @param {string} opcoes.system
 * @param {number} [opcoes.maxTokens]
 * @param {number} [opcoes.tentativas]
 */
export async function chamarClaude(prompt, { system, maxTokens = 2000, tentativas = 3 } = {}) {
  let ultimoErro = 'sem tentativa';

  for (let n = 1; n <= tentativas; n += 1) {
    try {
      const resp = await fetch(`${config.anthropicBaseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': config.anthropicKey,
          'anthropic-version': VERSAO,
        },
        body: JSON.stringify({
          model: config.anthropicModel,
          max_tokens: maxTokens,
          system,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (resp.ok) {
        const dados = await resp.json();
        return {
          ok: true,
          texto: dados?.content?.map((c) => c.text ?? '').join('') ?? '',
          uso: {
            entrada: dados?.usage?.input_tokens ?? null,
            saida: dados?.usage?.output_tokens ?? null,
            modelo: dados?.model ?? config.anthropicModel,
          },
        };
      }

      const corpo = await resp.text().catch(() => '');
      ultimoErro = `HTTP ${resp.status} ${corpo.slice(0, 200)}`;

      if (!TENTAR_DE_NOVO.has(resp.status) || n === tentativas) {
        return { ok: false, erro: ultimoErro };
      }

      // Respeita retry-after quando a API manda; senao 2s, 4s, 8s.
      const sugerido = Number(resp.headers.get('retry-after'));
      const espera = Number.isFinite(sugerido) && sugerido > 0
        ? sugerido * 1000
        : 2 ** n * 1000;

      console.warn(`  API ${resp.status}, tentando de novo em ${espera / 1000}s (${n}/${tentativas})`);
      await dormir(espera);
    } catch (err) {
      ultimoErro = String(err?.message ?? err);
      if (n === tentativas) return { ok: false, erro: ultimoErro };
      await dormir(2 ** n * 1000);
    }
  }

  return { ok: false, erro: ultimoErro };
}

/**
 * Le JSON de uma resposta de modelo. Devolve null em vez de lancar, para
 * que uma resposta torta nao derrube o lote inteiro.
 */
export function parseJson(texto) {
  if (typeof texto !== 'string' || !texto.trim()) return null;

  const limpo = texto
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  try {
    return JSON.parse(limpo);
  } catch {
    // Ultimo recurso: recorta do primeiro { ate o ultimo }.
    const i = limpo.indexOf('{');
    const f = limpo.lastIndexOf('}');
    if (i === -1 || f <= i) return null;
    try {
      return JSON.parse(limpo.slice(i, f + 1));
    } catch {
      return null;
    }
  }
}

function dormir(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
