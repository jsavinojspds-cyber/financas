// digest.js — Fase 5. Painel priorizado, 3x ao dia.
// Uso: node src/digest.js [--horas 24] [--json] [--largura 76] [--bom-dia]
//
// Formato da secao 8 do CLAUDE.md. Sem emoji. Horario America/Manaus.
//
// Ordenacao: por estouro de SLA PROPORCIONAL, nao por tempo absoluto.
// KA parado 5h (SLA 4h, razao 1.25) vem antes de interno parado 26h
// (SLA 24h, razao 1.08). Conversa com keyword critica sobe para o topo:
// ruptura perde venda todo dia que fica parada.
//
// Este arquivo so LE e imprime. Nao envia nada (CLAUDE.md secao 2).

import { pathToFileURL } from 'node:url';

import { config, exigir } from './config.js';
import { gerarBomDia, formatar as formatarBomDia } from './bomdia.js';
import { cliente, consultar } from './db.js';
import { agora, decorrido } from './tempo.js';

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
    bomDia: a.includes('--bom-dia'),
  };
}

// --- montagem ---------------------------------------------------------------

/**
 * Ordem do painel: destaque, depois estouro proporcional de SLA, depois
 * prioridade. Conversa sem SLA definido vai para o fim — nao da para dizer
 * que estourou algo que nao tem prazo.
 *
 * DESTAQUE sao os dois casos em que o relogio de SLA mente:
 *
 *   keyword critica  ruptura, rejeicao fiscal, pedido bloqueado. Perde
 *                    dinheiro por hora parada, nao por fracao de SLA.
 *   chamado direto   marcaram o Jean ou responderam a ele. Explicito, nao
 *                    inferido — vale mais que qualquer heuristica.
 *
 * Sem esse primeiro criterio, uma pergunta direta feita agora num grupo
 * interno (SLA 24h) sai com razao 0,01x e afunda atras de tudo. Foi o que
 * aconteceu no teste de 10/08 com o REGIONAL NORTE. Ver sql/008.
 */
export function ordenar(itens) {
  const destaque = (c) =>
    ((c.keywords_criticas?.length ?? 0) > 0 || c.chamado_direto === true) ? 1 : 0;

  return [...itens].sort((a, b) => {
    const dA = destaque(a);
    const dB = destaque(b);
    if (dA !== dB) return dB - dA;

    const slaA = a.razao_sla ?? -1;
    const slaB = b.razao_sla ?? -1;
    if (slaA !== slaB) return slaB - slaA;

    return (b.prioridade ?? 0) - (a.prioridade ?? 0);
  });
}

/**
 * Divide as conversas nas secoes do painel.
 *
 * AGUARDANDO VOCE  a bola esta com o Jean AGORA. `aguardando_jean` vem da
 *                  analise, mas `last_message_from_me` vem do estado atual:
 *                  se ele ja respondeu depois da analise, sai da lista.
 * MONITORAR        nao exige resposta dele, mas nao pode sumir de vista.
 */
export function separar(linhas) {
  const aguardando = [];
  const monitorar = [];

  for (const c of linhas) {
    if (c.muted || c.bucket !== 'comercial') continue;

    // Se a ultima palavra foi do Jean, a bola esta com o outro lado.
    const bolaComEle = c.last_message_from_me === false;

    if (c.aguardando_jean && bolaComEle) {
      aguardando.push(c);
      continue;
    }

    // O SLA so corre enquanto a bola esta com o Jean. Depois que ele
    // responde o relogio para — senao o painel cobra dele algo que ele
    // ja resolveu. Mesma regra da vw_wa_sla_estourado.
    const slaEstourado = bolaComEle && (c.razao_sla ?? 0) > 1;

    // Nao exige resposta, mas nao pode sumir de vista.
    //
    // `chamado_direto` so vale enquanto a bola esta com ele, igual ao SLA: o
    // chamado se resolve quando o Jean fala. Ja keyword e prioridade valem
    // sempre — uma ruptura nao acaba porque ele respondeu alguma coisa.
    const relevante =
      (c.prioridade ?? 0) >= 4 ||
      (c.keywords_criticas?.length ?? 0) > 0 ||
      (c.chamado_direto === true && bolaComEle) ||
      slaEstourado;

    if (relevante) monitorar.push(c);
  }

  return { aguardando: ordenar(aguardando), monitorar: ordenar(monitorar) };
}

/** Identificacao curta da conversa: "Scarletty (RO)", "Assai Brasil - Duty". */
export function rotulo(c) {
  const nome = c.nome ?? c.chat_id;
  if (c.uf && !nome.toUpperCase().includes(c.uf)) return `${nome} (${c.uf})`;
  return nome;
}

/** Quebra em linhas sem cortar palavra, com recuo nas continuacoes. */
export function quebrar(texto, largura, recuo = 0) {
  if (!texto) return [];
  const espaco = ' '.repeat(recuo);
  const linhas = [];
  let atual = '';

  for (const palavra of String(texto).split(/\s+/).filter(Boolean)) {
    const limite = linhas.length === 0 ? largura : largura - recuo;
    if (atual && (atual + ' ' + palavra).length > limite) {
      linhas.push(atual);
      atual = palavra;
    } else {
      atual = atual ? `${atual} ${palavra}` : palavra;
    }
  }
  if (atual) linhas.push(atual);

  return linhas.map((l, i) => (i === 0 ? l : espaco + l));
}

/**
 * Monta o texto do painel.
 * @returns {string}
 */
export function formatar({ aguardando, monitorar, silenciadas, mencoes, janelaHoras }) {
  const L = [];
  const larg = formatar.largura ?? LARGURA_PADRAO;

  L.push(`PAINEL COMERCIAL — ${agora()}`);
  L.push('');

  // --- AGUARDANDO VOCE ---
  L.push(`AGUARDANDO VOCÊ (${aguardando.length})`);
  if (aguardando.length === 0) {
    L.push('Nada parado com você.');
  } else {
    aguardando.forEach((c, i) => {
      const n = `${i + 1}.`.padEnd(3);
      const partes = [];

      if (c.resumo) partes.push(c.resumo);
      else if (c.assunto) partes.push(c.assunto);
      else partes.push('sem resumo da IA');

      const citou = mencoes.get(c.chat_id);
      if (citou > 0) {
        partes.push(citou === 1 ? 'Chamou você 1x.' : `Chamou você ${citou}x.`);
      }

      const marcas = [];
      if (c.chamado_direto) marcas.push('chamaram você');
      if (c.rascunho) marcas.push('rascunho pronto');
      if (c.keywords_criticas?.length) marcas.push(c.keywords_criticas.join(', '));
      if (marcas.length) partes.push(`[${marcas.join(' | ')}]`);

      const corpo = `${rotulo(c)} — ${partes.join(' ')}`;
      const quebrado = quebrar(corpo, larg - 3, 3);
      L.push(`${n}${quebrado[0]}`);
      for (const extra of quebrado.slice(1)) L.push(extra);

      L.push(`   parado ha ${decorrido(c.last_message_at)}` +
             (c.sla_horas ? `, SLA ${c.sla_horas}h` : '') +
             (c.razao_sla ? ` (${c.razao_sla}x)` : ''));
    });
  }

  // --- MONITORAR ---
  if (monitorar.length > 0) {
    L.push('');
    L.push(`MONITORAR (${monitorar.length})`);
    for (const c of monitorar) {
      const texto = c.pendencia ?? c.assunto ?? c.resumo ?? 'sem detalhe';
      const corpo = `${rotulo(c)}: ${texto} (${decorrido(c.last_message_at)})`;
      const quebrado = quebrar(corpo, larg - 2, 2);
      L.push(`- ${quebrado[0]}`);
      for (const extra of quebrado.slice(1)) L.push(extra);
    }
  }

  // --- SILENCIADO ---
  L.push('');
  if (silenciadas.grupos > 0) {
    L.push(`SILENCIADO (${silenciadas.grupos} grupos, ${silenciadas.mensagens} mensagens, nada relevante)`);
  } else {
    L.push(`SILENCIADO (nada nas ultimas ${janelaHoras}h)`);
  }

  return L.join('\n');
}

/** Os rascunhos vao separados: o painel fica legivel, o texto fica copiavel. */
export function formatarRascunhos(aguardando) {
  const com = aguardando.filter((c) => c.rascunho);
  if (com.length === 0) return '';

  const L = ['', '---', 'RASCUNHOS (copie e envie você mesmo)', ''];
  com.forEach((c, i) => {
    L.push(`${i + 1}. ${rotulo(c)}`);
    for (const linha of String(c.rascunho).split('\n')) L.push(`   ${linha}`);
    L.push('');
  });
  return L.join('\n');
}

// --- main -------------------------------------------------------------------
async function main() {
  exigir(['supabaseUrl', 'supabaseKey']);
  const { horas, json, largura, bomDia } = args();
  formatar.largura = largura;

  const desde = new Date(Date.now() - horas * 3600000).toISOString();

  const painel = await consultar('vw_wa_digest');
  if (!painel.ok) {
    console.error('Nao consegui ler vw_wa_digest. Rodou o sql/004_digest.sql?');
    process.exit(1);
  }

  // Mencoes e silenciadas sao contagens; falha nelas nao derruba o painel.
  const mencoes = new Map();
  try {
    const { data, error } = await cliente().rpc('fn_wa_mencoes', { desde });
    if (error) throw error;
    for (const r of data ?? []) mencoes.set(r.chat_id, Number(r.mencoes));
  } catch (err) {
    console.error(`[aviso] contagem de mencoes indisponivel: ${err?.message ?? err}`);
  }

  let silenciadas = { grupos: 0, mensagens: 0 };
  try {
    const { data, error } = await cliente().rpc('fn_wa_silenciadas', { desde });
    if (error) throw error;
    const r = Array.isArray(data) ? data[0] : data;
    silenciadas = { grupos: Number(r?.grupos ?? 0), mensagens: Number(r?.mensagens ?? 0) };
  } catch (err) {
    console.error(`[aviso] contagem de silenciadas indisponivel: ${err?.message ?? err}`);
  }

  const { aguardando, monitorar } = separar(painel.linhas);

  if (json) {
    console.log(JSON.stringify({
      gerado_em: new Date().toISOString(),
      janela_horas: horas,
      aguardando_voce: aguardando,
      monitorar,
      silenciado: silenciadas,
      bom_dia: bomDia ? await gerarBomDia(config.bomDiaGrupo) : null,
    }, null, 2));
    return;
  }

  console.log(formatar({ aguardando, monitorar, silenciadas, mencoes, janelaHoras: horas }));

  const rascunhos = formatarRascunhos(aguardando);
  if (rascunhos) console.log(rascunhos);

  // So na rodada da manha (o cron das 07h30 passa --bom-dia).
  if (bomDia) {
    const bd = await gerarBomDia(config.bomDiaGrupo);
    console.log(formatarBomDia(bd));
  }
}

const executadoDireto =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (executadoDireto) {
  main().catch((err) => {
    console.error('\ndigest falhou:', err?.message ?? err);
    process.exit(1);
  });
}
