// painel.js — mesmas regras do src/digest.js, para o painel e o texto do
// terminal nunca discordarem. Se mudar a ordem aqui, mude la tambem.

const FUSO = 'America/Manaus';

const fmtDataHora = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO, day: '2-digit', month: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false,
});

/** "06/08, 07h30" */
export function dataHora(valor) {
  const d = paraData(valor);
  if (!d) return '-';
  const p = Object.fromEntries(fmtDataHora.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}, ${p.hour}h${p.minute}`;
}

/** "3h20" / "12min" / "2d 4h" */
export function decorrido(valor) {
  const d = paraData(valor);
  if (!d) return '-';
  const min = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h${String(min % 60).padStart(2, '0')}`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

function paraData(v) {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Keyword critica primeiro, depois estouro de SLA proporcional, depois
 * prioridade. Proporcional e nao absoluto: KA parado 5h (1.25x) vem antes de
 * interno parado 26h (1.08x).
 */
export function ordenar(itens) {
  return [...itens].sort((a, b) => {
    const cA = (a.keywords_criticas?.length ?? 0) > 0 ? 1 : 0;
    const cB = (b.keywords_criticas?.length ?? 0) > 0 ? 1 : 0;
    if (cA !== cB) return cB - cA;

    const sA = num(a.razao_sla, -1);
    const sB = num(b.razao_sla, -1);
    if (sA !== sB) return sB - sA;

    return num(b.prioridade, 0) - num(a.prioridade, 0);
  });
}

/**
 * AGUARDANDO VOCE  a bola esta com o Jean agora. `aguardando_jean` vem da
 *                  analise; `last_message_from_me` vem do estado atual. Se ele
 *                  respondeu depois da analise, a conversa sai sozinha.
 * MONITORAR        nao exige resposta, mas nao pode sumir de vista.
 */
export function separar(linhas) {
  const aguardando = [];
  const monitorar = [];

  for (const c of linhas ?? []) {
    if (c.muted || c.bucket !== 'comercial') continue;

    const bolaComEle = c.last_message_from_me === false;

    if (c.aguardando_jean && bolaComEle) {
      aguardando.push(c);
      continue;
    }

    // O SLA so corre enquanto a bola esta com ele.
    const slaEstourado = bolaComEle && num(c.razao_sla, 0) > 1;
    const relevante =
      num(c.prioridade, 0) >= 4 ||
      (c.keywords_criticas?.length ?? 0) > 0 ||
      slaEstourado;

    if (relevante) monitorar.push(c);
  }

  return { aguardando: ordenar(aguardando), monitorar: ordenar(monitorar) };
}

/** "Scarletty (RO)" */
export function rotulo(c) {
  const nome = c.nome ?? c.chat_id ?? 'conversa';
  if (c.uf && !nome.toUpperCase().includes(c.uf)) return `${nome} (${c.uf})`;
  return nome;
}

/** Cor do selo de SLA pelo tamanho do estouro. */
export function nivelSla(razao) {
  const r = num(razao, 0);
  if (r >= 3) return 'critico';
  if (r >= 1.5) return 'alto';
  if (r > 1) return 'estourado';
  return 'ok';
}

// O Postgres devolve numeric como string no JSON. Converter sempre.
function num(v, padrao) {
  const n = Number(v);
  return Number.isFinite(n) ? n : padrao;
}
