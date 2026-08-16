# 💰 Finanças

PWA de finanças pessoais. Offline-first, com PIN, contas separadas (PF/PJ),
recorrências e sincronização opcional.

Publicado em <https://jsavinojspds-cyber.github.io/financas/>.

Migração do `index.html` único (React 18.2 inline, ~256 KB) para Vite + React +
TypeScript + Tailwind, mantendo o design neumorfismo roxo e os dados existentes.

---

## Rodar localmente

```bash
npm install
```

```bash
npm run dev
```

Abre em <http://localhost:5173/financas/> — o caminho `/financas/` importa: é o
mesmo `base` da produção, e o Service Worker só funciona dentro dele.

Outros comandos:

```bash
npm run build
```

```bash
npm run preview
```

```bash
npm run typecheck
```

## Publicar

`git push` na `main` dispara `.github/workflows/deploy.yml`, que roda typecheck,
build e publica em GitHub Pages.

Configure uma vez em **Settings → Pages → Source: GitHub Actions**.

## Regenerar assets

Os PNGs e as fontes ficam versionados em `public/`. Só é preciso rodar de novo
ao mudar `src/assets/icone.svg`:

```bash
npm run gen:icons
```

```bash
npm run gen:fonts
```

---

## Seus dados

### Migração automática do app antigo

Na primeira abertura o app procura, em ordem:

1. `fin-v5` — formato novo;
2. `fin-v4` + `fin-cats` — formato antigo, migrado na hora;
3. nada nos dois — carrega abril/2026 como base inicial.

**A chave `fin-v4` nunca é apagada.** Ela fica intacta no IndexedDB e no
localStorage como rede de segurança: se algo der errado, os dados originais
continuam lá.

O que a migração faz com cada lançamento:

| Situação no `fin-v4` | Resultado |
| --- | --- |
| `id` numérico (`Date.now()`) | vira UUID — ids numéricos colidiam ao copiar mês |
| Nome começa com "Savino" | vai para a conta **Savino Group**; o resto vai para **Pessoal** |
| `data_pgto` preenchida mas `pago: false` | passa a `pago: true` |
| Valor negativo | vira positivo (o sinal já vem do tipo receita/despesa) |
| Forma de pagamento desconhecida | vira `Dinheiro` |
| Sem nome, valor ou vencimento | descartado (não daria para exibir) |

A chave do mês é preservada como está. Isso é proposital: no dado real existem
compras com vencimento em maio dentro do bucket de abril — são da fatura do
cartão fechada em abril. O mês nunca é recalculado a partir do vencimento.

### Salvamento automático

O botão “💾 Salvar” não existe mais. Toda alteração agenda uma gravação
(~0,4 s de debounce) em IndexedDB com espelho no localStorage. O indicador no
cabeçalho mostra `Salvando` / `Salvo`, e vira um botão vermelho de nova
tentativa se os dois storages recusarem a escrita.

Três diferenças em relação ao app antigo, que gravava e torcia:

- a escrita no IndexedDB é aguardada de verdade (`tx.oncomplete`), então uma
  falha aparece em vez de sumir;
- `pagehide` e `visibilitychange` forçam o flush antes de o Safari suspender a
  aba — que era exatamente quando os dados se perdiam;
- nesse caminho de fechamento o localStorage é escrito primeiro, porque é
  síncrono e sempre completa.

### PIN

Guardado em IndexedDB, com localStorage como espelho. No app antigo ele vivia só
no localStorage: quando o Safari limpava o site por ITP, o PIN voltava
silenciosamente para `1234`. Agora o IndexedDB manda, e o localStorage é
reescrito a partir dele.

Padrão continua `1234` numa instalação nova. Troque em **⚙️ → Alterar PIN**.

---

## Sincronização (opcional)

O app funciona 100% offline sem nada disso. Ligar o Supabase só acrescenta o
espelho na nuvem.

1. Crie um projeto em <https://supabase.com>.
2. SQL Editor → cole e rode [`supabase/schema.sql`](supabase/schema.sql).
3. Authentication → Providers → deixe **Email** habilitado (login é por código
   de 6 dígitos, sem senha e sem redirect).
4. No app: **⚙️ → Sincronização** → cole *Project URL* e a chave *anon public*.

As credenciais ficam no storage do aparelho, **não no build**. O repositório do
GitHub Pages é público — uma chave embutida no bundle vazaria junto com o
código. Quem protege os dados é o RLS do `schema.sql`, que restringe cada linha
ao seu dono.

**Modelo de conflito:** o documento inteiro é sincronizado com last-write-wins
pelo campo `updatedAt`. Editar offline em dois aparelhos ao mesmo tempo faz o
último a sincronizar prevalecer. Para um app pessoal isso é previsível e fácil
de auditar; o backup JSON continua sendo a rede de segurança.

## Aba ☀️ Hoje — o resumo da manhã

Duas metades com origens diferentes, de propósito.

**A análise dos seus números é calculada no aparelho.** Contas vencendo,
atrasos, saldo projetado, o dia em que o caixa fica negativo, categoria acima
da média dos 3 meses anteriores, taxa de poupança, atrasos por conta. Nenhum
dado financeiro sai do iPhone, funciona offline e não custa nada por consulta.

**As cotações vêm de um arquivo estático**, `public/mercado.json`, gerado pelo
workflow `.github/workflows/mercado.yml` às 8h e às 11h de Manaus em dias
úteis. O app só lê o arquivo pronto — que entra no precache do Service Worker
e continua visível offline, com a idade do dado à vista.

O motivo do rodeio é CORS: Ibovespa e IFIX não têm fonte gratuita que o
navegador possa chamar direto. No servidor do Actions não há CORS, então o
problema desaparece. Fontes, todas abertas e sem chave:

| Indicador | Fonte |
| --- | --- |
| Ibovespa, IFIX | Yahoo Finance (`^BVSP`, `IFIX.SA`) |
| Dólar | AwesomeAPI — também atualizado ao vivo no app, é o único com CORS aberto |
| Selic, CDI, IPCA | Banco Central (SGS 11, 12, 433) |

Cada fonte é buscada de forma independente: uma API fora do ar não derruba o
briefing, e se nenhuma responder o `mercado.json` anterior permanece
publicado.

Duas decisões deliberadas:

- **O briefing não contém dados pessoais.** O `mercado.json` fica publicamente
  legível na URL do Pages — saldos e contas a pagar nunca entram ali.
- **O painel descreve, não recomenda.** Nada de "compre" ou "venda": a
  diferença entre resumo de mercado e recomendação de investimento importa, e
  esta segunda exige assessor certificado.

Para escrever prosa de IA sobre os seus números seria preciso enviá-los a um
servidor com a chave do modelo — uma chave no bundle vazaria, já que o
repositório é público. Esse caminho passa pelo Supabase, ainda não feito.

## Notificações

Locais, sem servidor: o Service Worker mostra um aviso com as contas a vencer
quando você abre o app ou volta para ele, no máximo uma vez por dia.

**Não chega com o app totalmente fechado.** Push real no iOS exige um servidor
enviando com VAPID — o que sairia do escopo "funciona offline, sem backend
obrigatório". Se um dia quiser isso, o caminho é uma Edge Function do Supabase
com `pg_cron`.

No iOS as notificações só funcionam com o app **instalado na tela de início**
(Compartilhar → Adicionar à Tela de Início), a partir do iOS 16.4.

---

## Estrutura

```
src/
├─ types.ts                 modelo de dados v5 e constantes de domínio
├─ App.tsx                  shell: header, contas, meses, abas
├─ sw.ts                    Service Worker (precache + offline + notificação)
├─ lib/                     formato (data/moeda), id (uuid), recorrência
├─ storage/
│  ├─ idb.ts                IndexedDB com await de verdade e timeout
│  ├─ persistir.ts          fila de auto-save + flush no pagehide
│  └─ migrar.ts             carga do estado e migração fin-v4 → fin-v5
├─ state/                   reducer, store (auto-save), seletores
├─ components/              primitivas neumórficas em Tailwind
├─ sync/                    Supabase opcional (carregado sob demanda)
└─ features/
   ├─ pin/ resumo/ lancamentos/ fluxo/ analise/
   ├─ anual/                resumo anual + barras receitas × despesas
   ├─ recorrencia/          lançamentos fixos
   ├─ contas/               seletor PF / PJ
   ├─ notificacoes/         avisos locais de vencimento
   ├─ sms/                  parser de notificação de compra
   └─ ajustes/              PIN, contas, backup, notificações, sync
```

### Decisões que valem explicar

- **React 18.3, não 19.** O app rodava em 18.2; 18.3 mantém o comportamento
  idêntico e é a versão mais testada em Safari iOS.
- **Tailwind 3, não 4.** O v4 exige Safari 16.4+ e recursos de CSS mais novos.
  Como a restrição do projeto é compatibilidade máxima com Safari, o v3 sai
  mais barato em risco sem custar nada em capacidade.
- **Gráficos em SVG escrito à mão.** Pizza e barras não justificam uma
  biblioteca de charts; do jeito que está, custam alguns KB.
- **Service Worker próprio, sem runtime do Workbox.** São três
  comportamentos (precache, fallback offline, clique na notificação); o SW
  final tem ~1,4 KB em vez de dezenas.
- **`supabase-js` por import dinâmico.** Sem sync configurado, o chunk de
  ~218 KB nunca é baixado no caminho crítico.
- **Fontes self-hospedadas.** O `index.html` original carregava DM Sans do
  `fonts.googleapis.com`: numa primeira abertura offline o app subia sem
  tipografia.

## Tamanho do bundle

| Arquivo | Bruto | Gzip |
| --- | --- | --- |
| `index.js` (app) | 112 KB | 30 KB |
| `react.js` | 141 KB | 45 KB |
| `index.css` | 22 KB | 5 KB |
| `supabase.js` (sob demanda) | 218 KB | 58 KB |

Caminho crítico: ~80 KB gzip, contra ~249 KB não comprimidos do arquivo único
anterior.
