-- ============================================================================
--  Finanças — schema do backend opcional (Supabase)
--
--  Rode este arquivo UMA VEZ no SQL Editor do projeto, antes de conectar o app
--  em Ajustes → Sincronização.
--
--  Modelo: uma linha por usuário guardando o estado inteiro do app em jsonb.
--  Para um app pessoal de usuário único isso é suficiente e muito mais fácil
--  de auditar do que uma tabela por lançamento — e o conflito entre aparelhos
--  vira uma regra só: vence quem sincronizou por último (last-write-wins pelo
--  campo `estado->>'updatedAt'`, comparado no cliente).
-- ============================================================================

create table if not exists public.estado_financas (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  estado        jsonb       not null,
  atualizado_em timestamptz not null default now(),
  -- identificador curto do aparelho, só para diagnóstico ("quem gravou por último")
  dispositivo   text
);

comment on table public.estado_financas is
  'Estado completo do app de finanças, uma linha por usuário.';

-- ── Row Level Security ──────────────────────────────────────────────────────
-- Sem isto, a chave anon (que é pública por natureza e vai embutida no app)
-- daria acesso a todas as linhas. Com isto, cada usuário só enxerga a própria.

alter table public.estado_financas enable row level security;

drop policy if exists "dono le" on public.estado_financas;
create policy "dono le"
  on public.estado_financas for select
  using (auth.uid() = user_id);

drop policy if exists "dono insere" on public.estado_financas;
create policy "dono insere"
  on public.estado_financas for insert
  with check (auth.uid() = user_id);

drop policy if exists "dono atualiza" on public.estado_financas;
create policy "dono atualiza"
  on public.estado_financas for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "dono apaga" on public.estado_financas;
create policy "dono apaga"
  on public.estado_financas for delete
  using (auth.uid() = user_id);

-- ── Carimbo de atualização ──────────────────────────────────────────────────
-- O cliente já envia `atualizado_em`, mas um trigger garante que a coluna
-- reflita o servidor mesmo se o relógio do aparelho estiver errado.

create or replace function public.tocar_atualizado_em()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists trg_estado_financas_atualizado on public.estado_financas;
create trigger trg_estado_financas_atualizado
  before update on public.estado_financas
  for each row execute function public.tocar_atualizado_em();

-- ── Depois de rodar ─────────────────────────────────────────────────────────
--  1. Authentication → Sign In / Providers → Email: deixe "Email" habilitado.
--     O app usa código de 6 dígitos (OTP), então NÃO é preciso configurar
--     URL de redirect nem senha.
--  2. Authentication → Providers → Email → desmarque "Confirm email" se quiser
--     entrar já no primeiro código.
--  3. Copie Project URL e a chave `anon public` em Project Settings → API e
--     cole no app em Ajustes → Sincronização.
-- ============================================================================
