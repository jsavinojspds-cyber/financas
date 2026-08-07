# WA-AGENT

Espelha o WhatsApp para um banco proprio, classifica as conversas e entrega um
digest priorizado com rascunhos de resposta. Objetivo: separar pessoal de
comercial e parar de perder mensagem importante em meio a 20 grupos.

O contexto completo do projeto esta no `CLAUDE.md` na raiz do repositorio.
Leia antes de mexer em qualquer coisa aqui.

## O agente nao envia mensagem

Ele **le, classifica, resume e escreve rascunhos**. O envio e sempre manual,
pelo app, por voce.

Automacao via Baileys viola os Termos do WhatsApp, e o numero em risco e o seu
pessoal **e** comercial ao mesmo tempo. Modo passivo reduz muito a chance de
banimento. Ha uma trava em `src/listener.js` (`travarEnvio`) que neutraliza
`sendMessage`, `readMessages`, `sendPresenceUpdate` e afins em tempo de
execucao: se algum codigo tentar enviar, ele quebra alto em vez de expor o
numero silenciosamente.

## Estado

| Fase | Estado | O que e |
|---|---|---|
| 1 | pronta | Listener + schema + classificacao |
| 2 | pronta | `wa_rules` + SLA + os 13 grupos reais |
| 3 | pronta | Worker de triagem/resumo/sugestao (`src/worker.js`) |
| 3.5a | pronta | Leitura de imagem (`src/midia.js` + visao do Claude) |
| 3.5b | adiada | Transcricao de audio — pipeline de texto primeiro |
| 4 | proxima | PWA painel |
| 5 | pronta | Digest 3x/dia, 07h30 / 13h00 / 18h30 (`src/digest.js`) |
| 6 | pendente | Busca semantica pgvector |

## Instalacao

### 1. Supabase

Crie um projeto **dedicado**. Nao reaproveite a base corporativa da Duty: aqui
ha conversa de terceiros, e a separacao e decisao de LGPD.

No SQL Editor, rode em ordem:

```
sql/001_schema.sql        tabelas, triggers, RLS, expurgo 180d
sql/002_sla_e_regras.sql  politica de SLA + wa_rules + views
sql/003_grupos_reais.sql  os 13 grupos + RCAs + keywords criticas
sql/004_digest.sql        vw_wa_digest + contagens do painel
```

Os quatro sao idempotentes: rodar de novo nao duplica nada.

Depois, em Settings > API, copie a **service_role** key. Nao e a anon. O RLS
fica ligado sem policy publica, entao a anon key nao le nada de proposito.

### 2. VPS

Precisa de **IP brasileiro** — Oracle Cloud Sao Paulo ou Hostinger BR. IP
europeu com numero +55 e padrao classico de fraude para o WhatsApp e aumenta
muito o risco de banimento. O `provision.sh` verifica isso e para se o IP
estiver fora do Brasil.

```bash
git clone <este-repo> && cd financas/wa-agent
bash provision.sh
```

O script e idempotente e para com instrucao clara quando falta algo. Na
primeira execucao ele cria o `.env` e para para voce preencher:

```bash
nano .env          # SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY
bash provision.sh  # rode de novo
```

### 3. Parear

```bash
pm2 start ecosystem.config.cjs
pm2 logs wa-agent --lines 60      # o QR aparece aqui
```

No iPhone: **WhatsApp > Configuracoes > Aparelhos conectados > Conectar
aparelho**. O QR expira em ~60s e um novo e gerado sozinho.

Assim que conectar, o log mostra seu JID. Coloque em `MEU_JID` no `.env` — sem
ele, a deteccao de mencao a voce (`@`) nao funciona.

```bash
pm2 save && pm2 startup           # sobe sozinho apos reboot
```

### 4. Backup da sessao — faca agora

Perder `auth_info_baileys/` significa reparear via QR presencialmente.

```bash
tar czf ~/auth-backup-$(date +%F).tgz -C ~/wa-agent auth_info_baileys
```

## Uso

```bash
npm run status           # diagnostico da coleta
npm run classificar      # classificacao assistida por IA
npm run worker           # triagem: resumo + rascunho
npm run digest           # o painel do dia
pm2 logs wa-agent --lines 60
pm2 restart wa-agent
```

O `classificar` aplica `wa_rules` primeiro e so chama a IA no que sobrou.
Contato conhecido nao gasta token. A IA sugere, voce confirma:
`[Enter]` aceita, `e` edita, `p` pula, `q` sai.

### Worker de triagem (Fase 3)

Le a fila (`wa_messages.processed = false`), agrupa por conversa e grava resumo,
prioridade e rascunho em `wa_threads_analysis`.

```bash
npm run worker                       # processa ate 500 mensagens
npm run worker -- --dry-run          # mostra o que faria, sem gravar nem marcar
npm run worker -- --limit 100
npm run worker -- --chat '120363xxx@g.us'
npm run worker -- --sem-imagens      # nao baixa foto nenhuma
```

#### Imagens

Foto no canal comercial quase sempre e documento: tabela de preco, print de
pedido, nota fiscal, comprovante, gondola com ruptura, planilha fotografada da
tela. O worker baixa a imagem e manda para o Claude ler — nao existe servico de
terceiro nem chave nova, a visao e do proprio modelo.

Quem baixa e o **worker**, nao o listener:

- o listener fica enxuto, sem trafego extra amarrado ao socket vivo
- so conversa que vai para a IA baixa. Silenciada, pessoal e ruido nunca baixam
- nada e arquivado: o binario vive em memoria, vira leitura e e descartado.
  Fica a descricao no resumo, nao a foto

Limites, porque imagem custa token (~1.500 de entrada por foto):

| Limite | Valor |
|---|---|
| imagens por conversa, por rodada | 4, as mais recentes |
| tamanho maximo | 5MB (recusa antes de abrir conexao quando da) |
| formatos | jpeg, png, gif, webp |
| timeout do download | 20s |

**URL expirada.** O link de midia do WhatsApp nao dura para sempre. Se expirar,
a imagem se perde: o prompt marca `[imagem nao recuperada]` e o modelo e
instruido a dizer que o resumo esta incompleto, em vez de especular. Nao ha
pedido de reenvio porque isso e operacao de ENVIO, proibida aqui. Na pratica:
rode o worker no mesmo dia (o cron de 3x ao dia resolve).

**LGPD.** Para baixar depois, o `raw` de `wa_messages` guarda `mediaKey` e
`fileEncSha256` — ou seja, a chave de decriptacao da midia de terceiros. Some
no `fn_wa_purge_old`. E mais uma razao para este Supabase ser separado da base
corporativa.

Nem toda conversa vai para a IA. A ordem economiza token:

| Situacao | O que acontece |
|---|---|
| `bucket = pessoal` | nunca vai para a IA, sai da fila |
| silenciada ou `ruido` | so vai se bater keyword critica |
| `indefinido` / sem classificacao | **fica na fila** ate voce rodar `npm run classificar` |
| comercial ativa | vai para a IA |

Keyword critica forca prioridade 5 mesmo em grupo silenciado. E por isso que
CONEXAO DUTY entra `muted`: o ruido nao aparece, mas "ruptura" ou "verba" fura.

A mensagem so sai da fila **depois** que a analise grava. Se a API falhar no
meio, ela volta na proxima rodada em vez de sumir sem ter sido lida.

Agendar (a Fase 5 vai gerar o digest a partir daqui):

```cron
# 20 minutos antes de cada digest — horario de Manaus (GMT-4)
10 7,12,18 * * *  cd ~/wa-agent && /usr/bin/node src/worker.js >> logs/worker.log 2>&1
```

Confira o fuso da VPS antes: `timedatectl`. Se estiver em UTC, some 4 horas.

## Digest (Fase 5)

O painel do dia, no formato da secao 8 do CLAUDE.md. So le e imprime.

```bash
npm run digest                  # painel em texto
npm run digest -- --json        # mesma coisa em JSON, para a Fase 4
npm run digest -- --horas 12    # janela das contagens (padrao 24h)
npm run digest -- --largura 60  # para tela estreita
```

Saida:

```
PAINEL COMERCIAL — 06/08, 07h30

AGUARDANDO VOCÊ (2)
1. Scarletty (RO) — ruptura de 3 SKUs no distribuidor de Porto Velho.
   [rascunho pronto | ruptura]
   parado ha 1d 6h, SLA 8h (3.75x)
2. Mateus - Temporário — cobram tabela de julho desde ontem. Citou você 2x.
   [rascunho pronto]
   parado ha 18h00, SLA 4h (4.5x)

MONITORAR (1)
- Assaí Brasil - Duty: rejeicao fiscal de julho sem retorno (D+3) (5h00)

SILENCIADO (2 grupos, 3 mensagens, nada relevante)

---
RASCUNHOS (copie e envie você mesmo)

1. Scarletty (RO)
   Scarletty, quais os 3 SKUs? Me manda ate hoje 17h que eu falo com o CD.
```

**Ordem do painel:** keyword critica primeiro, depois estouro de SLA
**proporcional**, depois prioridade. Proporcional e nao absoluto: KA parado 5h
(SLA 4h, razao 1.25) vem antes de interno parado 26h (SLA 24h, razao 1.08).

**AGUARDANDO VOCE** so lista conversa onde a bola esta com voce *agora*:
`aguardando_jean` vem da analise, mas `last_message_from_me` vem do estado
atual. Se voce respondeu depois que o worker rodou, a conversa sai sozinha do
painel. O SLA tambem para de correr quando voce responde — o painel nao cobra
o que ja foi resolvido.

Agendar os tres horarios:

```cron
# 07h30, 13h00 e 18h30 de Manaus (GMT-4)
30 7  * * *  cd ~/wa-agent && /usr/bin/node src/digest.js >> logs/digest.log 2>&1
0  13 * * *  cd ~/wa-agent && /usr/bin/node src/digest.js >> logs/digest.log 2>&1
30 18 * * *  cd ~/wa-agent && /usr/bin/node src/digest.js >> logs/digest.log 2>&1
```

Ver o que saiu:

```sql
select c.nome, a.prioridade, a.assunto, a.aguardando_jean, a.rascunho
  from wa_threads_analysis a
  join wa_chats c on c.id = a.chat_id
 order by a.criado_em desc limit 20;
```

### SQL util

```sql
select fn_wa_apply_rules();                  -- aplica regras conhecidas
select * from vw_wa_inbox order by msg_count desc;
select * from vw_wa_sla_estourado;           -- ja ordenada por urgencia
select * from fn_wa_purge_old(180);          -- expurgo LGPD
```

`vw_wa_sla_estourado` ordena por estouro **proporcional**, nao por tempo
absoluto: KA parado 5h (SLA 4h, razao 1.25) vem antes de interno parado 26h
(SLA 24h, razao 1.08).

## Estrutura

```
wa-agent/
├── README.md
├── package.json
├── provision.sh           setup da VPS, idempotente
├── .env                   NUNCA commitar (chmod 600)
├── ecosystem.config.cjs   gerado pelo provision.sh, fora do git
├── sql/
│   ├── 001_schema.sql
│   ├── 002_sla_e_regras.sql
│   └── 003_grupos_reais.sql
└── src/
    ├── config.js          carrega e valida o .env
    ├── tempo.js           UTC no banco -> America/Manaus na saida
    ├── mensagem.js        normaliza o payload do Baileys
    ├── db.js              acesso ao Supabase, nunca lanca
    ├── claude.js          chamada a API + parse de JSON, com retry
    ├── midia.js           baixa e descriptografa imagem, sob demanda
    ├── listener.js        read-only, buffer 5s, reconexao exponencial
    ├── worker.js          triagem/resumo/sugestao (Fase 3)
    ├── digest.js          painel priorizado (Fase 5)
    ├── classificar.js     classificacao assistida (interativo)
    └── status.js          diagnostico da coleta
```

## Notas de campo

- **Aprovacao NENO/CO** usa mensagens temporarias de 7 dias. O `mensagem.js`
  desembrulha o `ephemeralMessage`, entao o listener preserva o que o WhatsApp
  apaga. Valor real de rastreabilidade em aprovacao de verba.
- **PA/AP - DUTY** ja teve "privacidade avancada da conversa" ativada.
  Monitorar se afeta a captura.
- **GERENCIA DUTY BRASIL** e **LIDERANCA COMERCIAL** tem padrao
  "comunicado -> 15x ciente". Alto ruido, conteudo eventual critico. Nao
  silencie: o resumo resolve.
- **CONEXAO DUTY** entra silenciado, mas as keywords criticas ainda furam o
  silencio.

## Diagnostico

**Coleta vazia.** Quase sempre e a anon key no lugar da service_role. O
`config.js` avisa no start. Confirme com `node src/status.js`.

**Parou de chegar mensagem.** `pm2 logs wa-agent --lines 50`. Se aparecer
`loggedOut`, a sessao caiu no aparelho: apague `auth_info_baileys/` e pareie de
novo.

**O iPhone parou de receber push.** Alguem mudou `markOnlineOnConnect` para
`true`. Volte para `false` e reinicie. Ver secao 3 do `CLAUDE.md`.

## Antes de reiniciar o PM2

```bash
npm run check    # node --check em todos os arquivos de src/
```
