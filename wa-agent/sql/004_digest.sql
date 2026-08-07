-- 004_digest.sql — base do digest (Fase 5)
-- Depende de 002_sla_e_regras.sql.

-- ---------------------------------------------------------------------------
-- vw_wa_digest — a ultima analise de cada conversa, com o estado atual dela.
--
-- Por que a ultima e nao todas: o worker roda varias vezes por dia e cada
-- rodada gera uma linha em wa_threads_analysis. O digest quer a foto de agora,
-- nao o historico.
--
-- `aguardando_jean` vem da analise, mas `last_message_from_me` vem do estado
-- atual da conversa. Se o Jean respondeu DEPOIS da analise, a bola nao esta
-- mais com ele e o digest.js usa esse campo para tirar a conversa da lista.
-- E o que evita cobrar o Jean de algo que ele ja resolveu.
-- ---------------------------------------------------------------------------
-- security_invoker: ver nota no 002. Sem isto a view fura o RLS.
create or replace view public.vw_wa_digest
with (security_invoker = on) as
with ultima as (
  select distinct on (a.chat_id) a.*
    from public.wa_threads_analysis a
   order by a.chat_id, a.criado_em desc
)
select
  c.id                  as chat_id,
  c.nome,
  c.is_group,
  c.bucket,
  c.segmento,
  c.responsavel,
  c.uf,
  c.muted,
  c.sla_horas,
  c.last_message_at,
  c.last_message_from_me,
  c.last_sender_name,

  u.assunto,
  u.resumo,
  u.prioridade,
  u.aguardando_jean,
  u.pendencia,
  u.rascunho,
  u.keywords_criticas,
  u.msgs_analisadas,
  u.criado_em           as analisado_em,

  round(extract(epoch from (now() - c.last_message_at)) / 3600.0, 1) as horas_parado,
  case
    when c.sla_horas is null or c.last_message_at is null then null
    else round((extract(epoch from (now() - c.last_message_at)) / 3600.0) / c.sla_horas, 2)
  end                   as razao_sla
from ultima u
join public.wa_chats c on c.id = u.chat_id;

comment on view public.vw_wa_digest is
  'Uma linha por conversa: a analise mais recente + o estado atual. Base do digest.';

-- ---------------------------------------------------------------------------
-- fn_wa_mencoes — quantas vezes citaram o Jean em cada conversa na janela.
-- Alimenta o "Carlos citou voce 2x" do digest.
-- ---------------------------------------------------------------------------
create or replace function public.fn_wa_mencoes(desde timestamptz)
returns TABLE (chat_id text, mencoes bigint)
language sql
stable
set search_path = ''
as $$
  select m.chat_id, count(*)
    from public.wa_messages m
   where m.mencionou_me
     and m.from_me = false
     and m.timestamp >= desde
   group by m.chat_id;
$$;

-- ---------------------------------------------------------------------------
-- fn_wa_silenciadas — o rodape "SILENCIADO (11 grupos, 143 mensagens)".
-- Conta o que chegou na janela e nao foi para a IA de proposito.
-- ---------------------------------------------------------------------------
create or replace function public.fn_wa_silenciadas(desde timestamptz)
returns TABLE (grupos bigint, mensagens bigint)
language sql
stable
set search_path = ''
as $$
  select count(distinct m.chat_id), count(*)
    from public.wa_messages m
    join public.wa_chats c on c.id = m.chat_id
   where m.timestamp >= desde
     and (c.muted or c.bucket in ('ruido', 'pessoal'));
$$;
