-- 008_chamado_direto.sql — menção direta passa a valer prioridade.
-- Depende de 001 a 006.
--
-- POR QUE ESTE ARQUIVO EXISTE
--
-- Teste real, 10/08, grupo REGIONAL NORTE: "@Jean a meta é positivação ou
-- valor?". Pergunta direta, com marcação, esperando resposta dele. O painel
-- teria colocado isso no fim da fila.
--
-- Motivo: REGIONAL NORTE é `interno`, SLA 24h. Quinze minutos depois da
-- pergunta a razão de SLA era 0,01x — e a ordem do painel é regida por razão
-- de SLA. Qualquer coisa de KA passava na frente. A menção era contada
-- (`fn_wa_mencoes`) e virava etiqueta "citou você 2x", mas etiqueta não
-- ordena nada.
--
-- Furo de projeto: o sistema tratava menção como enfeite. Ser chamado pelo
-- nome, com pergunta, é o sinal mais forte que existe de que a bola está com
-- ele — mais confiável que qualquer heurística de SLA, porque é explícito.
--
-- O QUE MUDA
--
-- 1. `respondeu_me` — responder uma mensagem do Jean também é chamá-lo. Hoje
--    só a marcação com @ contava.
-- 2. `chamado_direto` na análise — o worker marca, o painel ordena por isso
--    no mesmo nível de keyword crítica.
-- 3. `fn_wa_mencoes` passa a contar os dois.

-- ---------------------------------------------------------------------------
-- 1. Resposta a uma mensagem do Jean
--
-- O Baileys entrega o autor da mensagem citada em contextInfo.participant.
-- Quem responde a mensagem dele está falando com ele, mesmo sem marcar.
-- ---------------------------------------------------------------------------
alter table public.wa_messages
  add column if not exists respondeu_me boolean not null default false;

comment on column public.wa_messages.respondeu_me is
  'A mensagem citada é do Jean. Chamado direto sem precisar de @.';

-- Índice parcial: só interessa o que é chamado e não é dele.
create index if not exists wa_messages_chamado_idx
  on public.wa_messages (chat_id, "timestamp")
  where (mencionou_me or respondeu_me) and not from_me;

-- ---------------------------------------------------------------------------
-- 2. A análise registra se houve chamado em aberto
--
-- Em aberto = ninguém falou pelo Jean depois. Quem calcula é o worker, que
-- tem as mensagens na ordem; aqui só guardamos o resultado, do mesmo jeito
-- que `keywords_criticas`.
-- ---------------------------------------------------------------------------
alter table public.wa_threads_analysis
  add column if not exists chamado_direto boolean not null default false;

comment on column public.wa_threads_analysis.chamado_direto is
  'Marcaram o Jean ou responderam a ele, e ele ainda nao voltou a falar.';

-- ---------------------------------------------------------------------------
-- 3. fn_wa_mencoes — marcação OU resposta
--
-- Assinatura de retorno inalterada de propósito: fn_wa_painel agrega essa
-- saída e não precisa saber que a definição mudou.
-- ---------------------------------------------------------------------------
create or replace function public.fn_wa_mencoes(desde timestamptz)
returns TABLE (chat_id text, mencoes bigint)
language sql
stable
set search_path = ''
as $$
  select m.chat_id, count(*)
    from public.wa_messages m
   where (m.mencionou_me or m.respondeu_me)
     and m.from_me = false
     and m."timestamp" >= desde
   group by m.chat_id;
$$;

comment on function public.fn_wa_mencoes is
  'Quantas vezes chamaram o Jean na janela: marcacao com @ ou resposta a ele.';

-- ---------------------------------------------------------------------------
-- 4. vw_wa_digest — expõe chamado_direto
--
-- DROP e não CREATE OR REPLACE: replace só aceita colunas novas no fim, e a
-- coluna pertence junto de keywords_criticas para quem lê a view.
--
-- ATENCAO: o Supabase tem DEFAULT PRIVILEGES concedendo anon/authenticated
-- em objeto novo do schema public. Foi exatamente assim que o vazamento do
-- 005 aconteceu. Toda view recriada TEM que ser revogada de novo logo abaixo,
-- e `security_invoker` tem que voltar.
-- ---------------------------------------------------------------------------
drop view if exists public.vw_wa_digest;

create view public.vw_wa_digest
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
  u.chamado_direto,
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
  'Uma linha por conversa: a analise mais recente + o estado atual. Base do painel.';

revoke all on public.vw_wa_digest from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Conferência. As duas colunas têm que existir e a view não pode estar
-- exposta ao navegador.
-- ---------------------------------------------------------------------------
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'wa_messages'
      and column_name = 'respondeu_me')                     as tem_respondeu_me,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'vw_wa_digest'
      and column_name = 'chamado_direto')                   as tem_chamado_direto,
  (select count(*) from information_schema.role_table_grants
    where table_schema = 'public'
      and (table_name like 'wa\_%' escape '\' or table_name like 'vw\_wa%' escape '\')
      and grantee in ('anon', 'authenticated'))             as tabelas_expostas;
