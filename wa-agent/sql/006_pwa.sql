-- 006_pwa.sql — acesso do painel PWA (Fase 4). Depende de 001 a 005.
--
-- PROBLEMA: o navegador nao pode carregar a service_role — ela ignora RLS e
-- da acesso total; qualquer um leria no devtools. E o 005 revogou anon e
-- authenticated de todas as tabelas, de proposito.
--
-- SOLUCAO: o PWA nao ganha SELECT em tabela nenhuma. Ele so pode CHAMAR uma
-- funcao, `fn_wa_painel`, que confere a autorizacao e devolve o painel pronto
-- em JSON. Superficie minima: uma funcao, nenhuma tabela.
--
-- A funcao e SECURITY DEFINER de proposito. Esse e o uso correto do recurso:
-- ela verifica quem esta chamando ANTES de ler qualquer coisa. E o oposto do
-- furo que o 005 corrigiu, onde as views eram definer sem verificacao nenhuma.

-- ---------------------------------------------------------------------------
-- Quem pode abrir o painel
-- ---------------------------------------------------------------------------
create table if not exists public.wa_app_emails (
  email      text primary key,
  nota       text,
  criado_em  timestamptz not null default now()
);

comment on table public.wa_app_emails is
  'E-mails autorizados a abrir o PWA. Autenticacao e do Supabase Auth; esta tabela decide quem passa.';

insert into public.wa_app_emails (email, nota) values
  ('jsavino.jspds@gmail.com', 'Jean')
on conflict (email) do nothing;

alter table public.wa_app_emails enable row level security;
alter table public.wa_app_emails force row level security;
revoke all on public.wa_app_emails from anon, authenticated;

-- ---------------------------------------------------------------------------
-- fn_wa_autorizado — o usuario logado esta na whitelist?
--
-- SECURITY DEFINER porque `authenticated` nao enxerga wa_app_emails. Devolve
-- so um booleano sobre o proprio chamador, entao nao vaza nada.
-- ---------------------------------------------------------------------------
create or replace function public.fn_wa_autorizado()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.wa_app_emails e
     where lower(e.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  );
$$;

-- ---------------------------------------------------------------------------
-- fn_wa_painel — tudo que o PWA precisa, numa chamada.
--
-- Confere a autorizacao ANTES de ler. Nao devolve mensagem bruta: so a analise
-- ja resumida, que e o que o painel mostra. Conversa de terceiro nao trafega
-- para o navegador em texto cru.
-- ---------------------------------------------------------------------------
create or replace function public.fn_wa_painel(horas integer default 24)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  desde timestamptz;
  saida jsonb;
begin
  if not public.fn_wa_autorizado() then
    raise exception 'nao autorizado'
      using hint = 'Adicione o e-mail em wa_app_emails.';
  end if;

  if horas is null or horas < 1 or horas > 720 then
    horas := 24;
  end if;
  desde := now() - make_interval(hours => horas);

  select jsonb_build_object(
    'gerado_em', now(),
    'janela_horas', horas,
    'conversas', coalesce(
      (select jsonb_agg(to_jsonb(d)) from public.vw_wa_digest d), '[]'::jsonb),
    'mencoes', coalesce(
      (select jsonb_object_agg(m.chat_id, m.mencoes) from public.fn_wa_mencoes(desde) m), '{}'::jsonb),
    'silenciadas', coalesce(
      (select to_jsonb(s) from public.fn_wa_silenciadas(desde) s), '{}'::jsonb)
  ) into saida;

  return saida;
end;
$$;

comment on function public.fn_wa_painel is
  'Painel do PWA em uma chamada. Confere wa_app_emails antes de ler.';

-- ---------------------------------------------------------------------------
-- Permissoes: so `authenticated` chama, e so estas duas funcoes.
-- Nenhum SELECT em tabela para o navegador.
-- ---------------------------------------------------------------------------
revoke execute on function public.fn_wa_autorizado()      from public, anon;
revoke execute on function public.fn_wa_painel(integer)   from public, anon;

grant execute on function public.fn_wa_autorizado()       to authenticated;
grant execute on function public.fn_wa_painel(integer)    to authenticated;

-- ---------------------------------------------------------------------------
-- Conferencia. `tabelas_expostas` tem que ser 0: o PWA le pela funcao, nunca
-- direto. Se algum dia isso passar de 0, alguem afrouxou o 005.
-- ---------------------------------------------------------------------------
select
  (select count(*) from information_schema.role_table_grants
    where table_schema = 'public'
      and (table_name like 'wa\_%' escape '\' or table_name like 'vw\_wa%' escape '\')
      and grantee in ('anon', 'authenticated'))            as tabelas_expostas,
  (select count(*) from information_schema.role_routine_grants
    where routine_schema = 'public'
      and routine_name = 'fn_wa_painel'
      and grantee = 'authenticated')                       as painel_liberado;
