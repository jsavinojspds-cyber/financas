// resumo.js — "o que rolou hoje, grupo por grupo".
// Uso: node src/resumo.js [--horas 24] [--json] [--largura 76]
//
// Visao irma do digest.js, com pergunta diferente:
//
//   digest  fila de acao. So o que esta parado com o Jean, em ordem de
//           urgencia. Curto de proposito — se tudo aparece, nada e prioridade.
//   resumo  retrato do dia. TODO grupo com movimento aparece, mesmo sem
//           pendencia nenhuma. Trabalho separado de pessoal.
//
// As contagens vem de fn_wa_resumo_dia (sql/009). O texto vem da analise da
// IA, que so existe para o que o worker processou — grupo pessoal nao passa
// pela IA por padrao, entao aparece com atividade mas sem resumo. Isso e
// dito na tela, nao escondido.
//
// Este arquivo so LE e imprime. Nao envia nada (CLAUDE.md secao 2).

import { pathToFileURL } from 'node:url';

import { exigir } from './config.js';
import { consultar, rpc } from './db.js';
import { agora, hora } from './tempo.js';

const JANELA_PADRAO = 24;
const LARGURA_PADRAO = 76;

function args() {
  const a = process.argv.slice(2);
  const valor = (nome, padrao) => {
    const i = a.indexOf(nome);
    return i !== -1 && a[i + 1] ? a[i + 1] : padrao;
  };
  return {
    horas: Number.parseInt(valor('--horas', String(JANELA_PADRAO)), 10) || JANELA_PADRAO,
    largura: Number.parseInt(valor('--largura', String(LARGURA_PADRAO)), 10) || LARGURA_PADRAO,
    json: a.includes('--json'),
  };
}

const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

/** "1 conversa" / "4 conversas". Lido todo dia — plural errado incomoda. */
const plural = (q, um, muitos) => `${q} ${q === 1 ? um : muitos}`;

/** "12 mensagens de 4 pessoas" — plural certo, porque le-se isso todo dia. */
export function contagem(g) {
  const msgs = n(g.mensagens);
  const p = n(g.pessoas);
  const partes = [msgs === 1 ? '1 mensagem' : `${msgs} mensagens`];
  if (p > 0) partes.push(p === 1 ? 'de 1 pessoa' : `de ${p} pessoas`);
  return partes.join(' ');
}

/** "08h12 às 11h40", ou so a hora quando foi tudo no mesmo minuto. */
export function janela(g) {
  const a = hora(g.primeira);
  const b = hora(g.ultima);
  return a === b ? a : `${a} às ${b}`;
}

export function rotulo(g) {
  const nome = g.nome ?? g.chat_id ?? 'conversa';
  if (g.uf && !nome.toUpperCase().includes(g.uf)) return `${nome} (${g.uf})`;
  return nome;
}

/**
 * Junta atividade (contagens) com analise (texto da IA) e separa por bucket.
 *
 * `conhecidos` sao as conversas comerciais que o banco ja conhece: serve para
 * dizer "Mateus nao teve movimento hoje", que e informacao — silencio em
 * grupo de KA as vezes e o proprio problema.
 */
export function agrupar(atividade, analises, conhecidos = []) {
  const porChat = new Map((analises ?? []).map((a) => [a.chat_id, a]));

  const secoes = { trabalho: [], pessoal: [], ruido: [], indefinido: [] };

  for (const g of atividade ?? []) {
    const item = { ...g, analise: porChat.get(g.chat_id) ?? null };

    if (g.bucket === 'comercial') secoes.trabalho.push(item);
    else if (g.bucket === 'pessoal') secoes.pessoal.push(item);
    else if (g.bucket === 'ruido') secoes.ruido.push(item);
    else secoes.indefinido.push(item);
  }

  // Quem chamou o Jean vem primeiro; depois, quem falou mais.
  const ordem = (a, b) =>
    (n(b.chamados) > 0) - (n(a.chamados) > 0) || n(b.mensagens) - n(a.mensagens);

  secoes.trabalho.sort(ordem);
  secoes.pessoal.sort(ordem);
  secoes.indefinido.sort(ordem);

  const comMovimento = new Set((atividade ?? []).map((g) => g.chat_id));
  secoes.paradas = (conhecidos ?? [])
    .filter((c) => !comMovimento.has(c.id) && !c.muted)
    .map((c) => c.nome ?? c.id);

  return secoes;
}

function quebrar(texto, largura, recuo) {
  const palavras = String(texto).split(/\s+/).filter(Boolean);
  const linhas = [];
  let atual = '';
  for (const p of palavras) {
    if (atual && (atual + ' ' + p).length > largura) { linhas.push(atual); atual = p; }
    else atual = atual ? `${atual} ${p}` : p;
  }
  if (atual) linhas.push(atual);
  const pad = ' '.repeat(recuo);
  return linhas.map((l, i) => (i === 0 ? pad + l : pad + l));
}

function bloco(L, g, largura) {
  const a = g.analise;

  L.push(rotulo(g));

  const meta = [contagem(g), janela(g)];
  if (g.segmento) meta.unshift(g.segmento);
  L.push(`  ${meta.join(' · ')}`);

  if (a?.resumo) {
    for (const l of quebrar(a.resumo, largura - 2, 2)) L.push(l);
  } else if (a?.assunto) {
    L.push(`  ${a.assunto}`);
  }

  const marcas = [];
  if (n(g.chamados) > 0) {
    marcas.push(n(g.chamados) === 1 ? 'chamaram você 1x' : `chamaram você ${n(g.chamados)}x`);
  }
  if (a?.aguardando_jean) marcas.push('AGUARDANDO VOCÊ');
  if (a?.keywords_criticas?.length) marcas.push(a.keywords_criticas.join(', '));
  if (a?.rascunho) marcas.push('rascunho pronto');
  if (marcas.length) {
    const linha = marcas.join(' | ');
    const [primeira, ...resto] = quebrar(linha, largura - 4, 0);
    L.push(`  > ${primeira.trim()}`);
    for (const l of resto) L.push(`    ${l.trim()}`);
  }

  // Nao esconder o que nao foi lido. Audio ainda nao e transcrito.
  const pendencias = [];
  if (n(g.audios) > 0) {
    pendencias.push(n(g.audios) === 1 ? '1 áudio não transcrito'
                                      : `${n(g.audios)} áudios não transcritos`);
  }
  if (!a && g.bucket === 'comercial') pendencias.push('ainda não analisado pela IA');
  if (pendencias.length) L.push(`  (${pendencias.join('; ')})`);

  L.push('');
}

export function formatar({ secoes, janelaHoras, largura = LARGURA_PADRAO }) {
  const L = [];
  const total = (arr) => arr.reduce((s, g) => s + n(g.mensagens), 0);

  L.push(`RESUMO DO DIA — ${agora()}`);
  L.push(`Janela: últimas ${janelaHoras}h`);
  L.push('');

  // --- TRABALHO ---
  L.push(`TRABALHO (${plural(secoes.trabalho.length, 'conversa', 'conversas')}, `
        + `${plural(total(secoes.trabalho), 'mensagem', 'mensagens')})`);
  L.push('');
  if (secoes.trabalho.length === 0) {
    L.push('Nenhum grupo de trabalho teve movimento na janela.');
    L.push('');
  } else {
    for (const g of secoes.trabalho) bloco(L, g, largura);
  }

  // --- PESSOAL ---
  if (secoes.pessoal.length > 0) {
    L.push(`PESSOAL (${plural(secoes.pessoal.length, 'conversa', 'conversas')}, `
          + `${plural(total(secoes.pessoal), 'mensagem', 'mensagens')})`);
    L.push('');
    for (const g of secoes.pessoal) {
      L.push(`${rotulo(g)} — ${contagem(g)}, ${janela(g)}`);
    }
    L.push('');
    L.push('Conteúdo não analisado: grupo pessoal não passa pela IA.');
    L.push('Para incluir:  npm run worker -- --pessoal');
    L.push('');
  }

  // --- A CLASSIFICAR ---
  if (secoes.indefinido.length > 0) {
    L.push(`A CLASSIFICAR (${secoes.indefinido.length})`);
    for (const g of secoes.indefinido) {
      L.push(`  ${rotulo(g)} — ${contagem(g)}`);
    }
    L.push('');
    L.push('Rode:  npm run classificar');
    L.push('');
  }

  // --- RUIDO ---
  if (secoes.ruido.length > 0) {
    L.push(`RUÍDO (${plural(secoes.ruido.length, 'conversa', 'conversas')}, `
          + `${plural(total(secoes.ruido), 'mensagem', 'mensagens')}) — ignorado`);
    L.push('');
  }

  // --- SEM MOVIMENTO ---
  if (secoes.paradas.length > 0) {
    L.push(`SEM MOVIMENTO NA JANELA (${secoes.paradas.length})`);
    for (const l of quebrar(secoes.paradas.join(', '), largura - 2, 2)) L.push(l);
    L.push('');
  }

  return L.join('\n');
}

// --- main -------------------------------------------------------------------
async function main() {
  exigir(['supabaseUrl', 'supabaseKey']);
  const { horas, json, largura } = args();

  const desde = new Date(Date.now() - horas * 3600000).toISOString();

  const atividade = await rpc('fn_wa_resumo_dia', { desde });
  if (!atividade.ok) {
    console.error('\nNao consegui ler fn_wa_resumo_dia.');
    console.error('Rodou o sql/009_resumo_dia.sql no Supabase?\n');
    process.exit(1);
  }

  // A analise e opcional: sem ela o resumo ainda mostra a atividade.
  const analises = await consultar('vw_wa_digest');
  if (!analises.ok) {
    console.error('[aviso] analises indisponiveis, mostrando so as contagens');
  }

  const conhecidos = await consultar('wa_chats', (q) =>
    q.eq('bucket', 'comercial').select('id,nome,muted'));

  const secoes = agrupar(atividade.dados ?? [], analises.linhas, conhecidos.linhas);

  if (json) {
    console.log(JSON.stringify({ gerado_em: new Date().toISOString(), janela_horas: horas, secoes }, null, 2));
    return;
  }

  console.log('');
  console.log(formatar({ secoes, janelaHoras: horas, largura }));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('resumo falhou:', err?.message ?? err);
    process.exit(1);
  });
}
