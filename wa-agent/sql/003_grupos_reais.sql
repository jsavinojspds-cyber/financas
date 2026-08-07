-- 003_grupos_reais.sql — os 13 grupos mapeados, RCAs, redes KA e keywords
-- Depende de 002_sla_e_regras.sql.
--
-- Os padroes usam regex case-insensitive (~*) onde ha acento, para casar
-- tanto "Assai" quanto "Assai" com til, "Aprovacao" quanto "Aprovacao" com
-- cedilha etc. O nome do grupo no WhatsApp pode ser editado por qualquer
-- admin, entao o padrao e sempre o pedaco estavel do nome, nao o nome inteiro.
--
-- sla_horas NAO e definido aqui: o trigger tg_wa_chats_sla busca em
-- wa_sla_policy a partir do segmento.

-- ---------------------------------------------------------------------------
-- Os 13 grupos da secao 7 do CLAUDE.md
-- ---------------------------------------------------------------------------
insert into public.wa_rules (padrao, tipo_match, bucket, segmento, responsavel, uf, muted, prioridade, nota) values
  -- KA (SLA 4h)
  ('Assa[ií].*Duty|Duty.*Assa[ií]', 'regex', 'comercial', 'ka', null, null, false, 200,
   'Assai Brasil - Duty. Assai = SENDAS DISTRIBUIDORA.'),
  ('Mateus',                        'regex', 'comercial', 'ka', null, null, false, 200,
   'Mateus - Temporario. Grupo recriado periodicamente, o padrao pega qualquer versao.'),

  -- RCA (SLA 8h)
  ('PA/AP.*DUTY',                   'regex', 'comercial', 'rca', 'Fredericson / Ana Gemaque', 'PA', false, 200,
   'PA/AP - DUTY. Ja teve privacidade avancada da conversa ativada: monitorar se afeta a captura.'),

  -- Interno (SLA 24h)
  ('REGIONAL NORTE',                'regex', 'comercial', 'interno', null, null, false, 200, 'REGIONAL NORTE'),
  ('Regional CO.*Duty',             'regex', 'comercial', 'interno', null, null, false, 200, 'Regional CO - Duty'),
  ('Regional R03',                  'regex', 'comercial', 'interno', null, null, false, 200, 'Regional R03 - NORTE/CO'),
  ('Acelera Centro Oeste',          'regex', 'comercial', 'interno', null, null, false, 200, 'Acelera Centro Oeste'),
  ('Aprova[cç][aã]o NENO',          'regex', 'comercial', 'interno', null, null, false, 200,
   'Aprovacao NENO/CO. Usa mensagens temporarias de 7 dias, ligadas/desligadas por admin. O listener preserva o que o WhatsApp apaga: rastreabilidade de aprovacao de verba.'),

  -- Trade (SLA 8h)
  ('MERCHANDISING NORTE',           'regex', 'comercial', 'trade', null, null, false, 200, 'MERCHANDISING NORTE'),

  -- Lideranca (SLA 6h)
  ('LIDERAN[CÇ]A COMERCIAL',        'regex', 'comercial', 'lideranca', null, null, false, 200,
   'LIDERANCA COMERCIAL. Padrao "comunicado -> 15x ciente". Alto ruido, conteudo eventual critico. NAO silenciar: o resumo resolve.'),
  ('GER[EÊ]NCIA DUTY BRASIL',       'regex', 'comercial', 'lideranca', null, null, false, 200,
   'GERENCIA DUTY BRASIL. Mesmo padrao de ruido da LIDERANCA. NAO silenciar.'),

  -- RH (SLA 48h, silenciado)
  ('CONEX[AÃ]O DUTY',               'regex', 'ruido', 'rh', null, null, true, 200,
   'CONEXAO DUTY. Comunicacao institucional. Silenciado, mas keywords criticas ainda furam o silencio.'),

  -- Franquia (SLA 12h)
  ('Savino|Locagora',               'regex', 'comercial', 'franquia', 'Jean Savino', 'AM', false, 200,
   'Savino Locacoes / Locagora. Negocio proprio, fora da Duty.')
on conflict (padrao, aplica_em) do update
  set bucket      = excluded.bucket,
      segmento    = excluded.segmento,
      responsavel = excluded.responsavel,
      uf          = excluded.uf,
      muted       = excluded.muted,
      prioridade  = excluded.prioridade,
      nota        = excluded.nota,
      tipo_match  = excluded.tipo_match;

-- ---------------------------------------------------------------------------
-- RCAs Norte — conversas 1:1 e grupos nominais.
-- Prioridade 150: perde para grupo nominal (200), ganha de generico (100).
-- ---------------------------------------------------------------------------
insert into public.wa_rules (padrao, tipo_match, bucket, segmento, responsavel, uf, muted, prioridade, nota) values
  ('FURTADO|GEMAQUE|Fredericson',        'regex', 'comercial', 'rca', 'Fredericson / Ana Gemaque', 'PA', false, 150, 'RCA FURTADO E GEMAQUE - PA/AP'),
  ('OREN|Rosimara|Marah|\mMara\M',       'regex', 'comercial', 'rca', 'Rosimara',                  'AM', false, 150, 'RCA OREN REPRESENTACOES - AM/RR'),
  ('ORTIZ|Scarletty',                    'regex', 'comercial', 'rca', 'Scarletty',                 'RO', false, 150, 'RCA ORTIZ E OLIVEIRA - RO'),
  ('ES ANDRADE',                         'regex', 'comercial', 'rca', 'Eduardo',                   'AC', false, 150, 'RCA ES ANDRADE - AC'),
  ('Daniela Nascimento',                 'regex', 'comercial', 'rca', 'Daniela Nascimento',        null, false, 150, 'RCA Norte'),
  ('Nailson Ferreira',                   'regex', 'comercial', 'rca', 'Nailson Ferreira',          null, false, 150, 'RCA Norte')
on conflict (padrao, aplica_em) do update
  set bucket      = excluded.bucket,
      segmento    = excluded.segmento,
      responsavel = excluded.responsavel,
      uf          = excluded.uf,
      prioridade  = excluded.prioridade,
      nota        = excluded.nota,
      tipo_match  = excluded.tipo_match;

-- ---------------------------------------------------------------------------
-- Redes KA — qualquer conversa que cite a rede entra como KA.
-- Prioridade 120: abaixo do RCA nominal, acima do generico.
-- ---------------------------------------------------------------------------
insert into public.wa_rules (padrao, tipo_match, bucket, segmento, responsavel, uf, muted, prioridade, nota) values
  ('SENDAS',            'regex', 'comercial', 'ka', null, null, false, 120, 'Assai = SENDAS DISTRIBUIDORA'),
  ('\mLider\M|L[ií]der','regex', 'comercial', 'ka', null, null, false, 120, 'Rede Lider'),
  ('\mHDL\M',           'regex', 'comercial', 'ka', null, null, false, 120, 'Rede HDL'),
  ('Rio Azul',          'regex', 'comercial', 'ka', null, null, false, 120, 'Rede Rio Azul')
on conflict (padrao, aplica_em) do update
  set bucket     = excluded.bucket,
      segmento   = excluded.segmento,
      prioridade = excluded.prioridade,
      nota       = excluded.nota,
      tipo_match = excluded.tipo_match;

-- ---------------------------------------------------------------------------
-- Ruido conhecido — nao vale token de IA
-- ---------------------------------------------------------------------------
-- aplica_em='jid' precisa vir no proprio INSERT: a constraint unica e
-- (padrao, aplica_em), entao corrigir depois por UPDATE colide na segunda
-- execucao do arquivo.
insert into public.wa_rules (padrao, tipo_match, aplica_em, bucket, segmento, muted, prioridade, nota) values
  ('^status@broadcast$', 'regex', 'jid', 'ruido', null, true, 300, 'Status/stories do WhatsApp'),
  ('@newsletter$',       'regex', 'jid', 'ruido', null, true, 300, 'Canais do WhatsApp')
on conflict (padrao, aplica_em) do update
  set bucket     = excluded.bucket,
      muted      = excluded.muted,
      prioridade = excluded.prioridade,
      nota       = excluded.nota,
      tipo_match = excluded.tipo_match;

-- ---------------------------------------------------------------------------
-- Keywords criticas — forcam prioridade 5 mesmo em grupo silenciado.
-- Vocabulario da secao 7 do CLAUDE.md.
-- ---------------------------------------------------------------------------
insert into public.wa_keywords_criticas (termo, categoria, nota) values
  ('ruptura',            'operacao',  'Falta de produto na ponta. Perde venda todo dia parado.'),
  ('sem estoque',        'operacao',  null),
  ('falta de produto',   'operacao',  null),
  ('corte de pedido',    'operacao',  null),
  ('pedido bloqueado',   'operacao',  null),
  ('entrega parada',     'operacao',  null),

  ('rejei',              'fiscal',    'Casa com rejeicao/rejeitada. Rejeicao fiscal trava faturamento.'),
  ('nota fiscal',        'fiscal',    null),
  ('bloqueio de credito','fiscal',    null),
  ('inadimpl',           'fiscal',    'Casa com inadimplencia/inadimplente.'),
  ('devolu',             'fiscal',    'Casa com devolucao/devolvido.'),

  ('verba',              'comercial', 'Verba/trade. Aprovacao costuma ter prazo curto.'),
  ('fundo cooperado',    'comercial', null),
  ('acordo comercial',   'comercial', null),
  ('tabela de pre',      'comercial', 'Casa com tabela de preco/precos.'),
  ('JBP',                'comercial', 'Joint Business Plan'),
  ('DDE',                'comercial', 'Condicao de pagamento'),
  ('DDR',                'comercial', 'Condicao de pagamento'),

  ('urgente',            'prazo',     null),
  ('hoje ainda',         'prazo',     null),
  ('prazo final',        'prazo',     null),
  ('ultimo dia',         'prazo',     null),
  ('vence hoje',         'prazo',     null),
  ('multa',              'prazo',     null),

  ('auditoria',          'risco',     null),
  ('juridico',           'risco',     null),
  ('reclama',            'risco',     'Casa com reclamacao/reclamando.'),
  ('cancelamento',       'risco',     null)
on conflict (termo) do update
  set categoria = excluded.categoria,
      nota      = excluded.nota,
      ativo     = true;

-- Aplica tudo no que ja foi coletado.
select * from public.fn_wa_apply_rules();
