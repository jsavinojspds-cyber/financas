import type { SupabaseClient } from '@supabase/supabase-js'
import { idbGet, idbSet, lsGet, lsSet } from '@/storage/idb'
import { K_SYNC } from '@/storage/migrar'
import { normalizarEstado } from '@/storage/migrar'
import { novoId } from '@/lib/id'
import type { EstadoApp } from '@/types'

export const TABELA = 'estado_financas'

export interface ConfigSync {
  url: string
  anonKey: string
  /** identifica o aparelho na coluna `dispositivo`, só para diagnóstico */
  dispositivo: string
  /** epoch ms do último sync bem-sucedido */
  ultimoSync: number | null
}

export type StatusSync =
  | { t: 'desligado' }
  | { t: 'sem-login' }
  | { t: 'ok'; quando: number; email: string }
  | { t: 'sincronizando' }
  | { t: 'offline' }
  | { t: 'erro'; msg: string }

// ── configuração ────────────────────────────────────────────────────
// Fica no storage do aparelho, não no build: o repositório do GitHub Pages
// é público e uma chave embutida no bundle vazaria junto.

export async function lerConfigSync(): Promise<ConfigSync | null> {
  const bruto = (await idbGet<string>(K_SYNC)) ?? lsGet(K_SYNC)
  if (!bruto) return null
  try {
    const c = JSON.parse(bruto) as Partial<ConfigSync>
    if (!c.url || !c.anonKey) return null
    return {
      url: c.url,
      anonKey: c.anonKey,
      dispositivo: c.dispositivo || novoId().slice(0, 8),
      ultimoSync: c.ultimoSync ?? null,
    }
  } catch {
    return null
  }
}

export async function gravarConfigSync(c: ConfigSync | null): Promise<void> {
  const json = c ? JSON.stringify(c) : ''
  await idbSet(K_SYNC, json)
  lsSet(K_SYNC, json)
}

// ── cliente ─────────────────────────────────────────────────────────

let cliente: SupabaseClient | null = null
let clienteUrl = ''

/** Carrega o supabase-js sob demanda: sem sync configurado, o chunk de
 *  ~100 KB nunca é baixado e o app abre mais rápido. */
export async function obterCliente(c: ConfigSync): Promise<SupabaseClient> {
  if (cliente && clienteUrl === c.url) return cliente
  const { createClient } = await import('@supabase/supabase-js')
  cliente = createClient(c.url, c.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // o PWA não recebe callback de URL; o login é por código de e-mail
      detectSessionInUrl: false,
    },
  })
  clienteUrl = c.url
  return cliente
}

export async function emailLogado(c: ConfigSync): Promise<string | null> {
  try {
    const sb = await obterCliente(c)
    const { data } = await sb.auth.getSession()
    return data.session?.user.email ?? null
  } catch {
    return null
  }
}

/** Envia o código de 6 dígitos para o e-mail (sem senha). */
export async function enviarCodigo(c: ConfigSync, email: string): Promise<string | null> {
  try {
    const sb = await obterCliente(c)
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    })
    return error ? error.message : null
  } catch (e) {
    return e instanceof Error ? e.message : 'Falha ao enviar o código'
  }
}

export async function confirmarCodigo(
  c: ConfigSync,
  email: string,
  codigo: string,
): Promise<string | null> {
  try {
    const sb = await obterCliente(c)
    const { error } = await sb.auth.verifyOtp({ email, token: codigo.trim(), type: 'email' })
    return error ? error.message : null
  } catch (e) {
    return e instanceof Error ? e.message : 'Código inválido'
  }
}

export async function sair(c: ConfigSync): Promise<void> {
  try {
    const sb = await obterCliente(c)
    await sb.auth.signOut()
  } catch {
    /* sem sessão, nada a fazer */
  }
}

// ── sincronização ───────────────────────────────────────────────────

export interface ResultadoSync {
  status: StatusSync
  /** estado remoto que deve substituir o local, quando o remoto é mais novo */
  estadoRemoto: EstadoApp | null
}

/**
 * Sincroniza o documento inteiro com last-write-wins por `updatedAt`.
 *
 * Limitação assumida: a granularidade é o estado completo, não o lançamento.
 * Se dois aparelhos editarem offline ao mesmo tempo, o que sincronizar por
 * último sobrescreve o outro. Para um app pessoal de um usuário só isso é
 * previsível e muito mais simples de auditar do que merge por registro —
 * e o backup JSON continua sendo a rede de segurança.
 */
export async function sincronizar(
  c: ConfigSync,
  local: EstadoApp,
): Promise<ResultadoSync> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { status: { t: 'offline' }, estadoRemoto: null }
  }

  try {
    const sb = await obterCliente(c)
    const { data: sessao } = await sb.auth.getSession()
    const usuario = sessao.session?.user
    if (!usuario) return { status: { t: 'sem-login' }, estadoRemoto: null }

    const { data, error } = await sb
      .from(TABELA)
      .select('estado, atualizado_em')
      .eq('user_id', usuario.id)
      .maybeSingle()

    if (error) return { status: { t: 'erro', msg: error.message }, estadoRemoto: null }

    const remotoTs = data?.estado
      ? Number((data.estado as EstadoApp).updatedAt) || 0
      : 0

    // Remoto mais novo: adota. Empate ou local mais novo: envia.
    if (remotoTs > local.updatedAt) {
      const remoto = normalizarEstado(data?.estado)
      if (remoto) {
        return {
          status: { t: 'ok', quando: Date.now(), email: usuario.email ?? '' },
          estadoRemoto: remoto,
        }
      }
    }

    const { error: erroEnvio } = await sb.from(TABELA).upsert(
      {
        user_id: usuario.id,
        estado: local,
        atualizado_em: new Date().toISOString(),
        dispositivo: c.dispositivo,
      },
      { onConflict: 'user_id' },
    )

    if (erroEnvio) {
      return { status: { t: 'erro', msg: erroEnvio.message }, estadoRemoto: null }
    }

    await gravarConfigSync({ ...c, ultimoSync: Date.now() })
    return {
      status: { t: 'ok', quando: Date.now(), email: usuario.email ?? '' },
      estadoRemoto: null,
    }
  } catch (e) {
    return {
      status: { t: 'erro', msg: e instanceof Error ? e.message : 'Falha na sincronização' },
      estadoRemoto: null,
    }
  }
}
