# Setup Local — Omni + Genie + Webhook Server

Guia passo a passo para rodar o ambiente completo localmente.

---

## Visão Geral

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  WhatsApp   │◄────┤    Omni     │◄────┪    Genie    │◄────┤    Claude   │
│  (usuário)  │     │  (bridge)   │     │(orquestrador│     │   (agente)  │
└─────────────┘     └──────┬──────┘     └─────────────┘     └─────────────┘
                           │
                    ┌──────┴──────┐
                    │ Webhook Srv │◄──── GitHub Events
                    └─────────────┘
```

**Fluxo Reativo:** WhatsApp → Omni → Genie → Claude → Omni → WhatsApp  
**Fluxo Proativo:** GitHub → Webhook Server → Omni → WhatsApp

---

## Pré-requisitos

| Ferramenta | Instalação | Para que serve |
|---|---|---|
| **Node.js 20+** | `brew install node` ou [nodejs.org](https://nodejs.org) | Webhook server |
| **Bun 1.3+** | `curl -fsSL https://bun.sh/install \| bash` | Build do Genie local |
| **Omni CLI** | `npm install -g @automagik/omni` | Bridge WhatsApp |
| **Genie CLI** | `curl -fsSL https://raw.githubusercontent.com/automagik-dev/genie/main/install.sh \| bash` | Orquestrador de agentes |
| **gh CLI** | `brew install gh && gh auth login` | Registrar webhooks no GitHub |
| **lt (localtunnel)** | `npm install -g localtunnel` | Expor Omni e webhook para internet |
| **jq** | `brew install jq` | Setup script |

---

## 1. Omni — Bridge WhatsApp

```bash
# 1.1 Iniciar o Omni
omni start

# 1.2 Listar instâncias
omni instances

# 1.3 Ler QR code com WhatsApp
omni qr <nome-da-instancia>
# Escaneie o QR com WhatsApp → Configurações → Aparelhos Conectados

# 1.4 Testar envio manual
omni send --instance <id> --to <SEU_NUMERO_E164> --text "Olá do Omni"
```

> 💡 O Omni roda em background. Para parar: `omni stop`

---

## 2. Genie — Orquestrador do Agente

Use o **Genie local corrigido** (tmux launch script fix):

```bash
cd <PATH_DO_GENIE_LOCAL>

# 2.1 Build (se ainda não fez)
bun run build

# 2.2 Ir para o projeto do agente
cd <PATH_DO_PROJETO>

# 2.3 Iniciar o Genie local
nohup bun <PATH_DO_GENIE_LOCAL>/dist/genie.js serve start --headless > /tmp/genie-local.log 2>&1 &

# 2.4 Verificar se subiu
cat /tmp/genie-local.log | tail -n 5
```

> ⚠️ **Não use o Genie global** (`genie serve start`) — ele tem o bug do `tmux send-keys` truncado.

---

## 3. Webhook Server — Monitor GitHub

```bash
cd webhook-server

# 3.1 Instalar dependências
npm install

# 3.2 Copiar e preencher o .env
cp ../.env.example ../.env
# Editar .env com seus valores (veja tabela abaixo)

# 3.3 Iniciar
npm run dev
# ou em background:
nohup npm exec tsx src/index.ts > /tmp/webhook-server.log 2>&1 &
```

---

## 4. Expor Serviços na Internet

O Railway precisa bater no Omni local. Use o **LocalTunnel**:

```bash
# 4.1 Omni (porta 8882)
nohup lt --port 8882 > /tmp/lt-omni.log 2>&1 &
cat /tmp/lt-omni.log
# Exemplo: https://<SUBDOMINIO>.loca.lt

# 4.2 Webhook server (porta 3001) — só se for testar local
nohup lt --port 3001 > /tmp/lt-webhook.log 2>&1 &
cat /tmp/lt-webhook.log
# Exemplo: https://<SUBDOMINIO>.loca.lt
```

> ⚠️ O LocalTunnel muda a URL a cada reinício. Para produção estável, use **ngrok com domínio fixo** ou deploye no Railway.

---

## 5. Registrar Webhook no GitHub

### 5.1 Via script (repo próprio)

```bash
./scripts/setup.sh
```

### 5.2 Manualmente (repo de org, sem permissão admin:repo_hook)

Acesse `https://github.com/<owner>/<repo>/settings/hooks` e crie:

| Campo | Valor |
|---|---|
| Payload URL | `https://<SEU_APP>.up.railway.app/webhook/github` |
| Content type | `application/json` |
| Secret | `<SEU_WEBHOOK_SECRET>` (valor do .env) |
| Events | ✅ Pull requests, ✅ Issues |

---

## 6. Configurar Variáveis no Railway

Se estiver usando Railway, configure:

| Variável | Exemplo | Descrição |
|---|---|---|
| `GITHUB_TOKEN` | `github_pat_...` | Token com escopo `repo` |
| `GITHUB_WEBHOOK_SECRET` | `<SEU_SECRET>` | Mesmo secret do webhook GitHub |
| `NOTIFY_PHONE` | `+55...` | Seu número WhatsApp (E.164) |
| `OMNI_API_URL` | `https://<SUBDOMINIO>.loca.lt` | URL do Omni (lt/ngrok) |
| `OMNI_API_KEY` | `omni_sk_...` | Chave da API do Omni |
| `OMNI_INSTANCE` | `<UUID>` | ID da instância WhatsApp |
| `PORT` | `8080` | Porta do webhook (Railway define automaticamente) |

---

## 7. Testar

### Fluxo Reativo (WhatsApp → Agente)

1. Envie mensagem no WhatsApp para o número conectado no Omni
2. Mensagem deve chegar ao Genie via NATS
3. Genie spawna Claude no tmux
4. Claude responde via Omni

```bash
# Verificar logs do Genie
cat /tmp/genie-local.log | grep -E "NATS|Spawning|Dead"

# Verificar panes tmux
tmux -L genie list-panes -a
```

### Fluxo Proativo (GitHub → WhatsApp)

1. Crie ou feche uma issue/PR no repo monitorado
2. GitHub dispara webhook
3. Webhook server recebe → dedup SQLite → chama Omni API v2
4. Notificação chega no WhatsApp

```bash
# Verificar eventos no banco
sqlite3 data/db.sqlite "SELECT * FROM notified_events ORDER BY id DESC LIMIT 5;"

# Verificar entregas do webhook
gh api repos/<owner>/<repo>/hooks/<id>/deliveries
```

---

## Troubleshooting

| Problema | Causa | Solução |
|---|---|---|
| `Dead session detected` no Genie | `tmux send-keys` trunca comandos longos | Use o **Genie local corrigido** (com `writeTmuxLaunchScript`) |
| `exec: OMNI_API_KEY=...: not found` | `/bin/sh` do macOS não suporta `exec VAR=value cmd` | O Genie local corrigido separa `export` e `exec` |
| `No conversation found with session ID` | Claude tenta resumir sessão inexistente | O Genie local substitui `--resume` por `--session-id` |
| Webhook 499 / timeout | `notify()` bloqueia resposta HTTP | Usar `fetch` nativo + fire-and-forget (`void notify()`) |
| Webhook 502 | LocalTunnel caiu | Reiniciar `lt` e atualizar URL no GitHub/Railway |
| Omni 404 no `/api/messages/send` | CLI `omni send` usa endpoint legado | Usar API v2 direta: `POST /api/v2/messages/send` |
| Railway não encontra Omni | `OMNI_API_URL` aponta para `localhost` | Mudar para URL pública do lt/ngrok |

---

## Comandos Rápidos (Cheatsheet)

```bash
# --- Omni ---
omni start
omni stop
omni status
omni send --instance <id> --to <SEU_NUMERO> --text "teste"

# --- Genie (use o local corrigido!) ---
cd <PATH_DO_GENIE_LOCAL> && bun run build
cd <PATH_DO_PROJETO>
nohup bun <PATH_DO_GENIE_LOCAL>/dist/genie.js serve start --headless > /tmp/genie.log 2>&1 &

# --- Webhook Server ---
cd webhook-server
npm run dev

# --- LocalTunnel ---
nohup lt --port 8882 > /tmp/lt-omni.log 2>&1 &
nohup lt --port 3001 > /tmp/lt-webhook.log 2>&1 &

# --- Banco ---
sqlite3 data/db.sqlite ".tables"
sqlite3 data/db.sqlite "SELECT * FROM monitored_repos;"
sqlite3 data/db.sqlite "SELECT * FROM notified_events ORDER BY id DESC LIMIT 10;"

# --- GitHub Webhook ---
gh api repos/<owner>/<repo>/hooks
gh api repos/<owner>/<repo>/hooks/<id>/deliveries
```

---

## Checklist Pré-desafio

- [ ] Omni iniciado e WhatsApp conectado
- [ ] Genie local buildado e rodando (`bun run build` + `serve start --headless`)
- [ ] Webhook server rodando localmente ou no Railway
- [ ] LocalTunnel rodando para Omni (porta 8882)
- [ ] Webhook registrado no GitHub com URL correta
- [ ] Variáveis `OMNI_API_URL`, `OMNI_API_KEY`, `NOTIFY_PHONE` configuradas no Railway
- [ ] Teste de mensagem reativa funciona (WhatsApp → resposta do agente)
- [ ] Teste de notificação proativa funciona (issue/PR → WhatsApp)
