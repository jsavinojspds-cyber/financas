-- 009_resumo_dia.sql — atividade por conversa na janela. Depende de 001 a 008.
--
-- O digest (Fase 5) responde "o que esta parado comigo". Esta funcao alimenta
-- outra pergunta, que o Jean pediu: "o que rolou hoje, grupo por grupo" —
-- inclusive nos grupos onde nada esta parado com ele.
--
-- Sao visoes diferentes de proposito. O digest e uma fila de acao, curta e
-- ordenada por urgencia. O resumo do dia e um retrato: todo grupo que teve
-- movimento aparece, trabalho separado de pessoal.
--
-- Aqui so contamos. O texto do resumo vem de wa_threads_analysis, que e onde
-- a IA escreve — e a IA nao le grupo pessoal por padrao (CLAUDE.md secao 6).

create or replace function public.fn_wa_resumo_dia(desde timestamptz)
returns TABLE (
  chat_id       text,
  nome          text,
  is_group      boolean,
  bucket        text,
  segmento      text,
  responsavel   text,
  uf            text,
  muted         boolean,
  mensagens     bigint,
  de_terceiros  bigint,
  minhas        bigint,
  pessoas       bigint,
  chamados      bigint,
  com_midia     bigint,
  audios        bigint,
  primeira      timestamptz,
  ultima        timestamptz
)
language sql
stable
set search_path = ''
as $$
  select
    c.id,
    c.nome,
    c.is_group,
    c.bucket,
    c.segmento,
    c.responsavel,
    c.uf,
    c.muted,
    count(*),
    count(*) filter (where not m.from_me),
    count(*) filter (where m.from_me),
    -- Quantas pessoas diferentes falaram. Um grupo com 30 mensagens de uma
    -- pessoa so e monologo; com 30 de oito pessoas, e discussao.
    count(distinct m.sender_jid) filter (where not m.from_me),
    count(*) filter (where (m.mencionou_me or m.respondeu_me) and not m.from_me),
    count(*) filter (where m.tem_midia),
    -- Audio ainda nao e transcrito (Fase 3.5b, adiada). Contar e a forma
    -- honesta de dizer "tem conteudo aqui que ninguem leu".
    count(*) filter (where m.tipo = 'audio'),
    min(m."timestamp"),
    max(m."timestamp")
  from public.wa_messages m
  join public.wa_chats c on c.id = m.chat_id
  where m."timestamp" >= desde
  group by c.id, c.nome, c.is_group, c.bucket, c.segmento,
           c.responsavel, c.uf, c.muted;
$$;

comment on function public.fn_wa_resumo_dia is
  'Atividade por conversa na janela: contagens, nao conteudo. Base do resumo do dia.';

-- O navegador nao chama esta funcao: o PWA le tudo por fn_wa_painel.
revoke execute on function public.fn_wa_resumo_dia(timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Conferencia
-- ---------------------------------------------------------------------------
select count(*) as conversas_com_movimento_24h
  from public.fn_wa_resumo_dia(now() - interval '24 hours');
