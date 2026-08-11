-- 011_keyword_rotulo.sql — nome legivel para a keyword critica.
-- Depende de 001 a 010.
--
-- As keywords sao radicais de busca de proposito: 'rejei' casa com rejeicao,
-- rejeitada e rejeitou; 'devolu' casa com devolucao e devolvido. Isso e bom
-- para detectar e pessimo para mostrar.
--
-- O painel do iPhone estampava a etiqueta "rejei" em cima do cartao — no
-- exato momento em que o Jean precisa entender rapido o que travou. Radical
-- de busca e detalhe de implementacao; nao deve vazar para a tela.
--
-- `rotulo` e o nome que aparece. `termo` continua sendo o que casa.

alter table public.wa_keywords_criticas
  add column if not exists rotulo text;

comment on column public.wa_keywords_criticas.rotulo is
  'Nome exibido no painel. O termo e radical de busca e nao serve para leitura.';

update public.wa_keywords_criticas set rotulo = v.rotulo
  from (values
    ('ruptura',             'ruptura'),
    ('sem estoque',         'sem estoque'),
    ('falta de produto',    'falta de produto'),
    ('corte de pedido',     'corte de pedido'),
    ('pedido bloqueado',    'pedido bloqueado'),
    ('entrega parada',      'entrega parada'),
    ('rejei',               'rejeição fiscal'),
    ('nota fiscal',         'nota fiscal'),
    ('bloqueio de credito', 'bloqueio de crédito'),
    ('inadimpl',            'inadimplência'),
    ('devolu',              'devolução'),
    ('verba',               'verba'),
    ('fundo cooperado',     'fundo cooperado'),
    ('acordo comercial',    'acordo comercial'),
    ('tabela de pre',       'tabela de preço'),
    ('JBP',                 'JBP'),
    ('DDE',                 'DDE'),
    ('DDR',                 'DDR'),
    ('urgente',             'urgente'),
    ('hoje ainda',          'hoje ainda'),
    ('prazo final',         'prazo final'),
    ('ultimo dia',          'último dia'),
    ('vence hoje',          'vence hoje'),
    ('multa',               'multa'),
    ('auditoria',           'auditoria'),
    ('juridico',            'jurídico'),
    ('reclama',             'reclamação'),
    ('cancelamento',        'cancelamento')
  ) as v(termo, rotulo)
 where public.wa_keywords_criticas.termo = v.termo;

-- Keyword nova que alguem inserir sem rotulo cai de volta no termo, em vez
-- de aparecer vazia no painel.
update public.wa_keywords_criticas set rotulo = termo where rotulo is null;

alter table public.wa_keywords_criticas
  alter column rotulo set default '',
  alter column rotulo set not null;

-- ---------------------------------------------------------------------------
-- Conferencia: nenhum rotulo vazio, e o caso que motivou o arquivo.
-- ---------------------------------------------------------------------------
select
  (select count(*) from public.wa_keywords_criticas where rotulo = '' or rotulo is null) as sem_rotulo,
  (select rotulo from public.wa_keywords_criticas where termo = 'rejei')                 as exemplo_rejei,
  (select rotulo from public.wa_keywords_criticas where termo = 'tabela de pre')         as exemplo_tabela;
