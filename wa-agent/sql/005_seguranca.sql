-- 005_seguranca.sql — endurecimento de acesso. Depende de 001 a 004.
--
-- CONTEXTO: as views dos arquivos anteriores ja nascem com
-- `security_invoker = on`, o que faz cada uma rodar com a permissao de QUEM
-- CONSULTA, e nao de quem criou. Sem isso a view passa por cima do RLS das
-- tabelas de baixo, e a anon key — que e publica por natureza, vai em app
-- cliente e fica visivel no painel — daria leitura completa das conversas.
--
-- Este arquivo fecha o resto: tira o acesso de anon e authenticated, que nao
-- tem nada que fazer aqui. O agente usa exclusivamente service_role, que
-- ignora RLS por design.
--
-- Idempotente: revoke de permissao ja ausente nao da erro.

-- ---------------------------------------------------------------------------
-- Tabelas e views
-- ---------------------------------------------------------------------------
revoke all on public.wa_chats             from anon, authenticated;
revoke all on public.wa_messages          from anon, authenticated;
revoke all on public.wa_threads_analysis  from anon, authenticated;
revoke all on public.wa_rules             from anon, authenticated;
revoke all on public.wa_keywords_criticas from anon, authenticated;
revoke all on public.wa_sla_policy        from anon, authenticated;

revoke all on public.vw_wa_inbox          from anon, authenticated;
revoke all on public.vw_wa_sla_estourado  from anon, authenticated;
revoke all on public.vw_wa_digest         from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Funcoes
-- ---------------------------------------------------------------------------
revoke execute on function public.fn_wa_apply_rules()            from anon, authenticated;
revoke execute on function public.fn_wa_purge_old(integer)       from anon, authenticated;
revoke execute on function public.fn_wa_mencoes(timestamptz)     from anon, authenticated;
revoke execute on function public.fn_wa_silenciadas(timestamptz) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Se um dia a Fase 4 (PWA) precisar ler direto do navegador, NAO desfaca isto.
-- O caminho certo e um backend com service_role, ou uma policy explicita e
-- estreita para `authenticated` — nunca devolver o SELECT amplo para `anon`.
-- ---------------------------------------------------------------------------

-- Conferencia. Deve voltar zero linhas: nenhuma permissao para anon/authenticated.
select grantee, table_name, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public'
   and table_name like 'wa\_%' escape '\'
   and grantee in ('anon', 'authenticated')
union all
select grantee, table_name, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public'
   and table_name like 'vw\_wa%' escape '\'
   and grantee in ('anon', 'authenticated');
