#!/bin/bash
# instalar.sh — deixa o listener subindo sozinho no macOS, sem PM2.
#
# POR QUE NAO PM2
#
# Na instalacao de 31/08 o PM2 custou uma hora e nao entregou:
#
#   1. `pm2 start src/listener.js` entrou em loop de reinicio com os dois
#      logs vazios — ele lanca o script com o interpretador que o daemon
#      guardou, que nao era o Node do Homebrew.
#   2. `pm2 startup` mandou rodar um comando com `sudo`. O arquivo saiu
#      pertencendo ao root dentro de ~/Library/LaunchAgents. O launchd
#      RECUSA LaunchAgent de outro dono, em silencio: `launchctl load` nao
#      reclama e `launchctl list` fica vazio.
#   3. Depois de reiniciar, nada subiu.
#
# O launchd sozinho faz o que precisamos — sobe no login e reinicia se cair.
# Uma camada a menos e nenhum `sudo`.
#
# Uso:  bash macos/instalar.sh
set -euo pipefail

LABEL="com.wa-agent"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOGS="$HOME/Library/Logs"

# NUNCA rode este script com sudo — foi exatamente isso que quebrou antes.
if [ "$(id -u)" -eq 0 ]; then
  echo "ERRO: nao rode com sudo. O arquivo tem que pertencer a voce." >&2
  exit 1
fi

NODE="$(command -v node || true)"
if [ -z "$NODE" ]; then
  echo "ERRO: node nao encontrado no PATH." >&2
  exit 1
fi

if [ ! -f "$RAIZ/src/listener.js" ]; then
  echo "ERRO: nao achei $RAIZ/src/listener.js" >&2
  exit 1
fi

if [ ! -f "$RAIZ/.env" ]; then
  echo "ERRO: falta o .env em $RAIZ" >&2
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents" "$LOGS"

# Se ja existe, descarrega antes de reescrever.
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true

cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>

  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$RAIZ/src/listener.js</string>
  </array>

  <!-- O listener le o .env do diretorio atual. -->
  <key>WorkingDirectory</key>
  <string>$RAIZ</string>

  <key>RunAtLoad</key>
  <true/>

  <!-- Reinicia se cair. Substitui o que o PM2 fazia. -->
  <key>KeepAlive</key>
  <true/>

  <!-- Sem isso o launchd reinicia em rajada se algo estiver quebrado. -->
  <key>ThrottleInterval</key>
  <integer>10</integer>

  <key>StandardOutPath</key>
  <string>$LOGS/wa-agent.log</string>
  <key>StandardErrorPath</key>
  <string>$LOGS/wa-agent.err.log</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$(dirname "$NODE"):/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
</dict>
</plist>
PLISTEOF

chmod 644 "$PLIST"

# `bootstrap` e a forma atual. `load` e legada e falha em silencio.
launchctl bootstrap "gui/$(id -u)" "$PLIST"

echo
echo "Instalado: $PLIST"
echo "Logs:      $LOGS/wa-agent.log"
echo
echo "Conferindo..."
sleep 3
launchctl print "gui/$(id -u)/$LABEL" 2>/dev/null | grep -E '^\s+(state|pid) ' || \
  echo "AVISO: nao consegui ler o estado. Veja $LOGS/wa-agent.err.log"

# --- atalho `meuwa`, de qualquer pasta ---------------------------------------
# Sem isto o dia a dia exige lembrar do caminho do projeto antes de qualquer
# comando — que e onde a pessoa desiste.
ZSHRC="$HOME/.zshrc"
LINHA="alias meuwa='bash \"$RAIZ/bin/meuwa\"'"
if ! grep -qF "bin/meuwa" "$ZSHRC" 2>/dev/null; then
  { echo ""; echo "# WA-AGENT"; echo "$LINHA"; } >> "$ZSHRC"
  echo "Atalho 'meuwa' adicionado ao $ZSHRC"
else
  echo "Atalho 'meuwa' ja estava no $ZSHRC"
fi

echo
echo "Comandos do dia a dia (abra um terminal novo para o 'meuwa' valer):"
echo "  meuwa                                 # analisa e mostra o dia"
echo "  meuwa fila                            # so o que esta parado com voce"
echo "  meuwa status                          # a coleta esta viva?"
echo "  tail -f $LOGS/wa-agent.log            # acompanhar o listener"
echo "  launchctl kickstart -k gui/\$(id -u)/$LABEL   # reiniciar"
echo "  launchctl bootout gui/\$(id -u)/$LABEL        # parar e desinstalar"
