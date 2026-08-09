// buscar.js — busca no historico. Fase 6.
// Uso: npm run buscar -- "tabela de julho" [--dias 90] [--chat <jid>]
//                        [--comercial] [--limite 20] [--so-texto]
//
// Duas buscas fundidas por RRF: textual (portugues, sem chave nenhuma) e
// semantica (pgvector, so com EMBEDDING_API_KEY). Sem a chave ela roda so na
// metade textual e diz isso — nao finge que fez busca semantica.

import { pathToFileURL } from 'node:url';

import { exigir } from './config.js';
import { disponivel, gerarUm } from './embeddings.js';
import { rpc } from './db.js';
import { completo, decorrido } from './tempo.js';

function args() {
  const a = process.argv.slice(2);
  const valor = (nome, padrao) => {
    const i = a.indexOf(nome);
    return i !== -1 && a[i + 1] ? a[i + 1] : padrao;
  };
  // Tudo que nao for flag nem valor de flag e o termo de busca.
  const flags = ['--dias', '--chat', '--limite'];
  const termo = [];
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].startsWith('--')) {
      if (flags.includes(a[i])) i += 1;
      continue;
    }
    termo.push(a[i]);
  }

  return {
    termo: termo.join(' ').trim(),
    dias: Number.parseInt(valor('--dias', '0'), 10) || 0,
    chat: valor('--chat', null),
    limite: Number.parseInt(valor('--limite', '20'), 10) || 20,
    comercial: a.includes('--comercial'),
    soTexto: a.includes('--so-texto'),
  };
}

/** Destaca as palavras da consulta no trecho, para o olho achar rapido. */
export function destacar(texto, termo, largura = 150) {
  if (!texto) return '';

  const palavras = termo
    .toLowerCase()
    .split(/\s+/)
    .filter((p) => p.length >= 3 && !p.startsWith('-'));

  let recorte = texto.trim().replace(/\s+/g, ' ');

  // Se a mensagem e longa, centraliza no primeiro casamento.
  if (recorte.length > largura && palavras.length > 0) {
    const baixo = recorte.toLowerCase();
    const pos = palavras
      .map((p) => baixo.indexOf(p))
      .filter((i) => i !== -1)
      .sort((a, b) => a - b)[0];

    if (pos != null && pos > largura / 2) {
      const inicio = Math.max(0, pos - Math.floor(largura / 3));
      recorte = `...${recorte.slice(inicio, inicio + largura)}`;
    }
  }

  if (recorte.length > largura) recorte = `${recorte.slice(0, largura)}...`;

  // ANSI so quando a saida e terminal; num pipe vira lixo.
  if (!process.stdout.isTTY || palavras.length === 0) return recorte;

  for (const p of palavras) {
    recorte = recorte.replace(
      new RegExp(`(${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'),
      '[1m$1[22m',
    );
  }
  return recorte;
}

async function main() {
  exigir(['supabaseUrl', 'supabaseKey']);
  const { termo, dias, chat, limite, comercial, soTexto } = args();

  if (!termo) {
    console.log('\nUso: npm run buscar -- "o que procurar"\n');
    console.log('  --dias 90        so os ultimos N dias');
    console.log('  --chat <jid>     so uma conversa');
    console.log('  --comercial      ignora pessoal e ruido');
    console.log('  --limite 20      quantos resultados');
    console.log('  --so-texto       nao usa busca semantica, mesmo com chave\n');
    process.exit(1);
  }

  // Vetor da consulta. `query` e nao `document`: os dois lados sao otimizados
  // de forma diferente, e trocar piora o resultado.
  let vetor = null;
  let modo = 'so texto';

  if (!soTexto && disponivel()) {
    const r = await gerarUm(termo, 'query');
    if (r.ok) {
      vetor = r.vetor;
      modo = 'texto + semantica';
    } else {
      console.error(`[aviso] busca semantica indisponivel: ${r.erro}`);
      console.error('[aviso] seguindo so com a busca textual.\n');
    }
  } else if (!soTexto) {
    modo = 'so texto (sem EMBEDDING_API_KEY)';
  }

  const r = await rpc('fn_wa_buscar', {
    consulta: termo,
    vetor,
    limite,
    desde: dias > 0 ? new Date(Date.now() - dias * 86400000).toISOString() : null,
    so_chat: chat,
    so_comercial: comercial,
  });

  if (!r.ok) {
    console.error('\nBusca falhou. Rodou o sql/007_busca.sql?\n');
    process.exit(1);
  }

  const linhas = r.dados ?? [];

  console.log(`\n"${termo}" — ${linhas.length} resultado(s), ${modo}\n`);

  if (linhas.length === 0) {
    console.log('Nada encontrado.');
    if (!vetor && !soTexto) {
      console.log('A busca semantica esta desligada; com ela, termos parecidos tambem entram.');
    }
    console.log('');
    return;
  }

  for (const l of linhas) {
    const marca = { ambos: '**', texto: ' T', semantica: ' S' }[l.origem] ?? '  ';
    console.log(`${marca} ${l.chat_nome ?? l.chat_id}${l.segmento ? ` [${l.segmento}]` : ''}`);
    console.log(`   ${l.quem} · ${completo(l.quando)} · ha ${decorrido(l.quando)}`);
    console.log(`   ${destacar(l.conteudo, termo)}`);
    console.log('');
  }

  console.log('** achou nas duas buscas   T so no texto   S so na semantica\n');
}

const executadoDireto =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (executadoDireto) {
  main().catch((err) => {
    console.error('\nbuscar falhou:', err?.message ?? err);
    process.exit(1);
  });
}
