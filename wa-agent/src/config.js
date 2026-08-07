// config.js — carrega e valida o .env. Falha cedo e com mensagem util,
// em vez de estourar la na primeira query.

import 'dotenv/config';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));

export const RAIZ = resolve(AQUI, '..');
export const PASTA_AUTH = resolve(RAIZ, 'auth_info_baileys');

function inteiro(valor, padrao) {
  const n = Number.parseInt(valor ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : padrao;
}

export const config = {
  supabaseUrl: process.env.SUPABASE_URL ?? '',
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? '',
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
  // Sobrescrever so faz sentido para teste ou proxy corporativo.
  anthropicBaseUrl: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
  meuJid: process.env.MEU_JID ?? '',
  // Grupo do rascunho de bom dia. Pedaco do nome basta.
  bomDiaGrupo: process.env.BOM_DIA_GRUPO || 'MERCHANDISING',
  bufferMs: inteiro(process.env.BUFFER_MS, 5000),
  bufferMax: inteiro(process.env.BUFFER_MAX, 200),
  logLevel: process.env.LOG_LEVEL || 'info',
};

/**
 * Confere as variaveis obrigatorias e encerra com instrucao clara se faltar.
 * @param {string[]} obrigatorias chaves de `config`
 */
export function exigir(obrigatorias) {
  const faltando = obrigatorias.filter((k) => !config[k]);
  if (faltando.length === 0) return;

  const nomesEnv = {
    supabaseUrl: 'SUPABASE_URL',
    supabaseKey: 'SUPABASE_SERVICE_ROLE_KEY',
    anthropicKey: 'ANTHROPIC_API_KEY',
  };

  console.error('\nFaltam variaveis no .env:');
  for (const k of faltando) console.error(`  - ${nomesEnv[k] ?? k}`);
  console.error('\nCorrija com:');
  console.error('  cp .env.example .env && chmod 600 .env\n');
  process.exit(1);
}

// Erro comum: colar a anon key no lugar da service_role. O RLS esta ligado
// sem policy publica, entao a anon simplesmente le zero linhas e o problema
// aparece como "coleta vazia", que e muito mais dificil de diagnosticar.
export function avisarSeAnonKey() {
  if (!config.supabaseKey) return;
  try {
    const [, payload] = config.supabaseKey.split('.');
    if (!payload) return;
    const dados = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (dados?.role && dados.role !== 'service_role') {
      console.warn(
        `\nAVISO: a chave do Supabase tem role "${dados.role}", esperado "service_role".\n` +
        'Com RLS ligado e sem policy publica, essa chave nao le nem escreve nada.\n',
      );
    }
  } catch {
    // Chave em formato novo (sb_secret_...) nao e JWT. Sem o que validar.
  }
}
