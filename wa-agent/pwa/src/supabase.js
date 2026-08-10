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

/**
 * Pede o codigo de acesso por e-mail.
 *
 * O e-mail traz um codigo de 6 digitos E um link. O codigo e o que importa
 * aqui: instalado na tela inicial, o iOS da ao app um armazenamento SEPARADO
 * do Safari, e o link do e-mail sempre abre no Safari. Sem o codigo, seria
 * impossivel completar o login de dentro do app.
 */
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
    return { ok: false, erro: traduzir(err) };
  }
}

/** Confere o codigo de 6 digitos digitado no proprio app. */
export async function verificarCodigo(email, codigo) {
  if (!supabase) return { ok: false, erro: 'app sem configuracao' };
  try {
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: String(codigo).replace(/\D/g, ''),
      type: 'email',
    });
    if (error) throw error;
    return { ok: true };
  } catch (err) {
    return { ok: false, erro: traduzir(err) };
  }
}

function traduzir(err) {
  const m = String(err?.message ?? err);
  if (/expired/i.test(m)) return 'Código expirado. Peça um novo.';
  if (/invalid/i.test(m)) return 'Código incorreto. Confira os 6 dígitos.';
  if (/rate|limit/i.test(m)) return 'Muitas tentativas. Espere um minuto.';
  return m;
}

export async function sair() {
  try {
    await supabase?.auth.signOut();
  } catch { /* sessao ja pode ter expirado */ }
}
