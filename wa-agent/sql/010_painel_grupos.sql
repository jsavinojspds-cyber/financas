-- 010_painel_grupos.sql — o PWA passa a receber a visao por grupo.
-- Depende de 001 a 009.
--
-- Ate aqui o painel do iPhone so tinha a FILA: o que esta parado com o Jean.
-- Faltava o RETRATO: o que rolou hoje, grupo por grupo, que ja existia no
-- terminal (npm run resumo) mas nao no celular.
--
-- Continua sendo UMA chamada. O navegador nao ganha SELECT em tabela nenhuma
-- e nao chama fn_wa_resumo_dia direto — ela segue revogada de anon e de
-- authenticated (sql/009). Quem le e esta funcao, que e SECURITY DEFINER e
-- confere a whitelist ANTES de qualquer leitura.

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

    -- A fila de acao (aba "Fila").
    'conversas', coalesce(
      (select jsonb_agg(to_jsonb(d)) from public.vw_wa_digest d), '[]'::jsonb),

    -- O retrato por grupo (aba "Grupos"). Contagens + a analise mais recente
    -- daquela conversa, quando existir. Conversa pessoal entra com atividade
    -- e sem texto: a IA nao le grupo pessoal por padrao.
    'grupos', coalesce(
      (select jsonb_agg(
                to_jsonb(g) || jsonb_build_object(
                  'assunto',           d.assunto,
                  'resumo',            d.resumo,
                  'prioridade',        d.prioridade,
                  'aguardando_jean',   d.aguardando_jean,
                  'chamado_direto',    d.chamado_direto,
                  'keywords_criticas', d.keywords_criticas,
                  'rascunho',          d.rascunho
                ))
         from public.fn_wa_resumo_dia(desde) g
         left join public.vw_wa_digest d on d.chat_id = g.chat_id),
      '[]'::jsonb),

    'mencoes', coalesce(
      (select jsonb_object_agg(m.chat_id, m.mencoes) from public.fn_wa_mencoes(desde) m), '{}'::jsonb),
    'silenciadas', coalesce(
      (select to_jsonb(s) from public.fn_wa_silenciadas(desde) s), '{}'::jsonb)
  ) into saida;

  return saida;
end;
$$;

comment on function public.fn_wa_painel is
  'Painel do PWA em uma chamada: fila de acao + retrato por grupo. Confere wa_app_emails antes de ler.';

-- Recriar a funcao nao mexe nos grants, mas reafirmar e barato e o 005 ja
-- foi corrigido uma vez por causa de permissao que voltou sozinha.
revoke execute on function public.fn_wa_painel(integer) from public, anon;
grant  execute on function public.fn_wa_painel(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Conferencia: o navegador continua sem acesso direto a tabela e a
-- fn_wa_resumo_dia, e so fn_wa_painel esta liberada.
-- ---------------------------------------------------------------------------
select
  (select count(*) from information_schema.role_table_grants
    where table_schema = 'public'
      and (table_name like 'wa\_%' escape '\' or table_name like 'vw\_wa%' escape '\')
      and grantee in ('anon', 'authenticated'))              as tabelas_expostas,
  (select count(*) from information_schema.role_routine_grants
    where routine_schema = 'public' and routine_name = 'fn_wa_resumo_dia'
      and grantee in ('anon', 'authenticated'))              as resumo_exposto,
  (select count(*) from information_schema.role_routine_grants
    where routine_schema = 'public' and routine_name = 'fn_wa_painel'
      and grantee = 'authenticated')                         as painel_liberado;
