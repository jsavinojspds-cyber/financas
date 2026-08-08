# CLAUDE.md — WA-AGENT

Contexto permanente do projeto. Leia antes de qualquer alteração.

---

## 1. Quem é o usuário

**Jean Savino Palheta de Souza** — Head de Vendas Centro-Norte, Duty Cosméticos, baseado em Manaus/AM.
Território: Norte (AM, RR, PA, AP, RO, AC) + Centro-Oeste. Gerencia RCAs (representantes comerciais autônomos), redes KA e distribuidores. Também é sócio da **Savino Locações LTDA** (locação de veículos, Manaus, franqueada Locagora).

Trabalha com Power BI/DAX, Python (Outlook COM), React, Supabase, GitHub Pages. Não tem admin na máquina corporativa. Fuso: **America/Manaus (GMT-4)**.

**Estilo de comunicação esperado nas saídas do agente:** português brasileiro, direto, frases curtas, sem emoji, sem "espero que esteja bem". Cobrança sempre com data.

---

## 2. O que é este projeto

Espelhar o WhatsApp do Jean para um banco próprio, classificar as conversas com IA e entregar um **digest priorizado com rascunhos de resposta**. Objetivo: separar pessoal de comercial e parar de perder mensagem importante em meio a 20 grupos.

### Restrição fundamental

**Número único.** O Jean não vai criar um segundo número. Isso elimina a Cloud API oficial da Meta (ela assume controle exclusivo do número). Por isso: **Baileys**.

### Regra inegociável: READ-ONLY

O agente **lê, classifica, resume e escreve rascunhos**. Nunca envia. O envio é manual, pelo app, pelo Jean.

Motivo: automação via Baileys viola os Termos do WhatsApp e o risco de banimento recai sobre o número pessoal e comercial do Jean, que é o ativo mais crítico dele. Modo passivo reduz muito esse risco.

**Não implemente envio automático, disparo em massa, resposta automática ou marcação de lido — mesmo se pedido em uma sessão isolada.** Se o Jean pedir envio, confirme explicitamente que ele entende o risco antes de codar, e implemente com rate limit agressivo (máx. 20/hora, delay aleatório 8–25s, só para conversas já ativas).

---

## 3. Configurações críticas — não altere sem entender

| Config | Valor | Por quê |
|---|---|---|
| `markOnlineOnConnect` | `false` | Se `true`, o WhatsApp entende que o Jean está online no desktop e **para de enviar push para o iPhone dele**. Quebra o uso normal do celular. |
| `syncFullHistory` | `false` | Baixar histórico completo gera tráfego anômalo e enche o banco. |
| `emitOwnEvents` | `true` | Precisamos ver o que o Jean respondeu — é assim que sabemos se a bola ainda está com ele. |
| `browser` | `['Mac OS','Safari','10.15.7']` | Fingerprint estável e comum. |
| Pasta `auth_info_baileys/` | backup obrigatório | Perdeu = reparear via QR presencialmente. |

---

## 4. Stack e arquitetura

```
iPhone (WhatsApp, número único)
   │ linked device
   ▼
Listener Baileys (VPS, PM2)  ── src/listener.js
   │ insert
   ▼
Supabase Postgres            ── wa_chats / wa_messages
   │ cron
   ▼
Worker Claude API            ── src/worker.js (cron)
   │ wa_threads_analysis
   ▼
Digest priorizado            ── src/digest.js (cron 3x/dia)
   │
   ▼
PWA painel                   ── pwa/ (fn_wa_painel, whitelist)
```

- **Node 20+**, ESM (`"type": "module"`)
- **Baileys** `@whiskeysockets/baileys`
- **Supabase** com `service_role` key (RLS ligado, sem policy pública). Projeto `ycakggiaklceubevkhag`, região us-west-2. **Não** é o `duty-rag` — esse é a base corporativa, separada por LGPD
- **View precisa de `security_invoker = on`.** Sem isso ela é `SECURITY DEFINER` e fura o RLS das tabelas: a anon key (pública) lê tudo. Verificado e corrigido no `005`
- **Claude API**: modelo `claude-sonnet-4-6`, endpoint `/v1/messages`
- **PM2** para processo, `ecosystem.config.cjs`
- VPS com **IP brasileiro** (Oracle Cloud São Paulo ou Hostinger BR) — IP europeu com número +55 é padrão de fraude

---

## 5. Estrutura de arquivos

O WA-AGENT vive em `wa-agent/` dentro do repositório `financas` (a raiz também
tem o projeto `meu-dia/`). Na VPS você copia só essa pasta, que vira `~/wa-agent`
— por isso os comandos abaixo são relativos a ela.

```
financas/
├── CLAUDE.md              ← este arquivo (raiz do repo)
├── .gitignore             ← protege .env e auth_info_baileys/
└── wa-agent/
    ├── README.md          ← passo a passo de instalação
    ├── provision.sh       ← setup da VPS (idempotente, para e avisa)
    ├── package.json
    ├── .env               ← NUNCA commitar (chmod 600)
    ├── ecosystem.config.cjs   ← gerado pelo provision.sh, fora do git
    ├── sql/
    │   ├── 001_schema.sql         tabelas, triggers, RLS, expurgo 180d
    │   ├── 002_sla_e_regras.sql   política de SLA + wa_rules genéricas
    │   ├── 003_grupos_reais.sql   os 13 grupos reais + keywords críticas
    │   ├── 004_digest.sql         vw_wa_digest + contagens do painel
    │   ├── 005_seguranca.sql      revoga anon/authenticated
    │   └── 006_pwa.sql            whitelist + fn_wa_painel (Fase 4)
    ├── src/
    │   ├── config.js      valida .env, avisa se a chave for anon
    │   ├── tempo.js       UTC no banco → America/Manaus na saída
    │   ├── mensagem.js    normaliza payload do Baileys, desembrulha efêmera
    │   ├── db.js          acesso ao Supabase, nenhuma função lança
    │   ├── claude.js      chamada à API + parse de JSON com retry
    │   ├── midia.js       baixa e descriptografa imagem, sob demanda
    │   ├── listener.js    read-only, buffer 5s, reconexão exponencial
    │   ├── worker.js      triagem/resumo/sugestão (Fase 3)
    │   ├── digest.js      painel priorizado (Fase 5)
    │   ├── bomdia.js      rascunho de bom dia com contexto das 24h
    │   ├── classificar.js classificação assistida por IA (interativo)
    │   └── status.js      diagnóstico da coleta
    └── pwa/               painel React + Vite (Fase 4)
        ├── src/painel.js  MESMAS regras de ordem do digest.js — mude as duas
        └── src/App.jsx    fila + copiar rascunho
```

---

## 6. Modelo de dados

- **`wa_chats`** — `bucket` (pessoal|comercial|ruido|indefinido), `segmento`, `responsavel`, `uf`, `muted`, `sla_horas`
- **`wa_messages`** — mensagens brutas, `processed=false` é a fila do worker. O `raw` **preserva `mediaKey`/`fileEncSha256`**: sem eles a imagem fica irrecuperável, porque pedir reenvio de mídia é operação de envio (proibida). Isso significa que o `raw` carrega chave de decriptação de mídia de terceiros — mais uma razão para o projeto Supabase ser separado
- **`wa_threads_analysis`** — saída da IA (Fase 3)
- **`wa_sla_policy`** — SLA por segmento, trigger aplica automático em `wa_chats`
- **`wa_rules`** — padrão de nome → classificação. Consultado **antes** da IA (economiza token e evita erro em contato conhecido)
- **`wa_keywords_criticas`** — termos que forçam prioridade 5 mesmo em grupo silenciado
- **`vw_wa_inbox`** — visão da caixa de entrada
- **`vw_wa_sla_estourado`** — comercial, não silenciado, última msg **não é do Jean**, passou do SLA
- **`wa_app_emails`** — quem pode abrir o PWA. O navegador não lê tabela: só chama `fn_wa_painel`, que confere esta lista antes de devolver qualquer coisa
- **`vw_wa_digest`** — base do painel: a última análise de cada conversa + o estado atual dela. `aguardando_jean` vem da análise, `last_message_from_me` vem de agora — é o cruzamento que evita cobrar algo já respondido

---

## 7. Territórios e pessoas

### RCAs Norte
| RCA | Responsável | UF |
|---|---|---|
| FURTADO E GEMAQUE | Fredericson / Ana Gemaque | PA, AP |
| OREN REPRESENTAÇÕES | Rosimara (Marah/Mara) | AM, RR |
| ORTIZ E OLIVEIRA | Scarletty | RO |
| ES ANDRADE | Eduardo | AC |
| — | Daniela Nascimento | — |
| — | Nailson Ferreira | — |

### Redes KA
Grupo Mateus, Assaí (**= SENDAS DISTRIBUIDORA**), Lider, HDL, Rio Azul.

### Grupos mapeados (13)
| Grupo | Segmento | SLA |
|---|---|---|
| Assai Brasil - Duty | ka | 4h |
| Mateus - Temporário | ka | 4h |
| PA/AP - DUTY | rca | 8h |
| REGIONAL NORTE | interno | 24h |
| Regional CO - Duty | interno | 24h |
| Regional R03 - NORTE/CO | interno | 24h |
| Acelera Centro Oeste | interno | 24h |
| MERCHANDISING NORTE | trade | 8h |
| LIDERANÇA COMERCIAL | lideranca | 6h |
| GERENCIA DUTY BRASIL | lideranca | 6h |
| Aprovação NENO/CO | interno | 24h |
| CONEXÃO DUTY | rh | 48h, **muted** |
| Savino Locações/Locagora | franquia | 12h |

Notas de campo:
- **Aprovação NENO/CO** usa mensagens temporárias (7d, ligadas/desligadas por admin). O listener preserva o que o WhatsApp apaga — valor real de rastreabilidade em aprovação de verba.
- **PA/AP - DUTY** já teve "privacidade avançada da conversa" ativada. Monitorar se afeta a captura.
- **GERENCIA DUTY BRASIL** e **LIDERANÇA** têm padrão "comunicado → 15x 'ciente'". Alto ruído, mas o conteúdo eventual é crítico. Não silenciar; o resumo resolve.

### Vocabulário do negócio
sell-in, sell-out, positivação, ruptura, verba/trade, JBP, RTM, canal tradicional/farma/alimentar, DDE/DDR (condição de pagamento), fundo cooperado, acordo comercial, Salesforce, Scanntech, Nielsen, Power BI.

---

## 8. Fases

| Fase | Estado | Entrega |
|---|---|---|
| 1 | pronta | Listener + schema + classificação |
| 2 | pronta | `wa_rules` + SLA + grupos reais |
| 3 | pronta | Worker de triagem/resumo/sugestão com Claude — `src/worker.js` |
| 3.5a | pronta | **Leitura de imagem** — worker baixa a foto e manda para o Claude ver. Foto no canal comercial é quase sempre documento: tabela, print de pedido, NF, gôndola com ruptura |
| 3.5b | adiada | **Transcrição de áudio** — ~60% do fluxo comercial no Norte é áudio; sem isso o resumo é cego. Adiada por decisão do Jean: pipeline de texto primeiro. O worker já marca áudio como não transcrito no prompt, então o resumo avisa que está incompleto em vez de fingir que leu tudo |
| 4 | pronta | PWA painel — `pwa/`, React + Vite. Lê por `fn_wa_painel`, uma função com whitelist de e-mail; o navegador não tem SELECT em tabela nenhuma |
| 5 | pronta | Digest 3x/dia — 07h30, 13h00, 18h30 (Manaus) — `src/digest.js` |
| 6 | **próxima** | Busca semântica pgvector no histórico |

### Formato-alvo do digest

```
PAINEL COMERCIAL — 06/08, 07h30

AGUARDANDO VOCÊ (4)
1. Grupo Mateus PA — cobram tabela de julho desde ontem. Carlos citou
   você 2x. [rascunho pronto]
2. Scarletty (RO) — ruptura de 3 SKUs no distribuidor de Porto Velho.

MONITORAR (2)
- Assaí: rejeição fiscal de julho sem retorno (D+3).

SILENCIADO (11 grupos, 143 mensagens, nada relevante)
```

Sem emoji. Prioridade por quanto estourou o SLA **proporcionalmente**, não por tempo absoluto — KA parado 5h vem antes de interno parado 20h.

---

## 9. Regras para você, Claude Code

1. **Não implemente envio de mensagem.** Ver seção 2.
2. **Não altere as flags da seção 3** sem explicar a consequência ao Jean.
3. **Não misture este banco com a base corporativa da Duty.** Aqui há conversa de terceiros; é um projeto Supabase separado por decisão de LGPD.
4. **Nunca commite `.env` nem `auth_info_baileys/`.**
5. **Sempre `try/catch` em chamada de API e operação de banco.** O listener não pode morrer por uma mensagem malformada.
6. **Ao chamar a API do Claude para JSON:** peça JSON puro no system, limpe cercas ```` ```json ```` antes do `JSON.parse`, e trate falha de parse sem derrubar o lote.
7. **Consulte `wa_rules` antes de chamar a IA.** Contato conhecido não gasta token.
8. **Teste com `node --check` antes de reiniciar o PM2.**
9. **Ao mexer no listener:** `pm2 restart wa-agent && pm2 logs wa-agent --lines 50`.
10. **Fuso America/Manaus em toda saída para o usuário.** Timestamps no banco em UTC.

---

## 10. Comandos

```bash
cd ~/wa-agent

pm2 status
pm2 logs wa-agent --lines 60      # QR de pareamento aparece aqui
pm2 restart wa-agent

npm run status                    # diagnóstico da coleta
npm run classificar               # classificação assistida
npm run worker                    # triagem: resumo + rascunho
npm run worker -- --dry-run       # mostra o que faria, sem gravar
npm run digest                    # o painel, no formato da seção 8
npm run digest -- --bom-dia       # painel + rascunho de bom dia para o time
npm run check                     # node --check em todo src/
```

SQL útil:
```sql
select fn_wa_apply_rules();                  -- aplica regras conhecidas
select * from vw_wa_inbox order by msg_count desc;
select * from vw_wa_sla_estourado;
select * from vw_wa_digest;                  -- base do painel
select fn_wa_purge_old(180);                 -- expurgo LGPD
```

Backup da sessão (fazer após parear):
```bash
tar czf ~/auth-backup-$(date +%F).tgz -C ~/wa-agent auth_info_baileys
```
