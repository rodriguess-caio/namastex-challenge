# namastex-challenge — GitHub Monitor Agent

Agente conversacional no WhatsApp que monitora repositórios GitHub e notifica em tempo real sobre Pull Requests, Issues e GitHub Actions workflows. Construído com [Genie](https://github.com/automagik-dev/genie) como orquestrador de agente e [Omni](https://github.com/automagik-dev/omni) como bridge omnichannel.

---

## Índice

- [Arquitetura](#arquitetura)
- [Tecnologias](#tecnologias)
- [Estrutura do Projeto](#estrutura-do-projeto)
- [Fluxo de Mensagens](#fluxo-de-mensagens)
- [Componentes da Implementação](#componentes-da-implementação)
- [Decisões Arquiteturais](#decisões-arquiteturais)
- [Segurança](#segurança)
- [Setup e Execução](#setup-e-execução)
- [Testes](#testes)
- [Melhorias Futuras](#melhorias-futuras)

---

## Arquitetura

```
┌──────────────┐     ┌──────────────────────────────────────┐
│   WhatsApp   │────▶│              Omni                    │
│   (usuário)  │◀────│  (bridge omnichannel)                │
└──────────────┘     └──────────┬───────────────────────────┘
                                │
                    ┌───────────▼───────────────────────────┐
                    │           Genie                       │
                    │  (orquestrador de agentes)            │
                    │                                      │
                    │  ┌────────────────────────────────┐  │
                    │  │   github-monitor agent         │  │
                    │  │   (Claude Code)                │  │
                    │  │                                │  │
                    │  │  ┌──────────┐ ┌────────────┐  │  │
                    │  │  │ GitHub   │ │  SQLite    │  │  │
                    │  │  │ MCP      │ │  (subscriptions) │
                    │  │  │ Server   │ │            │  │  │
                    │  │  └──────────┘ └────────────┘  │  │
                    │  └────────────────────────────────┘  │
                    └──────────────────────────────────────┘

┌──────────────────┐     ┌──────────────────────────────────┐
│    GitHub        │────▶│      Webhook Server             │
│  (eventos)       │     │  (Express + SQLite)              │
│                  │     │                                  │
│  PR opened       │     │  POST /webhook/github            │
│  Issue opened    │     │    ├── HMAC validation           │
│  PR merged       │     │    ├── Payload validation        │
│  Issue closed    │     │    ├── Dedup (SQLite)            │
│                  │     │    └── notify() → Omni → WhatsApp│
└──────────────────┘     └──────────────────────────────────┘
```

O sistema opera em **dois fluxos independentes**:

| Fluxo | Gatilho | Descrição |
|-------|---------|-----------|
| **Reativo** | Usuário envia mensagem no WhatsApp | Consulta sobre PRs, Issues e Actions via GitHub MCP e agent tools |
| **Proativo** | GitHub envia webhook | Notificação automática de eventos no WhatsApp |

---

## Tecnologias

| Camada | Tecnologia | Função |
|--------|-----------|--------|
| **Orquestrador** | [Genie](https://github.com/automagik-dev/genie) | Gerencia agente Claude Code, sessões, memória e comunicação |
| **Bridge** | [Omni](https://github.com/automagik-dev/omni) | Conecta WhatsApp ↔ Genie (omnichannel) |
| **Agente** | Claude Code + TypeScript | Lógica do agente, ferramentas MCP, agent tools (Bash/curl) e comandos de subscrição |
| **Webhook Server** | Express + TypeScript | Recebe eventos do GitHub, valida e notifica |
| **Banco de Dados** | SQLite (better-sqlite3) | Subscrições de repositórios + dedup de eventos |
| **Infraestrutura** | Docker + docker-compose | Containeriza webhook server + ngrok |
| **Túnel** | ngrok / LocalTunnel | Expõe webhook server e Omni local para internet |
| **Deploy** | Railway | Hospeda webhook server com URL fixa |
| **MCP** | `@github/mcp-server` | Ferramentas para consultar dados do GitHub |
| **Testes** | Jest + Supertest | Testes de integração do webhook server |

---

## Estrutura do Projeto

```
namastex-challenge/
│
├── .claude/
│   └── settings.json            # Config MCP GitHub + permissões do Claude
│
├── .genie/
│   └── workspace.json            # Workspace Genie
│
├── agents/
│   └── github-monitor/
│       ├── AGENTS.md            # System prompt + comandos do agente
│       └── .claude/
│           └── settings.json    # Config do agente (MCP + permissões)
│
├── data/
│   ├── db.sqlite                # Banco SQLite (WAL mode)
│   ├── db.sqlite-shm            # Shared memory (WAL)
│   └── db.sqlite-wal            # Write-ahead log
│
├── db/
│   ├── client.ts                # Singleton better-sqlite3 + init automático
│   ├── schema.ts                # Schema: monitored_repos + notified_events
│   └── tsconfig.json            # Config TS específica do db
│
├── dist/                        # Build output (TypeScript compilado)
│
├── scripts/
│   ├── setup.sh                 # Validação de env + registro de webhook no GitHub
│   ├── register-agent.sh        # Registra agente no Genie
│   └── subscribe.sh             # Helper manual para adicionar subscrição
│
├── webhook-server/
│   ├── Dockerfile               # Imagem Docker do servidor webhook
│   ├── package.json             # Dependências (Express, Jest, Supertest)
│   ├── tsconfig.json            # Config TS do webhook server
│   ├── fixtures/
│   │   ├── pr_opened.json       # Fixture de teste: PR aberto
│   │   └── issue_opened.json    # Fixture de teste: Issue aberta
│   └── src/
│       ├── index.ts             # App Express (factory + server)
│       ├── notify.ts            # Chama API v2 do Omni via fetch nativo
│       ├── middleware/
│       │   └── hmac.ts          # Validação HMAC-SHA256 com timingSafeEqual
│       ├── handlers/
│       │   ├── pull-request.ts  # Handler de eventos de PR
│       │   └── issue.ts         # Handler de eventos de Issue
│       └── __tests__/
│           └── handlers.test.ts # 9 testes de integração
│
├── docker-compose.yml           # Serviços: webhook-server + ngrok
├── .env                         # Variáveis de ambiente (não commitar)
├── .env.example                 # Template de variáveis de ambiente
├── package.json                 # Dependências raiz (better-sqlite3, tsx, TS)
├── tsconfig.json                # Config TypeScript raiz (ES2022, strict)
├── railway.json                 # Config de deploy no Railway
├── CLAUDE.md                    # Documentação técnica do projeto para LLMs
├── ISSUE_GENIE_OMNI_BRIDGE.md   # Bug report: tmux send-keys truncation
├── RAILWAY_DEPLOY.md            # Guia de deploy no Railway
├── SETUP_LOCAL.md               # Guia completo de setup local
└── README.md                    # Este arquivo
```

---

## Fluxo de Mensagens

### Fluxo Reativo (consulta do usuário)

```
Usuario (WhatsApp)
  │
  ▼
Omni ──── roteia para Genie ──── github-monitor agent (Claude Code)
  │                                                                │
  │                                                    ┌───────────▼───────────┐
  │                                                    │   Entende a intenção  │
  │                                                    │   Ex: "listar PRs de  │
  │                                                    │   owner/repo"         │
  │                                                    └───────────┬───────────┘
  │                                                                │
  │                                          ┌─────────────────────▼──────────┐
  │                                          │  Usa GitHub MCP Server        │
  │                                          │  - list_pull_requests         │
  │                                          │  - list_issues                │
  │                                          │  - get_issue                  │
  │                                          │  - search_issues              │
  │                                          └─────────────────────┬──────────┘
  │                                                                │
  │                                          ┌─────────────────────▼──────────┐
  │                                          │  Formata resposta             │
  │                                          └─────────────────────┬──────────┘
  │                                                                │
◀──┼──────────────────────────────────────────────────────────────────
    Resposta no WhatsApp com dados do GitHub
```

**Comandos de subscrição** (gerenciamento via SQLite):

| Comando do usuário | Ação do agente |
|---|---|
| `monitorar owner/repo` | `INSERT OR IGNORE INTO monitored_repos` |
| `parar de monitorar owner/repo` | `DELETE FROM monitored_repos` |
| `listar repos monitorados` | `SELECT owner || '/' || repo FROM monitored_repos` |

**Comandos de GitHub Actions** (consulta via GitHub API + `curl`):

| Comando do usuário | Ação do agente |
|---|---|
| `mostra os workflows de owner/repo` | `GET /repos/{owner}/{repo}/actions/workflows` |
| `status das actions de owner/repo` | `GET /repos/{owner}/{repo}/actions/runs?per_page=10` |
| `detalhes da run {run_id}` | `GET /repos/{owner}/{repo}/actions/runs/{run_id}` |
| `logs do job {job_id}` | `GET /repos/{owner}/{repo}/actions/jobs/{job_id}/logs` |
| `artifacts da run {run_id}` | `GET /repos/{owner}/{repo}/actions/runs/{run_id}/artifacts` |

> O agente valida `owner` e `repo` com regex `^[a-zA-Z0-9_.-]+$` antes de executar qualquer SQL, prevenindo SQL injection via prompt injection.

### Fluxo Proativo (notificação do GitHub)

```
GitHub Event (PR opened, Issue closed, PR merged, Issue opened)
  │
  ▼
POST /webhook/github ──── HMAC Middleware
  │                            │
  │                 ┌──────────▼──────────┐
  │                 │  Lê raw body        │
  │                 │  Calcula HMAC-SHA256│
  │                 │  timingSafeEqual    │
  │                 │  → 401 se inválido  │
  │                 └──────────┬──────────┘
  │                            │ (válido)
  ▼                            │
Roteia por x-github-event      │
  │                            │
  ├── pull_request ───▶ handlePullRequest()
  │                       ├── Valida payload (type guard)
  │                       ├── Verifica action (opened/closed/merged)
  │                       ├── Dedup: INSERT OR IGNORE em notified_events
  │                       └── Se novo: notify() → omni send → WhatsApp
  │
  └── issues ─────────▶ handleIssue()
                          ├── Valida payload (type guard)
                          ├── Verifica action (opened/closed)
                          ├── Dedup: INSERT OR IGNORE em notified_events
                          └── Se novo: notify() → omni send → WhatsApp
```

---

## Componentes da Implementação

### 1. Webhook Server (`webhook-server/src/`)

Servidor Express que escuta na porta `3001` e processa eventos do GitHub.

**Middleware HMAC** (`middleware/hmac.ts`):
- Lê o header `x-hub-signature-256` enviado pelo GitHub
- Recalcula o HMAC-SHA256 usando o raw body + `GITHUB_WEBHOOK_SECRET`
- Compara as assinaturas com `crypto.timingSafeEqual` (timing-safe)
- Retorna `401` se inválido, `500` se `GITHUB_WEBHOOK_SECRET` não estiver configurado

**Handler de Pull Requests** (`handlers/pull-request.ts`):
- Processa ações: `opened`, `closed` (merged), `closed` (sem merge)
- Type guard `isValidPayload()` valida estrutura completa antes de acessar campos
- Dedup atômico via `INSERT OR IGNORE` com `UNIQUE(event_type, github_event_id)`
- Ignora ações não relevantes (synchronize, reopened, edited, etc.)

**Handler de Issues** (`handlers/issue.ts`):
- Processa ações: `opened`, `closed`
- Mesmo padrão de type guard + dedup atômico

**Serviço de Notificação** (`notify.ts`):
- Valida `NOTIFY_PHONE` no formato E.164 (`^\+[1-9]\d{7,14}$`)
- Chama a **API v2 do Omni** diretamente via `fetch` nativo do Node.js (`POST /api/v2/messages/send`)
- Suporta `OMNI_INSTANCE` opcional para multi-instância
- **Fire-and-forget**: não bloqueia a resposta HTTP do webhook (evita timeout 499)

### 2. Camada de Dados (`db/`)

**Schema** (`schema.ts`):
```sql
monitored_repos (id, owner, repo, created_at)  -- UNIQUE(owner, repo)
notified_events (id, event_type, github_event_id, notified_at)  -- UNIQUE(event_type, github_event_id)
```

**Cliente** (`client.ts`):
- Singleton do `better-sqlite3` com WAL mode
- Cria diretório `data/` automaticamente se não existir
- Inicializa schema na primeira importação

> **WAL mode** permite leitura e escrita simultânea entre o webhook server e o agente Genie sem lock de banco.

### 3. Agente Genie (`AGENTS.md`)

Definição completa do agente `github-monitor`:
- **System prompt** com capacidades, exemplos de comandos e diretrizes comportamentais
- **GitHub MCP Tools**: `list_pull_requests`, `list_issues`, `get_issue`, `search_issues`
- **GitHub Actions Agent Tools**: consulta de workflows, runs, logs e artifacts via Bash/curl na API do GitHub
- **GitHub Actions Agent Tools**: consulta workflows (`list_workflows`), runs (`list_workflow_runs`), detalhes (`get_workflow_run`), logs (`get_job_logs`) e artifacts via Bash/curl
- **Comandos de subscrição**: SQLite via CLI com validação de input anti-SQL injection
- **Comportamento**: respostas no idioma do usuário (PT/EN), conciso e amigável

### 4. Docker (`docker-compose.yml`)

```yaml
services:
  webhook-server:   # Node 20, compilação multi-estágio com better-sqlite3
  ngrok:            # Túnel com domínio fixo para URL de webhook estável
```

### 5. Scripts de Setup

| Script | Função |
|---|---|
| `scripts/setup.sh` | Valida env vars, registra webhook no GitHub via API |
| `scripts/register-agent.sh` | Inicializa agente no Genie (idempotente) |
| `scripts/subscribe.sh` | Helper manual para testes: adiciona subscrição |

### 6. Testes

8 casos de teste em `webhook-server/src/__tests__/handlers.test.ts`:

| # | Cenário | Status esperado |
|---|---------|----------------|
| 1 | HMAC válido | 200 |
| 2 | HMAC inválido | 401 |
| 3 | PR opened → `notify()` chamado | Mensagem contém repo + # + título |
| 4 | Issue opened → `notify()` chamado | Mensagem contém repo + # + título |
| 5 | Evento duplicado (dedup) | `notify()` chamado 1 vez |
| 6 | JSON malformado | 400, `notify()` não chamado |
| 7 | Payload sem campos obrigatórios | 400, `notify()` não chamado |
| 8 | Campos null | 400, `notify()` não chamado |
| 9 | Tipo de evento desconhecido | 200, sem eco no response |

---

## Decisões Arquiteturais

### Raw body no Express (`express.raw`)
O middleware HMAC precisa dos bytes brutos do corpo da requisição para calcular a assinatura. Usar `express.json()` ou `express.urlencoded()` faria o parsing antes da validação, impossibilitando a verificação HMAC.

### Dedup atômico com `INSERT OR IGNORE`
A combinação `UNIQUE(event_type, github_event_id)` + `INSERT OR IGNORE` torna a deduplicação uma operação atômica a nível de banco. Não há race condition entre "verificar se existe" e "inserir" — o próprio banco rejeita o duplicado.

### WAL mode no SQLite
Necessário porque dois processos diferentes (webhook server e agente Genie) podem acessar o mesmo banco. WAL permite leituras concorrentes sem bloquear escritas.

### Type guards para validação de payload
Em vez de acessar `payload.issue.title` diretamente (que lançaria TypeError se `issue` for undefined), cada handler tem uma função `isValidPayload()` que verifica toda a estrutura do payload antes do acesso. Isso previne crashes com payloads malformados.

### API v2 do Omni em vez de CLI `omni send`
O CLI `omni send` usa o endpoint legado `/api/messages/send` que retorna 404 na versão atual do Omni. A notificação agora chama a API v2 diretamente via `fetch` nativo do Node.js, sem depender de binários externos (`curl`, `omni`).

### `spawnSync` com arrays (nunca `shell: true`)
Toda execução de comando (`sqlite3`) usa arrays de argumentos em vez de template strings. Isso elimina o risco de command injection mesmo se o conteúdo da mensagem contiver caracteres especiais.

---

## Segurança

| Aspecto | Implementação |
|---------|--------------|
| **Validação de webhook** | HMAC-SHA256 com `crypto.timingSafeEqual` (timing-safe) |
| **Prevenção de SQL injection** | Validação de input `^[a-zA-Z0-9_.-]+$` antes de SQL |
| **Prevenção de command injection** | `spawnSync` com arrays de argumentos (sem `shell: true`) |
| **Rate limiting** | Limite de 1MB no body (`express.raw({ limit: '1mb' })`) |
| **Permissões do agente** | `permissions.allow` restrito a `omni *` e `sqlite3`; `permissions.deny` bloqueia `rm`, `sudo`, `curl`, `wget`, `npm`, `npx` |
| **XSS** | Respostas de eventos desconhecidos não ecoam o nome do evento |

---

## Setup e Execução

> 📖 **Guia completo passo a passo:** veja [`SETUP_LOCAL.md`](./SETUP_LOCAL.md) para instruções detalhadas de setup local (Omni + Genie + Webhook Server + LocalTunnel).

### Pré-requisitos

- Node.js 20+
- Bun 1.3+ (para build do Genie local corrigido)
- Docker + docker-compose (opcional, para execução containerizada)
- Genie CLI global (`npm install -g @automagik/genie`)
- **Genie local corrigido** (clone de `github.com/automagik-dev/genie` com fix do `tmux send-keys`)
- Omni CLI + instância WhatsApp conectada
- ngrok account + authtoken (ou LocalTunnel)
- GitHub token com escopo `repo`
- `gh` CLI autenticado (para gerenciar webhooks)

### ⚠️ Importante: use o Genie local corrigido

O Genie global (`genie serve start`) tem um bug crítico: o `tmux send-keys` trunca comandos acima de ~1968 caracteres, corrompendo o spawn do agente. O **Genie local corrigido** resolve isso escrevendo o comando em um arquivo temporário e executando via `source`. O bug foi reportado em [automagik-dev/genie#2486](https://github.com/automagik-dev/genie/issues/2486) e o fix está em revisão via [automagik-dev/genie#2489](https://github.com/automagik-dev/genie/pull/2489).

```bash
# Build do Genie local
cd <path-do-genie-local>
bun run build

# Iniciar no projeto
cd <path-do-projeto>
nohup bun <path-do-genie-local>/dist/genie.js serve start --headless > /tmp/genie.log 2>&1 &
```

### Opção 1: Setup Local (desenvolvimento)

```bash
# 1. Clone e entre no diretório
git clone https://github.com/rodriguess-caio/namastex-challenge.git namastex-challenge
cd namastex-challenge

# 2. Configure as variáveis de ambiente
cp .env.example .env
# Edite .env com seus valores (GITHUB_TOKEN, NOTIFY_PHONE, OMNI_*, etc.)

# 3. Instale as dependências
npm install
npm install --prefix webhook-server

# 4. Compile a camada de banco de dados
npm run build:db

# 5. Conecte o WhatsApp via Omni
omni start
omni instances       # Encontre o nome da instância
omni qr <instance>   # Escaneie o QR code com WhatsApp

# 6. Registre o agente no Genie
./scripts/register-agent.sh

# 7. Inicie o webhook server
npm run dev --prefix webhook-server

# 8. Exponha o Omni para o Railway (ou webhook para GitHub)
nohup lt --port 8882 > /tmp/lt-omni.log 2>&1 &
cat /tmp/lt-omni.log   # Copie a URL para OMNI_API_URL no Railway
```

### Opção 2: Deploy no Railway (produção)

O projeto inclui [`RAILWAY_DEPLOY.md`](./RAILWAY_DEPLOY.md) com instruções completas. Resumo:

1. Conecte o repo ao Railway (deploy automático em push para `main`)
2. Configure as variáveis de ambiente no Railway dashboard:
   - `GITHUB_TOKEN`, `GITHUB_WEBHOOK_SECRET`, `NOTIFY_PHONE`
   - `OMNI_API_URL` = URL do LocalTunnel/ngrok do Omni local
   - `OMNI_API_KEY`, `OMNI_INSTANCE`
3. Registre o webhook no GitHub apontando para `https://<seu-app>.up.railway.app/webhook/github`

### Verificação

Envie uma mensagem no WhatsApp para o número conectado:
- `listar PRs abertos de owner/repo`
- `mostra os workflows de owner/repo`
- `status das actions de owner/repo`
- `monitorar owner/repo`
- `quais repos estou monitorando`

Para testar notificações proativas, crie ou feche uma issue/PR no repo monitorado.

---

## Testes

```bash
cd webhook-server && npm test
```

Os testes usam mocks para `notify()` e `db.client`, evitando dependências externas (Omni, SQLite real). As fixtures em `webhook-server/fixtures/` simulam payloads reais do GitHub.

---

