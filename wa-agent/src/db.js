// db.js — acesso ao Supabase. Toda funcao daqui devolve um resultado,
// nunca lanca. O listener nao pode morrer por causa do banco (CLAUDE.md 5).

import { createClient } from '@supabase/supabase-js';
import { config, exigir, avisarSeAnonKey } from './config.js';

let _cliente = null;

export function cliente() {
  if (_cliente) return _cliente;

  exigir(['supabaseUrl', 'supabaseKey']);
  avisarSeAnonKey();

  _cliente = createClient(config.supabaseUrl, config.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-application-name': 'wa-agent' } },
  });
  return _cliente;
}

/**
 * Cria/atualiza conversas. Manda apenas id, nome e is_group para nao
 * pisar em bucket/segmento/responsavel ja definidos por regra ou a mao.
 * @returns {{ok: boolean, erro?: string}}
 */
export async function salvarChats(chats) {
  if (!Array.isArray(chats) || chats.length === 0) return { ok: true };

  const db = cliente();

  // Nome nulo nao pode sobrescrever um nome bom que ja esta no banco.
  const comNome = chats.filter((c) => c.nome);
  const semNome = chats.filter((c) => !c.nome);

  try {
    if (comNome.length) {
      const { error } = await db
        .from('wa_chats')
        .upsert(
          comNome.map((c) => ({ id: c.id, nome: c.nome, is_group: c.is_group })),
          { onConflict: 'id' },
        );
      if (error) throw error;
    }

    if (semNome.length) {
      const { error } = await db
        .from('wa_chats')
        .upsert(
          semNome.map((c) => ({ id: c.id, is_group: c.is_group })),
          { onConflict: 'id', ignoreDuplicates: true },
        );
      if (error) throw error;
    }

    return { ok: true };
  } catch (err) {
    console.error('[db] salvarChats falhou:', err?.message ?? err);
    return { ok: false, erro: String(err?.message ?? err) };
  }
}

/**
 * Grava mensagens. ignoreDuplicates evita erro quando o WhatsApp reenvia o
 * mesmo pacote apos reconexao — acontece o tempo todo.
 * @returns {{ok: boolean, gravadas: number, erro?: string}}
 */
export async function salvarMensagens(linhas) {
  if (!Array.isArray(linhas) || linhas.length === 0) {
    return { ok: true, gravadas: 0 };
  }

  try {
    const { data, error } = await cliente()
      .from('wa_messages')
      .upsert(linhas, { onConflict: 'chat_id,msg_id', ignoreDuplicates: true })
      .select('id');

    if (error) throw error;
    return { ok: true, gravadas: data?.length ?? 0 };
  } catch (err) {
    console.error('[db] salvarMensagens falhou:', err?.message ?? err);
    return { ok: false, gravadas: 0, erro: String(err?.message ?? err) };
  }
}

/** Roda fn_wa_apply_rules(). Barato, e evita gastar token de IA depois. */
export async function aplicarRegras() {
  try {
    const { data, error } = await cliente().rpc('fn_wa_apply_rules');
    if (error) throw error;
    return { ok: true, aplicadas: data ?? [] };
  } catch (err) {
    console.error('[db] aplicarRegras falhou:', err?.message ?? err);
    return { ok: false, aplicadas: [], erro: String(err?.message ?? err) };
  }
}

/**
 * Grava a analise de uma conversa (saida do worker da Fase 3).
 * @returns {{ok: boolean, erro?: string}}
 */
export async function salvarAnalise(linha) {
  try {
    const { error } = await cliente().from('wa_threads_analysis').insert(linha);
    if (error) throw error;
    return { ok: true };
  } catch (err) {
    console.error('[db] salvarAnalise falhou:', err?.message ?? err);
    return { ok: false, erro: String(err?.message ?? err) };
  }
}

/**
 * Tira mensagens da fila do worker. So marca DEPOIS que a analise gravou,
 * senao uma falha no meio faz a mensagem sumir sem nunca ter sido lida.
 * @param {number[]} ids
 */
export async function marcarProcessadas(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return { ok: true, marcadas: 0 };

  const FATIA = 500; // limite pratico do filtro `in` do PostgREST
  let marcadas = 0;

  try {
    for (let i = 0; i < ids.length; i += FATIA) {
      const fatia = ids.slice(i, i + FATIA);
      const { error } = await cliente()
        .from('wa_messages')
        .update({ processed: true })
        .in('id', fatia);
      if (error) throw error;
      marcadas += fatia.length;
    }
    return { ok: true, marcadas };
  } catch (err) {
    console.error('[db] marcarProcessadas falhou:', err?.message ?? err);
    return { ok: false, marcadas, erro: String(err?.message ?? err) };
  }
}

/** Chamada generica de funcao no banco. Nunca lanca. */
export async function rpc(nome, params = {}) {
  try {
    const { data, error } = await cliente().rpc(nome, params);
    if (error) throw error;
    return { ok: true, dados: data };
  } catch (err) {
    console.error(`[db] rpc ${nome} falhou:`, err?.message ?? err);
    return { ok: false, dados: null, erro: String(err?.message ?? err) };
  }
}

/** Leitura generica com tratamento de erro uniforme. */
export async function consultar(tabela, montar = (q) => q) {
  try {
    const { data, error } = await montar(cliente().from(tabela).select('*'));
    if (error) throw error;
    return { ok: true, linhas: data ?? [] };
  } catch (err) {
    console.error(`[db] consulta em ${tabela} falhou:`, err?.message ?? err);
    return { ok: false, linhas: [], erro: String(err?.message ?? err) };
  }
}

export async function contar(tabela, montar = (q) => q) {
  try {
    const { count, error } = await montar(
      cliente().from(tabela).select('*', { count: 'exact', head: true }),
    );
    if (error) throw error;
    return { ok: true, total: count ?? 0 };
  } catch (err) {
    console.error(`[db] contagem em ${tabela} falhou:`, err?.message ?? err);
    return { ok: false, total: 0, erro: String(err?.message ?? err) };
  }
}
