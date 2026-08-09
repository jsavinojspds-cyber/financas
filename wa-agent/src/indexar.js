// indexar.js — gera embeddings do historico. Fase 6.
// Uso: npm run indexar [--limit 2000] [--min-chars 20] [--dry-run]
//
// Roda quando quiser: a fila e `embedding is null and conteudo is not null`.
// Interromper no meio nao estraga nada — o que ja gravou fica, o resto volta
// na proxima. Nao ha estado fora do banco.
//
// Mensagem curta demais nao vale um vetor. "ok", "ciente", "bom dia" e um
// terco do trafego dos grupos de lideranca e nao carregam significado
// pesquisavel. Ficam so na busca textual, que e de graca.

import { pathToFileURL } from 'node:url';

import { config, exigir } from './config.js';
import { disponivel, gerar, LOTE } from './embeddings.js';
import { consultar, rpc } from './db.js';
import { agora } from './tempo.js';

const LIMITE_PADRAO = 2000;
const MIN_CHARS_PADRAO = 20;

function args() {
  const a = process.argv.slice(2);
  const valor = (nome, padrao) => {
    const i = a.indexOf(nome);
    return i !== -1 && a[i + 1] ? a[i + 1] : padrao;
  };
  return {
    limite: Number.parseInt(valor('--limit', String(LIMITE_PADRAO)), 10) || LIMITE_PADRAO,
    minChars: Number.parseInt(valor('--min-chars', String(MIN_CHARS_PADRAO)), 10) || MIN_CHARS_PADRAO,
    dryRun: a.includes('--dry-run'),
  };
}

/** Vale gastar um vetor com este texto? */
export function vale(texto, minChars) {
  if (typeof texto !== 'string') return false;
  const limpo = texto.trim();
  if (limpo.length < minChars) return false;

  // So numero, so pontuacao, ou so uma palavra repetida nao carrega busca.
  if (!/[\p{L}]{3,}/u.test(limpo)) return false;

  return true;
}

async function status() {
  const r = await rpc('fn_wa_status_indice');
  if (!r.ok) return null;
  return Array.isArray(r.dados) ? r.dados[0] : r.dados;
}

async function main() {
  exigir(['supabaseUrl', 'supabaseKey']);
  const { limite, minChars, dryRun } = args();

  console.log(`\nWA-AGENT — indexacao em ${agora()} (Manaus)`);

  if (!disponivel()) {
    console.log('\nSem EMBEDDING_API_KEY no .env.');
    console.log('A busca continua funcionando so com a metade textual:');
    console.log('  npm run buscar -- "ruptura"\n');
    console.log('Para ligar a busca semantica, preencha EMBEDDING_API_KEY.');
    console.log('A Anthropic nao tem API de embeddings — o padrao aqui e a Voyage AI.\n');
    process.exit(1);
  }

  console.log(`Modelo: ${config.embeddingModel} (${config.embeddingDim} dimensoes)` +
              `${dryRun ? '   [DRY-RUN]' : ''}\n`);

  const antes = await status();
  if (antes) {
    console.log(`Historico: ${antes.com_texto} com texto, ${antes.indexadas} indexadas, ` +
                `${antes.na_fila} na fila (${antes.pct_indexado ?? 0}%)\n`);
  }

  const fila = await consultar('wa_messages', (q) =>
    q.select('id,conteudo')
     .is('embedding', null)
     .not('conteudo', 'is', null)
     .order('timestamp', { ascending: false })
     .limit(limite));

  if (!fila.ok) {
    console.error('Nao consegui ler a fila. Rodou o sql/007_busca.sql?');
    process.exit(1);
  }

  const candidatas = fila.linhas.filter((m) => vale(m.conteudo, minChars));
  const curtas = fila.linhas.length - candidatas.length;

  if (candidatas.length === 0) {
    console.log('Nada para indexar.');
    if (curtas > 0) console.log(`${curtas} mensagem(ns) curtas demais, ficam so na busca textual.`);
    console.log('');
    return;
  }

  console.log(`${candidatas.length} para indexar` +
              (curtas > 0 ? `, ${curtas} curtas demais (so busca textual)` : '') + '\n');

  let gravadas = 0;
  let tokens = 0;
  let falhas = 0;

  for (let i = 0; i < candidatas.length; i += LOTE) {
    const lote = candidatas.slice(i, i + LOTE);
    const n = Math.floor(i / LOTE) + 1;
    const total = Math.ceil(candidatas.length / LOTE);

    const r = await gerar(lote.map((m) => m.conteudo), 'document');

    if (!r.ok) {
      console.error(`  lote ${n}/${total}: ${r.erro}`);
      falhas += lote.length;
      // Dimensao errada nao adianta insistir no proximo lote.
      if (r.erro.includes('dimensoes')) {
        console.error('\n  Parando: o resto dos lotes daria o mesmo erro.\n');
        break;
      }
      continue;
    }

    tokens += r.tokens;

    if (dryRun) {
      console.log(`  lote ${n}/${total}: ${lote.length} vetores gerados [dry-run, nada gravado]`);
      continue;
    }

    const g = await rpc('fn_wa_gravar_embeddings', {
      lote: lote.map((m, k) => ({ id: m.id, embedding: r.vetores[k] })),
    });

    if (!g.ok) {
      console.error(`  lote ${n}/${total}: gerou mas nao gravou. Volta na proxima rodada.`);
      falhas += lote.length;
      continue;
    }

    gravadas += Number(g.dados ?? 0);
    console.log(`  lote ${n}/${total}: ${g.dados} gravado(s)`);
  }

  console.log('\n---');
  console.log(`gravadas:  ${gravadas}`);
  if (falhas > 0) console.log(`falharam:  ${falhas} (seguem na fila)`);
  console.log(`tokens:    ${tokens}`);

  const depois = await status();
  if (depois) {
    console.log(`indice:    ${depois.indexadas}/${depois.com_texto} (${depois.pct_indexado ?? 0}%)`);
    if (Number(depois.na_fila) > 0) {
      console.log(`\nAinda ha ${depois.na_fila} na fila. Rode de novo para continuar.`);
    }
  }
  console.log('');
}

const executadoDireto =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (executadoDireto) {
  main().catch((err) => {
    console.error('\nindexar falhou:', err?.message ?? err);
    process.exit(1);
  });
}
