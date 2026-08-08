# Painel PWA — Fase 4

A fila priorizada no iPhone, com os rascunhos a um toque de distância.
Lê e copia. **Não envia** — igual ao resto do projeto.

## Como o acesso funciona

O problema: o navegador não pode carregar a `service_role`. Ela ignora RLS e
dá acesso total; qualquer um leria no devtools. E o `005_seguranca.sql` revogou
`anon` e `authenticated` de todas as tabelas, de propósito.

A saída não foi afrouxar aquilo. Foi abrir uma porta estreita:

```
navegador (anon key, pública)
   │ login por link no e-mail — Supabase Auth
   ▼
sessão authenticated
   │ pode chamar UMA função, e mais nada
   ▼
fn_wa_painel()  ← confere wa_app_emails antes de ler qualquer coisa
   │
   ▼
painel pronto em JSON
```

O PWA **não tem SELECT em tabela nenhuma**. Só permissão de executar a função.
E ela devolve apenas a análise já resumida — mensagem bruta de terceiro nunca
trafega para o navegador.

`fn_wa_painel` é `SECURITY DEFINER` de propósito, e esse é o uso correto do
recurso: ela verifica quem está chamando **antes** de ler. É o oposto do furo
que o `005` corrigiu, onde as views eram definer sem verificação nenhuma.

## Instalar

### 1. Rodar o SQL

No SQL Editor do Supabase: `../sql/006_pwa.sql`.

Ele cria a whitelist já com o e-mail do Jean. Para autorizar outra pessoa:

```sql
insert into wa_app_emails (email, nota) values ('outro@email.com', 'quem é');
```

### 2. Ligar o login por e-mail

No painel Supabase: **Authentication > Providers > Email**, com
**Confirm email** ligado. Não precisa de senha — o app usa link mágico (OTP).

Em **Authentication > URL Configuration**, ponha a URL de produção em
**Site URL** e em **Redirect URLs**. Sem isso o link do e-mail volta para
`localhost` e não abre no iPhone.

### 3. Configurar e rodar

```bash
cp .env.example .env
# VITE_SUPABASE_ANON_KEY = painel > Settings > API > anon/public
npm install
npm run dev
```

A chave aqui é a **anon**, não a service_role. Ela vai para o bundle e é
pública por design — a proteção é o passo 1.

### 4. Publicar

```bash
npm run build          # sai em dist/
```

Qualquer host estático serve. Na Vercel, aponte para `wa-agent/pwa` e defina
`VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` nas variáveis do projeto.

Depois de publicar, volte no passo 2 e ajuste a Site URL.

### 5. Instalar no iPhone

Abra o endereço no **Safari** → **Compartilhar** → **Adicionar à Tela de
Início**. Vira ícone nativo, abre em tela cheia, sem barra do navegador.

## O que aparece

- **Aguardando você** — cartões ordenados por keyword crítica, depois estouro
  de SLA proporcional, depois prioridade. Cada um com resumo, selo de quantas
  vezes passou do SLA, e botão de copiar o rascunho.
- **Monitorar** — não exige resposta sua, mas não pode sumir de vista.
- **Silenciado** — só a contagem.

A ordem é a mesma do `npm run digest`. As regras vivem em `src/painel.js`,
espelhando `../src/digest.js` — **se mudar uma, mude a outra.**

## Detalhes que importam

**Nada de cache na API.** O service worker guarda só o shell do app. A chamada
ao Supabase é sempre `NetworkOnly` — painel velho é pior que painel nenhum.

**Fuso.** Toda hora exibida é America/Manaus, como no resto do projeto.

**Copiar no iOS.** Usa a Clipboard API, com queda para `execCommand` no Safari
antigo. Sempre dentro do toque do usuário, que é o que o iOS exige.

**Números do Postgres.** `numeric` chega como string no JSON. O `painel.js`
converte antes de comparar — senão `"1.08" > 1` dá resultado errado.
