// supabase.js — cliente do navegador.
//
// Aqui e a ANON key, nunca a service_role. A anon e publica por design: ela
// vai no bundle e qualquer um le. A protecao esta no 006_pwa.sql — a anon nao
// enxerga tabela nenhuma, e a funcao do painel exige login mais whitelist.

import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configurado = Boolean(url && chave);

export const supabase = configurado
  ? createClient(url, chave, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

/**
 * Busca o painel. Uma chamada, uma funcao — o navegador nao le tabela.
 * @returns {{ok:true, dados:object}|{ok:false, erro:string}}
 */
export async function buscarPainel(horas = 24) {
  if (!supabase) return { ok: false, erro: 'app sem configuracao' };

  try {
    const { data, error } = await supabase.rpc('fn_wa_painel', { horas });
    if (error) throw error;
    return { ok: true, dados: data };
  } catch (err) {
    const msg = String(err?.message ?? err);
    if (msg.includes('nao autorizado')) {
      return { ok: false, erro: 'Este e-mail nao esta autorizado a abrir o painel.' };
    }
    return { ok: false, erro: msg };
  }
}

export async function entrar(email) {
  if (!supabase) return { ok: false, erro: 'app sem configuracao' };
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) throw error;
    return { ok: true };
  } catch (err) {
    return { ok: false, erro: String(err?.message ?? err) };
  }
}

export async function sair() {
  try {
    await supabase?.auth.signOut();
  } catch { /* sessao ja pode ter expirado */ }
}
