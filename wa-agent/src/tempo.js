// tempo.js — o banco guarda UTC, o usuario le America/Manaus.
// Regra 10 do CLAUDE.md. Toda saida para o Jean passa por aqui.

const FUSO = 'America/Manaus';

const fmtDataHora = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO,
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const fmtHora = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const fmtCompleto = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO,
  dateStyle: 'short',
  timeStyle: 'medium',
  hour12: false,
});

/** "06/08, 07h30" */
export function dataHora(valor) {
  const d = paraData(valor);
  if (!d) return '-';
  const partes = fmtDataHora.formatToParts(d);
  const p = Object.fromEntries(partes.map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}, ${p.hour}h${p.minute}`;
}

/** "07h30" */
export function hora(valor) {
  const d = paraData(valor);
  if (!d) return '-';
  return fmtHora.format(d).replace(':', 'h');
}

/** "06/08/2026, 07:30:12" — para log */
export function completo(valor) {
  const d = paraData(valor);
  return d ? fmtCompleto.format(d) : '-';
}

/** "3h20" / "12min" / "2d 4h" — quanto tempo passou */
export function decorrido(valor) {
  const d = paraData(valor);
  if (!d) return '-';

  const min = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
  if (min < 60) return `${min}min`;

  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h${String(min % 60).padStart(2, '0')}`;

  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/** Agora, em Manaus, no formato do cabecalho do digest. */
export function agora() {
  return dataHora(new Date());
}

function paraData(valor) {
  if (valor == null) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}
