#!/usr/bin/env bash
# provision.sh — prepara a VPS para rodar o wa-agent.
#
# Idempotente: rodar de novo nao quebra nada. Quando encontra decisao que
# nao pode tomar sozinho (chave faltando, IP fora do Brasil), PARA e AVISA
# em vez de adivinhar.
#
# Uso, na VPS, como usuario normal (nao root):
#   cd ~/wa-agent && bash provision.sh

set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$RAIZ"

ok()    { printf '  [ok]   %s\n' "$1"; }
info()  { printf '  [..]   %s\n' "$1"; }
aviso() { printf '  [!]    %s\n' "$1"; }
parar() { printf '\n  [PARA] %s\n\n' "$1"; exit 1; }

echo
echo "wa-agent — provisionamento"
echo "=========================="

# --- 1. usuario -------------------------------------------------------------
echo
echo "1. Usuario"
if [ "$(id -u)" -eq 0 ]; then
  parar "Nao rode como root. Crie um usuario normal:
         adduser jean && usermod -aG sudo jean && su - jean"
fi
ok "rodando como $(whoami)"

# --- 2. Node ----------------------------------------------------------------
echo
echo "2. Node.js"
if ! command -v node >/dev/null 2>&1; then
  parar "Node nao encontrado. Instale a 20 ou superior:
         curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
         sudo apt-get install -y nodejs"
fi

NODE_MAJOR="$(node -v | sed 's/^v\([0-9]*\).*/\1/')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  parar "Node $(node -v) e antigo demais. O projeto exige 20+."
fi
ok "node $(node -v)"

# --- 3. IP brasileiro -------------------------------------------------------
# IP europeu com numero +55 e padrao classico de fraude para o WhatsApp.
# Isso aumenta muito a chance de banimento do numero do Jean.
echo
echo "3. Localizacao do IP"
PAIS="$(curl -fsS --max-time 8 https://ipinfo.io/country 2>/dev/null | tr -d '[:space:]' || echo '')"

if [ -z "$PAIS" ]; then
  aviso "nao consegui verificar o IP. Confirme a mao que a VPS esta no Brasil."
elif [ "$PAIS" != "BR" ]; then
  parar "A VPS esta em '$PAIS', nao no Brasil.
         Numero +55 conectando de IP estrangeiro e padrao de fraude para o
         WhatsApp e aumenta muito o risco de banir o numero do Jean.
         Use Oracle Cloud Sao Paulo ou Hostinger BR.
         Se voce entende o risco e quer seguir: PULAR_IP=1 bash provision.sh"
else
  ok "IP no Brasil (BR)"
fi

if [ "${PULAR_IP:-0}" = "1" ] && [ "$PAIS" != "BR" ]; then
  aviso "verificacao de IP pulada por PULAR_IP=1. Risco assumido."
fi

# --- 4. dependencias --------------------------------------------------------
echo
echo "4. Dependencias"
if [ ! -f package.json ]; then
  parar "package.json nao encontrado. Voce esta na pasta certa?"
fi

if [ -d node_modules ]; then
  ok "node_modules ja existe"
else
  info "instalando (pode demorar alguns minutos)..."
  npm install --omit=dev
  ok "dependencias instaladas"
fi

# --- 5. .env ----------------------------------------------------------------
echo
echo "5. Configuracao"
if [ ! -f .env ]; then
  cp .env.example .env
  chmod 600 .env
  parar "Criei o .env a partir do .env.example.
         Preencha SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY e rode de novo:
           nano .env && bash provision.sh"
fi

chmod 600 .env
ok ".env presente (permissao 600)"

# shellcheck disable=SC1091
set +u
. ./.env
set -u

FALTA=""
[ -z "${SUPABASE_URL:-}" ]              && FALTA="$FALTA SUPABASE_URL"
[ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ] && FALTA="$FALTA SUPABASE_SERVICE_ROLE_KEY"

if [ -n "$FALTA" ]; then
  parar "Faltam variaveis no .env:$FALTA
         Preencha e rode de novo: nano .env && bash provision.sh"
fi
ok "variaveis obrigatorias preenchidas"

# --- 6. sintaxe -------------------------------------------------------------
# CLAUDE.md regra 8: node --check antes de deixar o PM2 subir isso.
echo
echo "6. Sintaxe"
for f in src/*.js; do
  node --check "$f"
done
ok "todos os arquivos de src/ passaram no node --check"

# --- 7. PM2 -----------------------------------------------------------------
echo
echo "7. PM2"
if ! command -v pm2 >/dev/null 2>&1; then
  info "instalando pm2 global..."
  npm install -g pm2
fi
ok "pm2 $(pm2 -v)"

if [ ! -f ecosystem.config.cjs ]; then
  cat > ecosystem.config.cjs <<'EOF'
// Gerado pelo provision.sh. Fica fora do git (ver .gitignore).
module.exports = {
  apps: [{
    name: 'wa-agent',
    script: 'src/listener.js',
    cwd: __dirname,
    instances: 1,
    exec_mode: 'fork',          // Baileys mantem UMA sessao. Nunca use cluster.
    autorestart: true,
    max_restarts: 20,
    restart_delay: 5000,
    max_memory_restart: '400M',
    time: true,
    error_file: 'logs/erro.log',
    out_file: 'logs/saida.log',
    env: { NODE_ENV: 'production' },
  }],
};
EOF
  ok "ecosystem.config.cjs criado"
else
  ok "ecosystem.config.cjs ja existe"
fi

mkdir -p logs
ok "pasta logs/ pronta"

# --- 8. sessao do WhatsApp --------------------------------------------------
echo
echo "8. Sessao do WhatsApp"
if [ -f auth_info_baileys/creds.json ]; then
  ok "sessao pareada"
  echo
  echo "     Backup (faca agora se ainda nao fez):"
  echo "       tar czf ~/auth-backup-\$(date +%F).tgz -C $RAIZ auth_info_baileys"
else
  aviso "sem sessao. Voce vai precisar parear pelo QR apos subir o processo."
fi

# --- fim --------------------------------------------------------------------
cat <<EOF

==========================================
Provisionamento concluido.

Antes de subir, confirme que os SQLs rodaram no Supabase, em ordem:
  sql/001_schema.sql
  sql/002_sla_e_regras.sql
  sql/003_grupos_reais.sql

Subir:
  pm2 start ecosystem.config.cjs
  pm2 logs wa-agent --lines 60      # o QR de pareamento aparece aqui
  pm2 save && pm2 startup           # sobe sozinho apos reboot

Pareamento, no iPhone:
  WhatsApp > Configuracoes > Aparelhos conectados > Conectar aparelho

Depois:
  node src/status.js
  npm run classificar

EOF
