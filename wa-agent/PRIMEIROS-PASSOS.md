# Primeiros passos

Checklist de uma vez só, na ordem. Depois disso use o `README.md`, que é a
referência do dia a dia.

Cada etapa tem um jeito de saber se deu certo. Se uma falhar, pare ali — as
seguintes dependem dela.

---

## 1. Node 20 ou superior

```bash
node --version
```

Sem admin na máquina? Baixe o **zip portátil** em nodejs.org (não o
instalador), descompacte numa pasta sua e adicione ao PATH da sessão. Não
precisa de permissão de administrador.

---

## 2. Clonar o branch certo

O código **não está no `main`**. Está em `claude/wa-agent-context-b1048d`.

```bash
git clone https://github.com/jsavinojspds-cyber/financas.git
cd financas
git checkout claude/wa-agent-context-b1048d
cd wa-agent
npm install
```

**Confere:** `ls src/` mostra 11 arquivos `.js`.

---

## 3. Preencher o `.env`

```bash
cp .env.example .env
chmod 600 .env
```

Edite e preencha:

| Variável | Onde achar |
|---|---|
| `SUPABASE_URL` | `https://ycakggiaklceubevkhag.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Painel Supabase > Settings > API > **service_role** (a secreta, não a anon) |
| `ANTHROPIC_API_KEY` | console.anthropic.com. **Opcional agora** — só os passos 8 em diante usam |

O `.env` já está no `.gitignore`. Nunca commite.

---

## 4. Testar o banco — antes de tocar no WhatsApp

```bash
npm run testar
```

Escreve uma conversa e uma mensagem de teste, confere triggers e regras,
verifica o digest, apaga tudo.

**Confere:** termina com `N verificacoes, nenhuma falha.`

Se falhar no passo 2 do teste, quase sempre é a anon key no lugar da
service_role. O RLS está ligado sem policy: a anon não escreve nada.

O banco já está aplicado e verificado — as 5 migrations rodaram, 25 regras,
28 keywords, 8 políticas de SLA. Você não precisa rodar SQL nenhum.

> Se o projeto tiver pausado por inatividade (plano free pausa após alguns
> dias), o painel mostra "Paused". Clique em **Restore** e espere ~2 minutos.

---

## 5. Parear o WhatsApp

```bash
npm start
```

O QR aparece no terminal. No iPhone:
**WhatsApp > Configurações > Aparelhos conectados > Conectar aparelho**

O QR expira em ~60s e um novo é gerado sozinho. Sem pressa.

**Confere:** o log mostra `conectado, escutando (read-only)`.

Logo depois ele imprime seu JID. Copie para `MEU_JID` no `.env` e reinicie —
sem isso a detecção de menção a você (`@`) não funciona.

---

## 6. Backup da sessão — faça agora, não depois

Perder `auth_info_baileys/` significa parear tudo de novo, presencialmente.

```bash
tar czf ~/auth-backup-$(date +%F).tgz -C . auth_info_baileys
```

---

## 7. Deixar coletando

Deixe rodando algumas horas, ou um dia. Quanto mais conversa entrar, melhor
fica a classificação e o resumo.

```bash
npm run status
```

**Confere:** mostra mensagens no banco e a última recebida há poucos minutos.

---

## 8. Classificar o que as regras não pegaram

Precisa da `ANTHROPIC_API_KEY`.

```bash
npm run classificar
```

Os 13 grupos mapeados já entram classificados por regra, sem gastar token. Isto
aqui é para o que sobrou — contatos 1:1 e grupos fora da lista.

`[Enter]` aceita, `e` edita, `p` pula, `q` sai.

---

## 9. Rodar a triagem

```bash
npm run worker -- --dry-run   # mostra o que faria, sem gravar
npm run worker                # pra valer
```

**Confere:** imprime prioridade, assunto e rascunho por conversa.

---

## 10. Ver o painel

```bash
npm run digest
npm run digest -- --bom-dia   # com o rascunho de bom dia para o time
```

É o formato da seção 8 do `CLAUDE.md`: aguardando você, monitorar, silenciado,
e os rascunhos prontos para copiar.

---

## Depois, quando quiser 24/7

Só aí vale montar a VPS (`provision.sh` cuida do resto) e agendar worker e
digest no cron. Enquanto for teste, sua máquina serve — estando você em
Manaus, o IP residencial brasileiro é até um sinal melhor para o WhatsApp que
um IP de datacenter.

Ao migrar, **pareie de novo na VPS** em vez de copiar `auth_info_baileys/`: a
mesma sessão saltando de IP chama atenção.

---

## Lembrete

O agente **lê e escreve rascunho. Nunca envia.** Todo envio é você, pelo app.
Há uma trava em `src/listener.js` que bloqueia envio em tempo de execução.
