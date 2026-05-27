# Deploy no Railway

Guia completo para deploy do GitHub Monitor Agent no Railway, com Omni integrado.

---

## Visão Geral da Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│                      RAILWAY                                │
│                                                             │
│  ┌──────────────────────────┐   ┌────────────────────────┐ │
│  │   Webhook Server         │   │   Omni (opcional)      │ │
│  │   (Dockerfile)           │   │   (automagik/omni)     │ │
│  │                          │   │                        │ │
│  │   Porta: 3001            │   │   Porta: 8882          │ │
│  │   Volume: /app/data      │   │   Volume: /root/omni   │ │
│  └──────────┬───────────────┘   └────────────┬───────────┘ │
│             │  Railway Internal Network       │             │
│             └─────────────────────────────────┘             │
└─────────────────────────────────────────────────────────────┘
         │                                    │
         │ HTTPS (público)                    │
         ▼                                    ▼
  ┌──────────────┐                   ┌──────────────┐
  │    GitHub    │                   │   Genie      │
  │  (webhooks)  │                   │  (local)     │
  └──────────────┘                   └──────────────┘
```

### Opções de Deploy

| Opção | Omni | Quando usar |
|-------|------|-------------|
| **A — Omni local** | Roda na sua máquina | Setup mais simples, WhatsApp estável |
| **B — Omni no Railway** | Roda como serviço separado | 100% cloud, mas requer configurar sessão WhatsApp |

---

## Pré-requisitos

- [Conta Railway](https://railway.app) conectada ao GitHub
- Repositório no GitHub com o código do projeto
- `GITHUB_TOKEN` com escopos `repo` e `admin:repo_hook`
- `GITHUB_WEBHOOK_SECRET` (valor seguro de sua escolha)
- Número de WhatsApp conectado via Omni

---

## Opção A — Webhook Server no Railway + Omni Local (Recomendado)

### 1. Deploy do Webhook Server

1. Acesse [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
2. Selecione o repositório `namastex-challenge`
3. Railway detecta automaticamente o `railway.json` e o `Dockerfile`

### 2. Configurar Volume para SQLite

O SQLite precisa de armazenamento persistente:

1. No dashboard do Railway, vá em **Volumes** → **New Volume**
2. Configure:
   - **Mount path**: `/app/data`
   - **Size**: 1 GB (mais que suficiente)
3. Vincule o volume ao serviço do webhook server

### 3. Configurar Variáveis de Ambiente

No dashboard do Railway, vá em **Variables** e adicione:

| Variável | Valor | Descrição |
|----------|-------|-----------|
| `GITHUB_WEBHOOK_SECRET` | `seu-segredo-aqui` | Mesmo valor usado no webhook do GitHub |
| `NOTIFY_PHONE` | `+5511999999999` | Seu WhatsApp em formato E.164 |
| `OMNI_API_URL` | `http://localhost:8882` | URL do Omni local (precisa de túnel) |
| `OMNI_API_KEY` | `sua-api-key` | Chave de API do Omni |
| `PORT` | `3001` | Porta do servidor (Railway injeta automaticamente, mas manter explícito) |

> ⚠️ **OMNI_API_URL**: Se o Omni estiver na sua máquina local, você precisa expô-lo com um túnel:
> - **Ngrok**: `ngrok http 8882` → usa URL gerada como `OMNI_API_URL`
> - **Cloudflare Tunnel**: `cloudflared tunnel --url http://localhost:8882`

Após configurar, Railway faz rebuild automático.

### 4. Obter URL Pública do Webhook

1. No dashboard do Railway, vá em **Settings** → **Networking**
2. Gere um **Public Domain** (ex: `webhook-server.up.railway.app`)
3. Anote a URL — será usada para registrar o webhook no GitHub

### 5. Registrar Webhook no GitHub

Via script local (com as env vars atualizadas para a URL do Railway):

```bash
# Defina a URL do Railway
export NGROK_DOMAIN=webhook-server.up.railway.app

# Execute o script de setup
./scripts/setup.sh
```

Ou manualmente via API:

```bash
curl -X POST https://api.github.com/repos/OWNER/REPO/hooks \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "web",
    "active": true,
    "events": ["pull_request", "issues"],
    "config": {
      "url": "https://webhook-server.up.railway.app/webhook/github",
      "content_type": "json",
      "secret": "'$GITHUB_WEBHOOK_SECRET'"
    }
  }'
```

### 6. Conectar Omni Local ao Agente

```bash
# Omni rodando localmente
omni start

# Conecta WhatsApp (escaneie o QR code)
omni qr <instance>

# Conecta Omni ao agente Genie
omni connect github-monitor
```

### 7. Verificar

- Abra um PR ou Issue no repositório monitorado → notificação no WhatsApp
- Envie "listar PRs abertos de owner/repo" no WhatsApp → resposta do agente

---

## Opção B — Webhook Server + Omni no Railway

Nesta opção, tanto o webhook server quanto o Omni rodam como serviços separados no Railway.

### 1. Criar Projeto no Railway

1. Railway → **New Project** → **Deploy from GitHub repo**
2. Selecione o repositório `namastex-challenge`
3. Railway cria o primeiro serviço a partir do Dockerfile

### 2. Adicionar Serviço Omni

1. No projeto Railway, clique em **New Service**
2. Escolha **Image from Docker Hub**
3. Use a imagem: `automagik/omni:latest`
4. Nomeie o serviço como `omni`

### 3. Configurar Omni no Railway

**Volume** — necessário para persistir sessão WhatsApp:
1. **Volumes** → **New Volume**
2. **Mount path**: `/root/omni`
3. Vincule ao serviço `omni`

**Variáveis de Ambiente** do Omni:

| Variável | Valor |
|----------|-------|
| `OMNI_API_KEY` | `sua-chave-secreta` |
| `OMNI_INSTANCE_NAME` | `github-monitor` |
| `PORT` | `8882` |

**Networking**:
- Mantenha o serviço Omni **interno** (sem domínio público)
- O webhook server se comunica via rede interna do Railway

### 4. Configurar Webhook Server no Railway

**Variáveis de Ambiente**:

| Variável | Valor | Descrição |
|----------|-------|-----------|
| `GITHUB_WEBHOOK_SECRET` | `seu-segredo` | Para validar webhooks do GitHub |
| `NOTIFY_PHONE` | `+5511999999999` | WhatsApp destino |
| `OMNI_API_URL` | `http://omni:8882` | URL interna do serviço Omni |
| `OMNI_API_KEY` | `sua-chave-secreta` | Mesma chave configurada no Omni |

**Volume** — SQLite persistente:
1. **Volumes** → **New Volume**
2. **Mount path**: `/app/data`
3. Vincule ao serviço `webhook-server`

### 5. Conectar WhatsApp ao Omni no Railway

Como o Omni está em cloud, conectar o WhatsApp requer atenção:

**Opção 5a — Via Web Interface (se Omni expuser):**
- Se o Omni expuser uma interface web na porta 8882, exponha o serviço temporariamente
- Acesse a URL pública e escaneie o QR code
- Remova o domínio público após conectar (a sessão persiste no volume)

**Opção 5b — Via API com CLI local (recomendado):**
```bash
# Exponha o Omni do Railway temporariamente
# Railway: Settings → Networking → Generate Public Domain

# Use o omni CLI local apontando para o Railway
omni --api-url https://omni-seuprojeto.up.railway.app qr <instance>

# Escaneie o QR code
# Após conectar, remova o domínio público do Omni
```

**Opção 5c — Via Genie Bridge (se usar Genie local):**
```bash
# Com o Omni no Railway exposto publicamente:
genie skill add omni --agent github-monitor
# Configure OMNI_API_URL no Genie para apontar ao Railway
```

### 6. Registrar Webhook no GitHub

```bash
export GITHUB_TOKEN=ghp_seu_token
export GITHUB_WEBHOOK_SECRET=seu_segredo

curl -X POST https://api.github.com/repos/OWNER/REPO/hooks \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "web",
    "active": true,
    "events": ["pull_request", "issues"],
    "config": {
      "url": "https://webhook-server.up.railway.app/webhook/github",
      "content_type": "json",
      "secret": "'$GITHUB_WEBHOOK_SECRET'"
    }
  }'
```

---

## Gerenciamento de Subscrições

Com o webhook server no Railway, as subscrições de repositórios são gerenciadas via WhatsApp (conversando com o agente Genie local):

| Comando | Ação |
|---------|------|
| `monitorar owner/repo` | Adiciona repositório |
| `parar de monitorar owner/repo` | Remove repositório |
| `listar repos monitorados` | Lista subscrições ativas |

O agente Genie local executa os comandos SQLite no banco que está no Railway (ou local, dependendo da configuração).

> ⚠️ Se o SQLite estiver no Railway (volume montado), o agente Genie local precisa acessá-lo remotamente. Nesse caso, use o Railway CLI:
> ```bash
> railway run sqlite3 /app/data/db.sqlite "SELECT * FROM monitored_repos"
> ```

---

## Railway CLI (Opcional)

Para gerenciar o projeto via linha de comando:

```bash
# Instalar Railway CLI
npm install -g @railway/cli

# Login
railway login

# Vincular ao projeto
railway link

# Executar comando no container remoto
railway run sqlite3 /app/data/db.sqlite ".tables"

# Ver logs
railway logs

# Abrir dashboard no navegador
railway open
```

---

## Solução de Problemas

### Webhook não está notificando WhatsApp

1. Verifique os logs no Railway: `railway logs`
2. Confirme que `OMNI_API_URL` está acessível do Railway (se Omni local, precisa de túnel)
3. Teste o Omni manualmente: `omni send --to +5511999999999 --text "teste"`
4. Verifique se o webhook está registrado no repositório GitHub (Settings → Webhooks)

### Conexão WhatsApp cai

- Se Omni local: mantenha o terminal aberto ou use `tmux`/`screen`
- Se Omni no Railway: verifique se o volume está persistindo a sessão (`/root/omni`)

### SQLite: "database is locked"

- Railway usa um único volume para o SQLite
- Se precisar acessar o banco local e remotamente, use Railway CLI: `railway run sqlite3 /app/data/db.sqlite`
- Não acesse o banco simultaneamente de dois lugares

### Container reiniciando em loop

- Verifique as variáveis de ambiente obrigatórias
- Confirme que o volume `/app/data` está montado corretamente
- Railway CLI: `railway logs --service webhook-server`
