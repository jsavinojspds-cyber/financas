-- 002_sla_e_regras.sql — SLA por segmento, regras de classificacao e views
-- Depende de 001_schema.sql.

-- ---------------------------------------------------------------------------
-- wa_sla_policy — SLA por segmento. Fonte unica da verdade.
-- ---------------------------------------------------------------------------
create table if not exists public.wa_sla_policy (
  segmento    text primary key,
  sla_horas   integer not null check (sla_horas > 0),
  bucket      text not null default 'comercial'
                check (bucket in ('pessoal','comercial','ruido','indefinido')),
  descricao   text
);

insert into public.wa_sla_policy (segmento, sla_horas, bucket, descricao) values
  ('ka',        4,  'comercial', 'Rede/key account: Mateus, Assai (Sendas), Lider, HDL, Rio Azul'),
  ('lideranca', 6,  'comercial', 'Diretoria e gerencia nacional'),
  ('rca',       8,  'comercial', 'Representantes comerciais autonomos'),
  ('trade',     8,  'comercial', 'Merchandising e execucao de ponto de venda'),
  ('franquia',  12, 'comercial', 'Savino Locacoes / Locagora'),
  ('interno',   24, 'comercial', 'Times regionais e aprovacoes internas'),
  ('rh',        48, 'ruido',     'Comunicacao institucional, baixa acionabilidade'),
  ('pessoal',   72, 'pessoal',   'Familia e amigos')
on conflict (segmento) do update
  set sla_horas = excluded.sla_horas,
      bucket    = excluded.bucket,
      descricao = excluded.descricao;

-- Trigger: segmento definido => sla_horas vem da politica.
-- So sobrescreve quando o segmento muda ou o SLA esta vazio, para nao
-- apagar um ajuste manual feito de proposito numa conversa especifica.
create or replace function public.fn_wa_apply_sla()
returns trigger
language plpgsql
as $$
declare
  h integer;
begin
  if new.segmento is null then
    return new;
  end if;

  if tg_op = 'INSERT'
     or new.segmento is distinct from old.segmento
     or new.sla_horas is null then
    select p.sla_horas into h
      from public.wa_sla_policy p
     where p.segmento = new.segmento;

    if h is not null then
      new.sla_horas := h;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists tg_wa_chats_sla on public.wa_chats;
create trigger tg_wa_chats_sla
  before insert or update on public.wa_chats
  for each row execute function public.fn_wa_apply_sla();

-- ---------------------------------------------------------------------------
-- wa_rules — padrao de nome -> classificacao.
-- Consultada ANTES da IA: contato conhecido nao gasta token (CLAUDE.md 9.7).
-- ---------------------------------------------------------------------------
create table if not exists public.wa_rules (
  id            bigint generated always as identity primary key,
  padrao        text not null,
  tipo_match    text not null default 'ilike' check (tipo_match in ('ilike','regex','exato')),
  aplica_em     text not null default 'nome'  check (aplica_em in ('nome','jid')),

  bucket        text check (bucket in ('pessoal','comercial','ruido','indefinido')),
  segmento      text,
  responsavel   text,
  uf            text,
  muted         boolean,

  prioridade    integer not null default 100,  -- maior vence; use >100 para regra especifica
  ativo         boolean not null default true,
  nota          text,
  criado_em     timestamptz not null default now(),

  constraint uq_wa_rules_padrao unique (padrao, aplica_em)
);

comment on table public.wa_rules is
  'Classificacao deterministica por nome/JID. Sempre consultada antes de chamar a IA.';
comment on column public.wa_rules.prioridade is
  'Desempate: a regra de maior prioridade vence. Grupo nominal (200) ganha de padrao generico (100).';

create index if not exists ix_wa_rules_ativo on public.wa_rules (ativo, prioridade desc);

-- ---------------------------------------------------------------------------
-- wa_keywords_criticas — forcam prioridade 5 mesmo em grupo silenciado
-- ---------------------------------------------------------------------------
create table if not exists public.wa_keywords_criticas (
  id          bigint generated always as identity primary key,
  termo       text not null unique,
  categoria   text,
  ativo       boolean not null default true,
  nota        text
);

comment on table public.wa_keywords_criticas is
  'Termos que furam o silenciamento. O worker da Fase 3 forca prioridade 5 ao encontrar.';

-- ---------------------------------------------------------------------------
-- fn_wa_apply_rules — aplica as regras nas conversas ainda nao classificadas
-- a mao. Nunca sobrescreve classificado_por = 'manual'.
-- ---------------------------------------------------------------------------
create or replace function public.fn_wa_apply_rules()
returns TABLE (chat_id text, nome text, bucket text, segmento text, regra_id bigint)
language plpgsql
as $$
begin
  return query
  with alvo as (
    select c.id, c.nome
      from public.wa_chats c
     where c.classificado_por in ('nenhum','regra','ia')
  ),
  casado as (
    select distinct on (a.id)
           a.id   as cid,
           a.nome as cnome,
           r.*
      from alvo a
      join public.wa_rules r
        on r.ativo
       and case r.tipo_match
             when 'ilike' then coalesce(case r.aplica_em when 'jid' then a.id else a.nome end, '') ilike '%' || r.padrao || '%'
             when 'regex' then coalesce(case r.aplica_em when 'jid' then a.id else a.nome end, '') ~* r.padrao
             when 'exato' then coalesce(case r.aplica_em when 'jid' then a.id else a.nome end, '') = r.padrao
           end
     order by a.id, r.prioridade desc, r.id
  ),
  aplicado as (
    update public.wa_chats c
       set bucket           = coalesce(k.bucket, c.bucket),
           segmento         = coalesce(k.segmento, c.segmento),
           responsavel      = coalesce(k.responsavel, c.responsavel),
           uf               = coalesce(k.uf, c.uf),
           muted            = coalesce(k.muted, c.muted),
           classificado_por = 'regra',
           classificado_em  = now()
      from casado k
     where c.id = k.cid
     returning c.id, c.nome, c.bucket, c.segmento, k.id as rid
  )
  select a.id, a.nome, a.bucket, a.segmento, a.rid from aplicado a;
end;
$$;

comment on function public.fn_wa_apply_rules is
  'Uso: select * from fn_wa_apply_rules(); Roda apos cada lote de conversas novas.';

-- ---------------------------------------------------------------------------
-- vw_wa_inbox — visao da caixa de entrada
-- ---------------------------------------------------------------------------
create or replace view public.vw_wa_inbox as
select
  c.id                as chat_id,
  c.nome,
  c.is_group,
  c.bucket,
  c.segmento,
  c.responsavel,
  c.uf,
  c.muted,
  c.sla_horas,
  c.msg_count,
  c.last_message_at,
  c.last_message_from_me,
  c.last_sender_name,
  c.classificado_por,
  round(extract(epoch from (now() - c.last_message_at)) / 3600.0, 1) as horas_parado,
  (select count(*) from public.wa_messages m
    where m.chat_id = c.id and m.processed = false)                  as na_fila
from public.wa_chats c;

comment on view public.vw_wa_inbox is
  'Uso: select * from vw_wa_inbox order by msg_count desc;';

-- ---------------------------------------------------------------------------
-- vw_wa_sla_estourado — base do digest.
-- Comercial, nao silenciado, ultima mensagem NAO e do Jean, passou do SLA.
-- Ordenado pelo estouro PROPORCIONAL: KA parado 5h (razao 1.25) vem antes
-- de interno parado 20h (razao 0.83). Ver CLAUDE.md secao 8.
-- ---------------------------------------------------------------------------
create or replace view public.vw_wa_sla_estourado as
select
  c.id            as chat_id,
  c.nome,
  c.segmento,
  c.responsavel,
  c.uf,
  c.sla_horas,
  c.last_message_at,
  c.last_sender_name,
  round(extract(epoch from (now() - c.last_message_at)) / 3600.0, 1) as horas_parado,
  round((extract(epoch from (now() - c.last_message_at)) / 3600.0) / c.sla_horas, 2) as razao_sla
from public.wa_chats c
where c.bucket = 'comercial'
  and c.muted = false
  and c.last_message_from_me = false          -- a bola esta com o Jean
  and c.last_message_at is not null
  and c.sla_horas is not null
  and extract(epoch from (now() - c.last_message_at)) / 3600.0 > c.sla_horas
order by razao_sla desc;

comment on view public.vw_wa_sla_estourado is
  'Uso: select * from vw_wa_sla_estourado; Ja vem ordenada por urgencia proporcional.';

alter table public.wa_sla_policy        enable row level security;
alter table public.wa_rules             enable row level security;
alter table public.wa_keywords_criticas enable row level security;

alter table public.wa_sla_policy        force row level security;
alter table public.wa_rules             force row level security;
alter table public.wa_keywords_criticas force row level security;
