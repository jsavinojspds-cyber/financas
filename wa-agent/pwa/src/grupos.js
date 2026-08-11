// grupos.js — regras da aba "Grupos" do PWA.
//
// Espelha src/resumo.js do terminal, do mesmo jeito que painel.js espelha
// digest.js. Se mudar a separacao ou a ordem aqui, mude la tambem.
//
// A pergunta desta aba e diferente da aba Fila: nao e "o que esta parado
// comigo", e "o que rolou hoje, grupo por grupo".

const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

export const num = n;

/** "1 conversa" / "4 conversas". Lido todo dia — plural errado incomoda. */
export function plural(q, um, muitos) {
  return `${q} ${q === 1 ? um : muitos}`;
}

/** "13 mensagens de 2 pessoas" */
export function contagem(g) {
  const partes = [plural(n(g.mensagens), 'mensagem', 'mensagens')];
  if (n(g.pessoas) > 0) {
    partes.push(n(g.pessoas) === 1 ? 'de 1 pessoa' : `de ${n(g.pessoas)} pessoas`);
  }
  return partes.join(' ');
}

export function rotulo(g) {
  const nome = g.nome ?? g.chat_id ?? 'conversa';
  if (g.uf && !nome.toUpperCase().includes(g.uf)) return `${nome} (${g.uf})`;
  return nome;
}

/** Conversa sem nome e quase sempre canal/newsletter. Nao vale um cartao. */
export function anonima(g) {
  return !g.nome;
}

/**
 * Separa por bucket e ordena. Quem chamou o Jean primeiro, depois quem
 * falou mais — mesma regra do resumo.js.
 */
export function separarGrupos(grupos) {
  const secoes = { trabalho: [], pessoal: [], indefinido: [], ruido: [] };

  for (const g of grupos ?? []) {
    if (g.bucket === 'comercial') secoes.trabalho.push(g);
    else if (g.bucket === 'pessoal') secoes.pessoal.push(g);
    else if (g.bucket === 'ruido') secoes.ruido.push(g);
    else secoes.indefinido.push(g);
  }

  const ordem = (a, b) =>
    (n(b.chamados) > 0) - (n(a.chamados) > 0) ||
    (b.aguardando_jean === true) - (a.aguardando_jean === true) ||
    n(b.mensagens) - n(a.mensagens);

  secoes.trabalho.sort(ordem);
  secoes.pessoal.sort(ordem);
  secoes.indefinido.sort(ordem);

  secoes.ruidoTotais = {
    conversas: secoes.ruido.length,
    mensagens: secoes.ruido.reduce((s, g) => s + n(g.mensagens), 0),
  };

  return secoes;
}

export function totalMensagens(lista) {
  return (lista ?? []).reduce((s, g) => s + n(g.mensagens), 0);
}

/**
 * Etiquetas do cartao, em ordem de importancia. Chamado direto primeiro:
 * e o unico sinal explicito de que a bola esta com ele.
 */
export function etiquetas(g) {
  const t = [];
  if (g.chamado_direto) t.push({ texto: 'chamaram você', tom: 'chamado' });
  else if (n(g.chamados) > 0) {
    t.push({ texto: `citado ${n(g.chamados)}x`, tom: 'chamado' });
  }
  if (g.aguardando_jean) t.push({ texto: 'aguardando você', tom: 'aguardando' });
  for (const k of g.keywords_criticas ?? []) t.push({ texto: k, tom: 'critica' });
  return t;
}

/**
 * O que o sistema NAO leu. Aparece no cartao de proposito: resumo que
 * esconde o proprio buraco vale menos que resumo que o declara.
 */
export function naoLido(g) {
  const p = [];
  if (n(g.audios) > 0) {
    p.push(n(g.audios) === 1 ? '1 áudio não transcrito' : `${n(g.audios)} áudios não transcritos`);
  }
  if (g.bucket === 'comercial' && !g.resumo && !g.assunto) {
    p.push('ainda não analisado');
  }
  return p;
}

const fmtHora = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Manaus', hour: '2-digit', minute: '2-digit', hour12: false,
});

/** "21h11 às 06h58" */
export function janela(g) {
  const a = paraHora(g.primeira);
  const b = paraHora(g.ultima);
  if (!a || !b) return null;
  return a === b ? a : `${a} às ${b}`;
}

function paraHora(v) {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  const p = Object.fromEntries(fmtHora.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.hour}h${p.minute}`;
}
