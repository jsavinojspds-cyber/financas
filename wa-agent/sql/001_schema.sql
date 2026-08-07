-- 001_schema.sql — tabelas base do WA-AGENT
-- Rodar no SQL Editor do Supabase, na ordem 001 -> 002 -> 003.
-- Idempotente: pode rodar de novo sem quebrar.
--
-- Todo timestamp aqui e UTC (timestamptz). A conversao para America/Manaus
-- acontece na saida para o usuario, nunca no banco (CLAUDE.md secao 9.10).

-- ---------------------------------------------------------------------------
-- wa_chats — uma linha por conversa (grupo ou contato)
-- ---------------------------------------------------------------------------
create table if not exists public.wa_chats (
  id                    text primary key,            -- JID: ...@g.us ou ...@s.whatsapp.net
  nome                  text,
  is_group              boolean not null default false,

  -- classificacao
  bucket                text not null default 'indefinido'
                          check (bucket in ('pessoal','comercial','ruido','indefinido')),
  segmento              text,                        -- ka | rca | interno | trade | lideranca | rh | franquia | ...
  responsavel           text,                        -- pessoa da secao 7 do CLAUDE.md
  uf                    text,
  muted                 boolean not null default false,
  sla_horas             integer,                     -- preenchido pelo trigger a partir de wa_sla_policy

  -- estado da conversa (mantido pelo trigger de wa_messages)
  last_message_at       timestamptz,
  last_message_from_me  boolean,
  last_sender_name      text,
  msg_count             integer not null default 0,

  -- procedencia da classificacao
  classificado_por      text default 'nenhum'
                          check (classificado_por in ('nenhum','regra','ia','manual')),
  classificado_em       timestamptz,

  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now()
);

comment on table public.wa_chats is
  'Conversas espelhadas do WhatsApp. bucket/segmento vem de wa_rules ou da IA.';
comment on column public.wa_chats.last_message_from_me is
  'true = a ultima mensagem foi do Jean, ou seja a bola NAO esta com ele. Base do vw_wa_sla_estourado.';

create index if not exists ix_wa_chats_bucket    on public.wa_chats (bucket);
create index if not exists ix_wa_chats_segmento  on public.wa_chats (segmento);
create index if not exists ix_wa_chats_last_msg  on public.wa_chats (last_message_at desc);

-- ---------------------------------------------------------------------------
-- wa_messages — mensagens brutas. processed=false e a fila do worker (Fase 3)
-- ---------------------------------------------------------------------------
create table if not exists public.wa_messages (
  id            bigint generated always as identity primary key,
  chat_id       text not null references public.wa_chats(id) on delete cascade,
  msg_id        text not null,                       -- key.id do Baileys
  from_me       boolean not null default false,
  sender_jid    text,                                -- em grupo: quem falou; em 1:1 = chat_id
  sender_name   text,

  tipo          text not null default 'desconhecido',-- texto|imagem|video|audio|documento|figurinha|reacao|localizacao|contato|sistema|desconhecido
  conteudo      text,                                -- texto ou legenda; null em midia sem legenda
  tem_midia     boolean not null default false,
  citada        text,                                -- trecho da mensagem respondida, quando houver
  mencionou_me  boolean not null default false,      -- @ no Jean

  timestamp     timestamptz not null,                -- horario da mensagem, UTC
  raw           jsonb,                               -- payload original, para nao perder nada

  processed     boolean not null default false,      -- fila do worker de triagem
  criado_em     timestamptz not null default now(),

  constraint uq_wa_messages_chat_msg unique (chat_id, msg_id)
);

comment on column public.wa_messages.processed is
  'false = ainda nao passou pelo worker de triagem. E a fila da Fase 3.';
comment on column public.wa_messages.raw is
  'Payload cru do Baileys. Preserva conteudo que o WhatsApp apaga em grupos com mensagem temporaria (ex: Aprovacao NENO/CO).';

-- Fila do worker: so as nao processadas, em ordem de chegada.
create index if not exists ix_wa_messages_fila
  on public.wa_messages (timestamp) where processed = false;

create index if not exists ix_wa_messages_chat_ts on public.wa_messages (chat_id, timestamp desc);
create index if not exists ix_wa_messages_ts      on public.wa_messages (timestamp desc);

-- ---------------------------------------------------------------------------
-- wa_threads_analysis — saida da IA (preenchida na Fase 3)
-- ---------------------------------------------------------------------------
create table if not exists public.wa_threads_analysis (
  id                bigint generated always as identity primary key,
  chat_id           text not null references public.wa_chats(id) on delete cascade,

  janela_inicio     timestamptz not null,            -- intervalo de mensagens que a analise cobre
  janela_fim        timestamptz not null,
  msgs_analisadas   integer not null default 0,

  resumo            text,
  prioridade        smallint check (prioridade between 1 and 5),
  aguardando_jean   boolean not null default false,  -- a bola esta com ele?
  assunto           text,
  pendencia         text,                            -- o que exatamente esta parado
  rascunho          text,                            -- sugestao de resposta, NUNCA enviada automaticamente
  keywords_criticas text[],

  modelo            text,
  tokens_in         integer,
  tokens_out        integer,

  criado_em         timestamptz not null default now()
);

comment on column public.wa_threads_analysis.rascunho is
  'Rascunho para o Jean copiar e enviar a mao. O agente e read-only (CLAUDE.md secao 2).';

create index if not exists ix_wa_analysis_chat on public.wa_threads_analysis (chat_id, criado_em desc);
create index if not exists ix_wa_analysis_prio on public.wa_threads_analysis (prioridade desc, criado_em desc);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- atualizado_em automatico em wa_chats
create or replace function public.fn_wa_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists tg_wa_chats_touch on public.wa_chats;
create trigger tg_wa_chats_touch
  before update on public.wa_chats
  for each row execute function public.fn_wa_touch();

-- mantem o estado da conversa em wa_chats a cada mensagem nova
create or replace function public.fn_wa_bump_chat()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.wa_chats c
     set last_message_at      = greatest(coalesce(c.last_message_at, new.timestamp), new.timestamp),
         last_message_from_me = case
                                  when new.timestamp >= coalesce(c.last_message_at, new.timestamp)
                                  then new.from_me
                                  else c.last_message_from_me
                                end,
         last_sender_name     = case
                                  when new.timestamp >= coalesce(c.last_message_at, new.timestamp)
                                  then new.sender_name
                                  else c.last_sender_name
                                end,
         msg_count            = c.msg_count + 1
   where c.id = new.chat_id;
  return new;
end;
$$;

drop trigger if exists tg_wa_messages_bump on public.wa_messages;
create trigger tg_wa_messages_bump
  after insert on public.wa_messages
  for each row execute function public.fn_wa_bump_chat();

-- ---------------------------------------------------------------------------
-- Expurgo LGPD — conversa de terceiros nao fica aqui para sempre
-- ---------------------------------------------------------------------------
create or replace function public.fn_wa_purge_old(dias integer default 180)
returns TABLE (mensagens_removidas bigint, analises_removidas bigint)
language plpgsql
set search_path = ''
as $$
declare
  corte timestamptz := now() - make_interval(days => dias);
  m bigint;
  a bigint;
begin
  delete from public.wa_threads_analysis where criado_em < corte;
  get diagnostics a = row_count;

  delete from public.wa_messages where timestamp < corte;
  get diagnostics m = row_count;

  -- msg_count vira contagem do que restou, senao fica inflado para sempre
  update public.wa_chats c
     set msg_count = coalesce((select count(*) from public.wa_messages m2 where m2.chat_id = c.id), 0);

  return query select m, a;
end;
$$;

comment on function public.fn_wa_purge_old is
  'Expurgo LGPD. Uso: select * from fn_wa_purge_old(180);';

-- ---------------------------------------------------------------------------
-- RLS — ligado, SEM policy publica.
-- O listener usa service_role, que ignora RLS por design. A anon key
-- nao le nada, que e exatamente o que queremos.
-- ---------------------------------------------------------------------------
alter table public.wa_chats            enable row level security;
alter table public.wa_messages         enable row level security;
alter table public.wa_threads_analysis enable row level security;

alter table public.wa_chats            force row level security;
alter table public.wa_messages         force row level security;
alter table public.wa_threads_analysis force row level security;
