// status.js — diagnostico da coleta. Responde "esta capturando?" em 5 segundos.
// Uso: node src/status.js
// Toda hora exibida aqui e America/Manaus (CLAUDE.md regra 10).

import { existsSync, readdirSync } from 'node:fs';

import { PASTA_AUTH } from './config.js';
import { cliente, consultar, contar } from './db.js';
import { agora, completo, decorrido } from './tempo.js';

function titulo(t) {
  console.log(`\n${t}`);
  console.log('-'.repeat(t.length));
}

function linha(rotulo, valor) {
  console.log(`  ${rotulo.padEnd(28)} ${valor}`);
}

async function sessao() {
  titulo('SESSAO');

  if (!existsSync(PASTA_AUTH)) {
    linha('auth_info_baileys', 'AUSENTE — precisa parear via QR');
    console.log('\n  pm2 logs wa-agent --lines 60   # o QR aparece no log');
    return;
  }

  try {
    const arquivos = readdirSync(PASTA_AUTH);
    const temCreds = arquivos.includes('creds.json');
    linha('auth_info_baileys', temCreds ? 'ok' : 'sem creds.json — reparear');
    linha('arquivos de chave', String(arquivos.length));
    if (temCreds) {
      console.log('\n  Backup: tar czf ~/auth-backup-$(date +%F).tgz -C ~/wa-agent auth_info_baileys');
    }
  } catch (err) {
    linha('auth_info_baileys', `erro ao ler: ${err?.message}`);
  }
}

async function coleta() {
  titulo('COLETA');

  const total = await contar('wa_messages');
  if (!total.ok) {
    console.log('  Nao consegui falar com o Supabase. Confira SUPABASE_URL e a service_role key.');
    return false;
  }
  linha('mensagens no banco', String(total.total));

  const fila = await contar('wa_messages', (q) => q.eq('processed', false));
  linha('na fila do worker', String(fila.total));

  const ultima = await consultar('wa_messages', (q) =>
    q.order('timestamp', { ascending: false }).limit(1));

  if (ultima.linhas.length === 0) {
    linha('ultima mensagem', 'nenhuma ainda');
    console.log('\n  Se o listener esta rodando ha mais de 10min sem nada,');
    console.log('  provavel que o pareamento nao concluiu. Veja pm2 logs.');
    return true;
  }

  const m = ultima.linhas[0];
  linha('ultima mensagem', `${completo(m.timestamp)} (ha ${decorrido(m.timestamp)})`);

  const minutos = (Date.now() - new Date(m.timestamp).getTime()) / 60000;
  if (minutos > 120) {
    console.log('\n  ALERTA: mais de 2h sem mensagem nova. Pode ser silencio real,');
    console.log('  pode ser coleta parada. Confira: pm2 logs wa-agent --lines 50');
  }

  // Volume das ultimas 24h — serve para notar queda de captura.
  const ontem = new Date(Date.now() - 86400000).toISOString();
  const dia = await contar('wa_messages', (q) => q.gte('timestamp', ontem));
  linha('ultimas 24h', String(dia.total));

  return true;
}

async function conversas() {
  titulo('CONVERSAS');

  const r = await consultar('vw_wa_inbox', (q) =>
    q.order('msg_count', { ascending: false }));

  if (!r.ok || r.linhas.length === 0) {
    console.log('  Nenhuma conversa registrada ainda.');
    return;
  }

  const porBucket = {};
  let indefinidas = 0;
  for (const c of r.linhas) {
    porBucket[c.bucket] = (porBucket[c.bucket] ?? 0) + 1;
    if (c.classificado_por === 'nenhum') indefinidas += 1;
  }

  linha('total', String(r.linhas.length));
  for (const [b, n] of Object.entries(porBucket).sort((a, z) => z[1] - a[1])) {
    linha(`  ${b}`, String(n));
  }

  if (indefinidas > 0) {
    linha('sem classificacao', `${indefinidas}  -> npm run classificar`);
  }

  console.log('\n  Top 10 por volume:');
  for (const c of r.linhas.slice(0, 10)) {
    const nome = (c.nome ?? c.chat_id).slice(0, 32).padEnd(32);
    const seg = (c.segmento ?? '-').padEnd(10);
    const mute = c.muted ? ' [muted]' : '';
    console.log(`    ${String(c.msg_count).padStart(6)}  ${nome} ${seg}${mute}`);
  }
}

async function sla() {
  titulo('SLA ESTOURADO');

  const r = await consultar('vw_wa_sla_estourado');
  if (!r.ok) {
    console.log('  View indisponivel. Rodou o sql/002_sla_e_regras.sql?');
    return;
  }

  if (r.linhas.length === 0) {
    console.log('  Nada estourado. A bola nao esta com voce em nenhuma conversa comercial.');
    return;
  }

  // A view ja vem ordenada por razao_sla desc: estouro proporcional,
  // nao tempo absoluto. KA parado 5h vem antes de interno parado 20h.
  for (const c of r.linhas) {
    const nome = (c.nome ?? c.chat_id).slice(0, 34).padEnd(34);
    console.log(
      `  ${nome} ${String(c.horas_parado).padStart(6)}h  ` +
      `SLA ${String(c.sla_horas).padStart(2)}h  ${c.razao_sla}x  ${c.last_sender_name ?? ''}`,
    );
  }
}

async function main() {
  console.log(`\nWA-AGENT — status em ${agora()} (Manaus)`);

  try {
    cliente();
  } catch (err) {
    console.error('\nConfiguracao invalida:', err?.message ?? err);
    process.exit(1);
  }

  await sessao();
  const conectou = await coleta();
  if (conectou) {
    await conversas();
    await sla();
  }
  console.log('');
}

main().catch((err) => {
  console.error('\nstatus falhou:', err?.message ?? err);
  process.exit(1);
});
