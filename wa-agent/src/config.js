// config.js — carrega e valida o .env. Falha cedo e com mensagem util,
// em vez de estourar la na primeira query.

import dotenv from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// O dotenv NAO sobrescreve variavel que ja existe no ambiente — o ambiente
// vence, sempre. Guardamos o que o arquivo dizia para poder avisar quando o
// .env estiver sendo ignorado em silencio, que e o tipo de coisa que custa
// meia hora de diagnostico.
const { parsed: doArquivo = {} } = dotenv.config();

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

  // Busca semantica (Fase 6). Sem chave, a busca roda so na metade textual.
  // A dimensao TEM que bater com wa_messages.embedding, vector(1024) no 007.
  embeddingKey: process.env.EMBEDDING_API_KEY ?? '',
  embeddingModel: process.env.EMBEDDING_MODEL || 'voyage-3',
  embeddingBaseUrl: process.env.EMBEDDING_BASE_URL || 'https://api.voyageai.com',
  embeddingDim: inteiro(process.env.EMBEDDING_DIM, 1024),
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

  // A dica precisa ser do sistema de quem esta lendo. Mandar `cp` e `chmod`
  // para quem esta no Prompt de Comando so atrapalha.
  if (process.platform === 'win32') {
    console.error('\nSe o .env ainda nao existe:');
    console.error('  copy .env.example .env');
    console.error('\nPara editar:');
    console.error('  notepad .env\n');
  } else {
    console.error('\nSe o .env ainda nao existe:');
    console.error('  cp .env.example .env && chmod 600 .env\n');
  }

  process.exit(1);
}

/**
 * Avisa quando uma variavel do .env esta sendo ignorada porque o ambiente ja
 * tinha outra. Nunca imprime valor: so o nome.
 */
export function avisarSeAmbienteVence() {
  const ignoradas = Object.entries(doArquivo)
    .filter(([k, v]) => v !== '' && process.env[k] !== v)
    .map(([k]) => k);

  if (ignoradas.length === 0) return;

  console.warn(
    `\nAVISO: o ambiente ja definia ${ignoradas.join(', ')}, ` +
    'entao o valor do .env foi ignorado.\n' +
    'O dotenv nunca sobrescreve variavel existente. Se o .env e quem manda,\n' +
    `limpe do ambiente:  unset ${ignoradas.join(' ')}\n`,
  );
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
