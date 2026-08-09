-- 007_busca.sql — busca no historico (Fase 6). Depende de 001 a 006.
--
-- DUAS BUSCAS, FUNDIDAS
--
-- 1. Textual (tsvector, dicionario portugues). Nao precisa de chave nenhuma,
--    e ja resolve muita coisa: acha "rupturas" buscando "ruptura", "faturado"
--    buscando "faturar". Manda bem em nome proprio, codigo de pedido, SKU e
--    numero de NF — justamente onde busca vetorial costuma errar.
--
-- 2. Semantica (pgvector). Acha "falta de produto na gondola" quando voce
--    busca "ruptura". Precisa de embeddings, que exigem um fornecedor externo:
--    a Anthropic nao tem API de embeddings.
--
-- As duas se fundem por RRF (Reciprocal Rank Fusion): cada uma ranqueia, e o
-- score final e a soma de 1/(k+posicao). RRF nao exige que os scores das duas
-- estejam na mesma escala, que e o problema de somar similaridade com ts_rank.
--
-- Sem embeddings gravados, a busca funciona so com a metade textual. Sem chave
-- de embeddings, tambem. Nada disso quebra.

-- pgvector: no Supabase, extensao vive no schema `extensions`.
create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------------
-- Colunas de busca
-- ---------------------------------------------------------------------------

-- DIMENSAO: precisa bater com o modelo de embedding usado no src/embeddings.js.
-- 1024 e a saida padrao do voyage-3. Trocar de modelo com dimensao diferente
-- exige recriar a coluna e reindexar tudo — o indexar.js confere e avisa.
alter table public.wa_messages
  add column if not exists embedding extensions.vector(1024);

-- Gerada e sempre em dia: nao ha o que reindexar quando chega mensagem nova.
-- 'pg_catalog.portuguese' qualificado porque as funcoes daqui usam
-- search_path vazio.
alter table public.wa_messages
  add column if not exists busca tsvector
  generated always as (to_tsvector('pg_catalog.portuguese', coalesce(conteudo, ''))) stored;

create index if not exists ix_wa_messages_busca
  on public.wa_messages using gin (busca);

create index if not exists ix_wa_messages_emb
  on public.wa_messages using hnsw (embedding extensions.vector_cosine_ops);

-- Fila do indexador: so o que tem texto e ainda nao foi embutido.
create index if not exists ix_wa_messages_sem_emb
  on public.wa_messages (timestamp desc)
  where embedding is null and conteudo is not null;

-- ---------------------------------------------------------------------------
-- fn_wa_buscar — RRF entre textual e semantica
--
-- `vetor` nulo => so textual. E o caminho sem chave de embeddings.
-- ---------------------------------------------------------------------------
create or replace function public.fn_wa_buscar(
  consulta      text,
  vetor         extensions.vector(1024) default null,
  limite        integer default 20,
  desde         timestamptz default null,
  so_chat       text default null,
  so_comercial  boolean default false,
  -- Distancia de cosseno maxima para a metade semantica. Sem este corte, a
  -- busca vetorial devolve SEMPRE os N mais proximos, por pior que sejam:
  -- num historico grande isso enche o ranking de ruido e faz "semantica"
  -- perder o sentido. 0 = identico, 1 = ortogonal, 2 = oposto.
  dist_max      real default 0.75
)
returns TABLE (
  id           bigint,
  chat_id      text,
  chat_nome    text,
  segmento     text,
  quem         text,
  tipo         text,
  conteudo     text,
  quando       timestamptz,
  score        real,
  origem       text
)
language sql
stable
set search_path = ''
as $$
  with q as (
    select case
             when consulta is null or btrim(consulta) = '' then null
             else websearch_to_tsquery('pg_catalog.portuguese', consulta)
           end as tq
  ),
  base as (
    select m.id, m.chat_id, m.busca, m.embedding, m.timestamp
      from public.wa_messages m
      join public.wa_chats c on c.id = m.chat_id
     where (desde is null or m.timestamp >= desde)
       and (so_chat is null or m.chat_id = so_chat)
       and (not so_comercial or c.bucket = 'comercial')
  ),
  lex as (
    select b.id,
           row_number() over (order by ts_rank_cd(b.busca, q.tq) desc, b.timestamp desc) as pos
      from base b, q
     where q.tq is not null
       and b.busca @@ q.tq
     limit 200
  ),
  vec as (
    select b.id,
           row_number() over (order by b.embedding operator(extensions.<=>) vetor) as pos
      from base b
     where vetor is not null
       and b.embedding is not null
       and (b.embedding operator(extensions.<=>) vetor) < dist_max
     order by b.embedding operator(extensions.<=>) vetor
     limit 200
  ),
  fundido as (
    select coalesce(l.id, v.id) as id,
           (case when l.pos is not null then 1.0 / (60 + l.pos) else 0 end)
         + (case when v.pos is not null then 1.0 / (60 + v.pos) else 0 end) as score,
           case
             when l.pos is not null and v.pos is not null then 'ambos'
             when l.pos is not null then 'texto'
             else 'semantica'
           end as origem
      from lex l
      full outer join vec v on v.id = l.id
  )
  select
    m.id,
    m.chat_id,
    c.nome,
    c.segmento,
    coalesce(m.sender_name, case when m.from_me then 'Jean' else 'contato' end),
    m.tipo,
    m.conteudo,
    m.timestamp,
    f.score::real,
    f.origem
  from fundido f
  join public.wa_messages m on m.id = f.id
  join public.wa_chats c    on c.id = m.chat_id
  order by f.score desc, m.timestamp desc
  limit greatest(1, least(coalesce(limite, 20), 100));
$$;

comment on function public.fn_wa_buscar is
  'Busca no historico. Sem `vetor`, roda so a metade textual — util sem chave de embeddings. `dist_max` corta o ruido da metade semantica.';

-- ---------------------------------------------------------------------------
-- fn_wa_gravar_embeddings — grava um lote inteiro numa chamada.
--
-- Uma atualizacao por mensagem seria uma viagem de rede por linha; com o
-- Supabase em us-west-2 e o indexador no Brasil, isso domina o tempo total.
-- Upsert nao serve: wa_messages.id e `generated always as identity`, entao
-- PostgREST nao consegue mandar o id de volta.
--
-- Formato: [{"id": 123, "embedding": [0.1, ...]}, ...]
-- ---------------------------------------------------------------------------
create or replace function public.fn_wa_gravar_embeddings(lote jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  n integer;
begin
  update public.wa_messages m
     set embedding = (e->>'embedding')::extensions.vector
    from jsonb_array_elements(lote) e
   where m.id = (e->>'id')::bigint;

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.fn_wa_gravar_embeddings(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- fn_wa_status_indice — quanto do historico ja tem embedding
-- ---------------------------------------------------------------------------
create or replace function public.fn_wa_status_indice()
returns TABLE (
  com_texto      bigint,
  indexadas      bigint,
  na_fila        bigint,
  pct_indexado   numeric
)
language sql
stable
set search_path = ''
as $$
  select
    count(*) filter (where conteudo is not null),
    count(*) filter (where embedding is not null),
    count(*) filter (where conteudo is not null and embedding is null),
    round(
      100.0 * count(*) filter (where embedding is not null)
      / nullif(count(*) filter (where conteudo is not null), 0), 1)
  from public.wa_messages;
$$;

-- ---------------------------------------------------------------------------
-- Acesso: so service_role. O PWA nao busca direto — se um dia buscar, sera
-- por uma funcao propria com whitelist, como a fn_wa_painel do 006.
-- ---------------------------------------------------------------------------
revoke execute on function public.fn_wa_buscar(text, extensions.vector, integer, timestamptz, text, boolean, real) from public, anon, authenticated;
revoke execute on function public.fn_wa_status_indice() from public, anon, authenticated;
