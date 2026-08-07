// testar.js — teste de fumaca da camada de banco. NAO toca no WhatsApp.
// Uso: npm run testar
//
// Serve para responder "esta tudo certo do meu lado?" ANTES de parear o
// celular. Se isto passa, o listener vai conseguir gravar; o que sobra de
// risco e so o pareamento em si.
//
// Escreve dados de teste com prefixo `_teste_` e apaga tudo no fim, inclusive
// se der erro no meio.

import { exigir, config } from './config.js';
import { cliente, salvarChats, salvarMensagens, aplicarRegras, consultar } from './db.js';
import { agora } from './tempo.js';

const PREFIXO = '_teste_';
let passou = 0;
let falhou = 0;

function ok(msg, detalhe = '') {
  passou += 1;
  console.log(`  ok    ${msg}${detalhe ? `  ${detalhe}` : ''}`);
}

function erro(msg, detalhe = '') {
  falhou += 1;
  console.log(`  FALHA ${msg}${detalhe ? `  ${detalhe}` : ''}`);
}

function secao(t) {
  console.log(`\n${t}`);
}

async function limpar() {
  try {
    await cliente().from('wa_chats').delete().like('id', `${PREFIXO}%`);
  } catch (err) {
    console.error(`\n  AVISO: nao consegui limpar os dados de teste: ${err?.message}`);
    console.error(`  Rode a mao: delete from wa_chats where id like '${PREFIXO}%';`);
  }
}

async function main() {
  console.log(`\nWA-AGENT — teste de conexao em ${agora()} (Manaus)`);

  exigir(['supabaseUrl', 'supabaseKey']);
  console.log(`Projeto: ${config.supabaseUrl}\n`);

  // --- 1. leitura -----------------------------------------------------------
  secao('1. Leitura — o schema esta aplicado?');

  const esperado = {
    wa_rules: 25,
    wa_keywords_criticas: 28,
    wa_sla_policy: 8,
  };

  for (const [tabela, minimo] of Object.entries(esperado)) {
    const r = await consultar(tabela);
    if (!r.ok) {
      erro(tabela, r.erro?.slice(0, 80));
      continue;
    }
    if (r.linhas.length >= minimo) {
      ok(tabela, `${r.linhas.length} linha(s)`);
    } else {
      erro(tabela, `${r.linhas.length} linha(s), esperado >= ${minimo}. Rodou os SQLs 001 a 005?`);
    }
  }

  for (const view of ['vw_wa_inbox', 'vw_wa_sla_estourado', 'vw_wa_digest']) {
    const r = await consultar(view, (q) => q.limit(1));
    r.ok ? ok(view) : erro(view, 'view ausente. Rodou o 002 e o 004?');
  }

  if (falhou > 0) {
    console.log('\nO schema nao esta completo. Corrija antes de seguir.\n');
    process.exit(1);
  }

  // --- 2. escrita -----------------------------------------------------------
  // E o que o listener faz. Se falhar aqui, quase sempre e a anon key no
  // lugar da service_role: o RLS esta ligado sem policy, entao a anon
  // simplesmente nao escreve nada e o erro aparece como "coleta vazia".
  secao('2. Escrita — o listener vai conseguir gravar?');

  await limpar();

  const chatId = `${PREFIXO}assai@g.us`;
  const r1 = await salvarChats([{ id: chatId, nome: 'Assaí Brasil - Duty', is_group: true }]);
  r1.ok ? ok('insert em wa_chats') : erro('insert em wa_chats', r1.erro?.slice(0, 120));

  if (!r1.ok) {
    console.log('\n  Causa provavel: a chave no .env e a anon, nao a service_role.');
    console.log('  Painel > Settings > API > service_role (a secreta).\n');
    await limpar();
    process.exit(1);
  }

  const agoraIso = new Date().toISOString();
  const r2 = await salvarMensagens([{
    chat_id: chatId,
    msg_id: `${PREFIXO}m1`,
    from_me: false,
    sender_name: 'Carlos',
    tipo: 'texto',
    conteudo: 'cade a tabela de julho? tem ruptura no PDV',
    tem_midia: false,
    mencionou_me: true,
    timestamp: new Date(Date.now() - 10 * 3600000).toISOString(),
    raw: { teste: true },
    processed: false,
  }]);
  r2.ok ? ok('insert em wa_messages', `${r2.gravadas} gravada(s)`) : erro('insert em wa_messages', r2.erro?.slice(0, 120));

  // Duplicata tem que ser ignorada, nao virar erro: o WhatsApp reenvia
  // o mesmo pacote depois de reconectar, o tempo todo.
  const r3 = await salvarMensagens([{
    chat_id: chatId,
    msg_id: `${PREFIXO}m1`,
    from_me: false,
    tipo: 'texto',
    conteudo: 'duplicata',
    tem_midia: false,
    mencionou_me: false,
    timestamp: agoraIso,
    raw: null,
    processed: false,
  }]);
  if (r3.ok && r3.gravadas === 0) ok('duplicata ignorada (dedupe)');
  else erro('duplicata deveria ser ignorada', `gravadas=${r3.gravadas}`);

  // --- 3. triggers e regras -------------------------------------------------
  secao('3. Automacao — triggers e regras funcionam?');

  const rr = await aplicarRegras();
  rr.ok ? ok('fn_wa_apply_rules executou') : erro('fn_wa_apply_rules', rr.erro?.slice(0, 120));

  const chat = await consultar('vw_wa_inbox', (q) => q.eq('chat_id', chatId));
  const c = chat.linhas[0];

  if (!c) {
    erro('conversa sumiu apos as regras');
  } else {
    c.segmento === 'ka'
      ? ok('regra classificou', `segmento=${c.segmento}`)
      : erro('regra nao classificou', `segmento=${c.segmento ?? 'null'}, esperado ka`);

    c.sla_horas === 4
      ? ok('trigger de SLA preencheu', `${c.sla_horas}h`)
      : erro('trigger de SLA', `sla=${c.sla_horas ?? 'null'}, esperado 4`);

    c.msg_count === 1
      ? ok('trigger de estado contou', `msg_count=${c.msg_count}`)
      : erro('trigger de estado', `msg_count=${c.msg_count}, esperado 1`);

    c.last_message_from_me === false
      ? ok('estado: a bola esta com voce')
      : erro('last_message_from_me', String(c.last_message_from_me));

    c.na_fila === 1
      ? ok('fila do worker', `${c.na_fila} mensagem`)
      : erro('fila do worker', `na_fila=${c.na_fila}, esperado 1`);
  }

  // --- 4. digest ------------------------------------------------------------
  secao('4. Digest — o SLA estourado aparece?');

  const sla = await consultar('vw_wa_sla_estourado', (q) => q.eq('chat_id', chatId));
  if (sla.linhas.length === 1) {
    const s = sla.linhas[0];
    ok('conversa entrou no digest', `${s.horas_parado}h parado, ${s.razao_sla}x o SLA`);
  } else {
    erro('conversa nao entrou no digest', 'esperado 1 linha (10h parado, SLA 4h)');
  }

  // --- 5. limpeza -----------------------------------------------------------
  secao('5. Limpeza');
  await limpar();
  const sobrou = await consultar('wa_chats', (q) => q.like('id', `${PREFIXO}%`));
  sobrou.linhas.length === 0
    ? ok('dados de teste removidos')
    : erro('sobrou dado de teste', `${sobrou.linhas.length} linha(s)`);

  // --- resultado ------------------------------------------------------------
  console.log(`\n${'-'.repeat(60)}`);
  if (falhou === 0) {
    console.log(`${passou} verificacoes, nenhuma falha.`);
    console.log('\nA camada de banco esta pronta. Proximo passo: parear o WhatsApp.');
    console.log('  npm start          # o QR aparece no terminal');
    console.log('\nNo iPhone: WhatsApp > Configuracoes > Aparelhos conectados >');
    console.log('Conectar aparelho. Depois disso, npm run status mostra a coleta.\n');
  } else {
    console.log(`${passou} ok, ${falhou} FALHA(S). Veja acima.\n`);
    process.exit(1);
  }
}

main().catch(async (err) => {
  console.error('\nteste falhou:', err?.message ?? err);
  await limpar();
  process.exit(1);
});
