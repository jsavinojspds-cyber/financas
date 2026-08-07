// classificar.js — classificacao assistida por IA, interativa.
// Uso: npm run classificar
//
// Ordem obrigatoria (CLAUDE.md regra 7):
//   1. fn_wa_apply_rules()  -> contato conhecido nao gasta token
//   2. IA apenas no que sobrou
//   3. confirmacao do Jean   -> vira classificado_por='manual'
//
// A IA sugere. Quem decide e o Jean.

import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

import { config, exigir } from './config.js';
import { cliente, consultar, aplicarRegras } from './db.js';
import { decorrido } from './tempo.js';

const BUCKETS = ['pessoal', 'comercial', 'ruido', 'indefinido'];
const SEGMENTOS = ['ka', 'rca', 'interno', 'trade', 'lideranca', 'rh', 'franquia', 'pessoal'];
const LOTE = 8;

const SYSTEM = `Voce classifica conversas de WhatsApp de um Head de Vendas da Duty Cosmeticos.
Ele atua no Norte (AM, RR, PA, AP, RO, AC) e Centro-Oeste, e gerencia RCAs
(representantes comerciais autonomos), redes KA e distribuidores. Tambem e socio
da Savino Locacoes (locadora de veiculos em Manaus, franqueada Locagora).

bucket:
- comercial: qualquer coisa de trabalho (Duty ou Savino Locacoes)
- pessoal: familia, amigos, assunto particular
- ruido: comunicado institucional, corrente, grupo sem acionabilidade
- indefinido: nao da para saber pela amostra

segmento (so quando bucket=comercial):
- ka: rede/key account (Grupo Mateus, Assai/Sendas, Lider, HDL, Rio Azul)
- rca: representante comercial autonomo
- interno: time regional da Duty, aprovacoes internas
- trade: merchandising, execucao de ponto de venda
- lideranca: diretoria, gerencia nacional
- rh: comunicacao institucional
- franquia: Savino Locacoes / Locagora

Vocabulario do negocio: sell-in, sell-out, positivacao, ruptura, verba/trade, JBP,
RTM, canal tradicional/farma/alimentar, DDE/DDR, fundo cooperado, acordo comercial,
Salesforce, Scanntech, Nielsen, Power BI.

Responda SOMENTE com JSON puro, sem cercas de codigo, sem texto antes ou depois.
Formato: {"resultados":[{"chat_id":"...","bucket":"...","segmento":null,"responsavel":null,"uf":null,"confianca":0.0,"motivo":"..."}]}
segmento, responsavel e uf sao null quando nao se aplicam. motivo: no maximo 12 palavras.`;

/** Chama a API do Claude e devolve o texto. Nunca lanca. */
async function chamarClaude(prompt) {
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': config.anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.anthropicModel,
        max_tokens: 2000,
        system: SYSTEM,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!resp.ok) {
      const corpo = await resp.text().catch(() => '');
      return { ok: false, erro: `HTTP ${resp.status} ${corpo.slice(0, 300)}` };
    }

    const dados = await resp.json();
    const texto = dados?.content?.map((c) => c.text ?? '').join('') ?? '';
    return { ok: true, texto };
  } catch (err) {
    return { ok: false, erro: String(err?.message ?? err) };
  }
}

/**
 * Limpa cercas ```json antes do parse e nunca derruba o lote (CLAUDE.md regra 6).
 */
function parseJson(texto) {
  if (!texto) return null;

  let limpo = texto.trim();
  limpo = limpo.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/,'').trim();

  try {
    return JSON.parse(limpo);
  } catch {
    // Ultimo recurso: pega do primeiro { ate o ultimo }.
    const i = limpo.indexOf('{');
    const f = limpo.lastIndexOf('}');
    if (i === -1 || f <= i) return null;
    try {
      return JSON.parse(limpo.slice(i, f + 1));
    } catch {
      return null;
    }
  }
}

/** Amostra de mensagens de uma conversa, para a IA ter contexto. */
async function amostra(chatId, limite = 12) {
  const r = await consultar('wa_messages', (q) =>
    q.eq('chat_id', chatId).order('timestamp', { ascending: false }).limit(limite));

  return r.linhas
    .reverse()
    .map((m) => {
      const quem = m.from_me ? 'Jean' : (m.sender_name ?? 'contato');
      const texto = m.conteudo ?? `[${m.tipo}]`;
      return `${quem}: ${texto.slice(0, 200)}`;
    })
    .join('\n');
}

async function montarPrompt(chats) {
  const blocos = [];
  for (const c of chats) {
    const msgs = await amostra(c.chat_id);
    blocos.push(
      `--- chat_id: ${c.chat_id}\n` +
      `nome: ${c.nome ?? '(sem nome)'}\n` +
      `tipo: ${c.is_group ? 'grupo' : 'conversa 1:1'}\n` +
      `mensagens: ${c.msg_count}\n` +
      `amostra:\n${msgs || '(sem texto, so midia)'}`,
    );
  }
  return `Classifique estas ${chats.length} conversas:\n\n${blocos.join('\n\n')}`;
}

function valida(s) {
  return {
    bucket: BUCKETS.includes(s?.bucket) ? s.bucket : 'indefinido',
    segmento: SEGMENTOS.includes(s?.segmento) ? s.segmento : null,
    responsavel: typeof s?.responsavel === 'string' && s.responsavel.trim() ? s.responsavel.trim() : null,
    uf: typeof s?.uf === 'string' && /^[A-Z]{2}$/.test(s.uf.trim().toUpperCase()) ? s.uf.trim().toUpperCase() : null,
    confianca: Number.isFinite(s?.confianca) ? s.confianca : 0,
    motivo: typeof s?.motivo === 'string' ? s.motivo : '',
  };
}

async function gravar(chatId, dados, origem) {
  try {
    const { error } = await cliente()
      .from('wa_chats')
      .update({
        bucket: dados.bucket,
        segmento: dados.segmento,
        responsavel: dados.responsavel,
        uf: dados.uf,
        classificado_por: origem,
        classificado_em: new Date().toISOString(),
      })
      .eq('id', chatId);

    if (error) throw error;
    return true;
  } catch (err) {
    console.error(`  erro ao gravar: ${err?.message ?? err}`);
    return false;
  }
}

async function main() {
  exigir(['supabaseUrl', 'supabaseKey', 'anthropicKey']);

  console.log('\nWA-AGENT — classificacao assistida\n');

  // Passo 1: regras primeiro. Nao gasta token.
  console.log('Aplicando wa_rules...');
  const regras = await aplicarRegras();
  if (regras.ok) {
    console.log(`  ${regras.aplicadas.length} conversa(s) classificada(s) por regra.`);
  } else {
    console.log('  Falhou. Seguindo assim mesmo — a IA cobre o resto.');
  }

  // Passo 2: o que sobrou.
  const pendentes = await consultar('vw_wa_inbox', (q) =>
    q.eq('classificado_por', 'nenhum').order('msg_count', { ascending: false }));

  if (!pendentes.ok) {
    console.error('Nao consegui ler vw_wa_inbox. Rodou os SQLs 001 a 003?');
    process.exit(1);
  }

  if (pendentes.linhas.length === 0) {
    console.log('\nNada pendente. Tudo classificado.\n');
    return;
  }

  console.log(`\n${pendentes.linhas.length} conversa(s) sem classificacao.`);
  console.log(`Modelo: ${config.anthropicModel}\n`);

  const rl = createInterface({ input: stdin, output: stdout });
  let gravadas = 0;
  let saiu = false;

  try {
    for (let i = 0; i < pendentes.linhas.length && !saiu; i += LOTE) {
      const lote = pendentes.linhas.slice(i, i + LOTE);
      console.log(`\n--- lote ${Math.floor(i / LOTE) + 1}, ${lote.length} conversa(s) ---`);

      const resposta = await chamarClaude(await montarPrompt(lote));
      if (!resposta.ok) {
        console.error(`  API falhou: ${resposta.erro}`);
        console.error('  Pulando este lote.');
        continue;
      }

      const json = parseJson(resposta.texto);
      if (!json?.resultados) {
        // Regra 6: falha de parse nao derruba o lote nem o processo.
        console.error('  Resposta nao veio em JSON valido. Pulando este lote.');
        continue;
      }

      const porId = new Map(json.resultados.map((r) => [r.chat_id, r]));

      for (const chat of lote) {
        if (saiu) break;

        const sugestao = valida(porId.get(chat.chat_id));

        console.log(`\n  ${chat.nome ?? chat.chat_id}`);
        console.log(`    ${chat.msg_count} msgs, ultima ha ${decorrido(chat.last_message_at)}`);
        console.log(`    IA: bucket=${sugestao.bucket} segmento=${sugestao.segmento ?? '-'} ` +
                    `resp=${sugestao.responsavel ?? '-'} uf=${sugestao.uf ?? '-'} ` +
                    `(${sugestao.confianca})`);
        if (sugestao.motivo) console.log(`    motivo: ${sugestao.motivo}`);

        const acao = (await rl.question('    [Enter]=aceita  e=edita  p=pula  q=sai: ')).trim().toLowerCase();

        if (acao === 'q') { saiu = true; break; }
        if (acao === 'p') continue;

        let dados = sugestao;
        let origem = 'ia';

        if (acao === 'e') {
          const b = (await rl.question(`      bucket (${BUCKETS.join('/')}) [${sugestao.bucket}]: `)).trim();
          const s = (await rl.question(`      segmento (${SEGMENTOS.join('/')}) [${sugestao.segmento ?? '-'}]: `)).trim();
          const r = (await rl.question(`      responsavel [${sugestao.responsavel ?? '-'}]: `)).trim();
          const u = (await rl.question(`      uf [${sugestao.uf ?? '-'}]: `)).trim();

          dados = valida({
            bucket: b || sugestao.bucket,
            segmento: s || sugestao.segmento,
            responsavel: r || sugestao.responsavel,
            uf: u || sugestao.uf,
            confianca: 1,
          });
          origem = 'manual';
        }

        if (await gravar(chat.chat_id, dados, origem)) {
          gravadas += 1;
          console.log(`    gravado (${origem})`);
        }
      }
    }
  } finally {
    rl.close();
  }

  console.log(`\n${gravadas} conversa(s) classificada(s).`);
  console.log('Confira com: node src/status.js\n');
}

main().catch((err) => {
  console.error('\nclassificar falhou:', err?.message ?? err);
  process.exit(1);
});
