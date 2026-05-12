# Meu Dia — Jean Savino

Assistente pessoal diário com clima, agenda, pendências, tarefas e entrada por voz.

## Instalação

```bash
cd "Meu dia"
npm install
```

## Configurar chave da API (para voz com IA)

```bash
cp .env.example .env
# Edite .env e coloque sua chave: VITE_ANTHROPIC_KEY=sk-ant-...
```

## Rodar localmente

```bash
npm run dev
```

Acesse `http://localhost:5173` no iPhone via Wi-Fi (mesmo rede) ou use o IP local mostrado no terminal.

## Instalar no iPhone (PWA)

1. Abra o endereço no **Safari**
2. Toque em **Compartilhar** → **Adicionar à Tela Inicial**
3. O app ficará disponível como ícone nativo

## Deploy (Vercel — recomendado)

```bash
npx vercel --cwd "Meu dia"
```

Defina a variável `VITE_ANTHROPIC_KEY` nas configurações do projeto no Vercel.

## Funcionalidades

| Seção | Descrição |
|---|---|
| Agenda Profissional | Eventos do dia (azul navy) |
| Agenda Pessoal | Eventos pessoais (âmbar) |
| Clima | Tempo real em Manaus via Open-Meteo |
| Pendências | Profissionais e pessoais com urgência |
| Tarefas | Com prioridade Alta / Média / Baixa |
| Resumo do dia | Diário salvo por data no localStorage |
| Entrada por voz | Web Speech API (pt-BR) + Claude IA |
