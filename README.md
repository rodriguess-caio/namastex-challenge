# namastex-challenge — GitHub Monitor Agent

Agente conversacional no WhatsApp que monitora repositórios GitHub e notifica em tempo real sobre Pull Requests e Issues. Construído com [Genie](https://github.com/automagik-dev/genie) como orquestrador de agente e [Omni](https://github.com/automagik-dev/omni) como bridge omnichannel.

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
| **Reativo** | Usuário envia mensagem no WhatsApp | Consulta sobre PRs/issues via GitHub MCP |
| **Proativo** | GitHub envia webhook | Notificação automática de eventos no WhatsApp |

---

## Tecnologias

| Camada | Tecnologia | Função |
|--------|-----------|--------|
| **Orquestrador** | [Genie](https://github.com/automagik-dev/genie) | Gerencia agente Claude Code, sessões, memória e comunicação |
| **Bridge** | [Omni](https://github.com/automagik-dev/omni) | Conecta WhatsApp ↔ Genie (omnichannel) |
| **Agente** | Claude Code + TypeScript | Lógica do agente, ferramentas MCP e comandos de subscrição |
| **Webhook Server** | Express + TypeScript | Recebe eventos do GitHub, valida e notifica |
| **Banco de Dados** | SQLite (better-sqlite3) | Subscrições de repositórios + dedup de eventos |
| **Infraestrutura** | Docker + docker-compose | Containeriza webhook server + ngrok |
| **Túnel** | ngrok | Expõe webhook server local para GitHub |
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
│   ├── workspace.json            # Workspace Genie
│   └── brainstorms/             # Design docs do agente
│
├── agent/
│   └── .claude/settings.json    # Config do agente Genie (MCP + permissões)
│
├── agents/
│   └── github-monitor/          # Definição do agente (AGENTS.md, SOUL.md, etc.)
│
├── db/
│   ├── client.ts                # Singleton better-sqlite3 + init automático
│   ├── schema.ts                # Schema: monitored_repos + notified_events
│   └── tsconfig.json            # Config TS específica do db
│
├── scripts/
│   ├── setup.sh                 # Validação de env + registro de webhook no GitHub
│   ├── register-agent.sh        # Registra agente no Genie
│   └── subscribe.sh             # Helper manual para adicionar subscrição
│
├── webhook-server/
│   ├── Dockerfile               # Imagem Docker do servidor webhook
│   ├── package.json             # Dependências (Express, Jest, Supertest)
│   ├── fixtures/
│   │   ├── pr_opened.json       # Fixture de teste: PR aberto
│   │   └── issue_opened.json    # Fixture de teste: Issue aberta
│   └── src/
│       ├── index.ts             # App Express (factory + server)
│       ├── notify.ts            # Wrapper do CLI omni send
│       ├── middleware/
│       │   └── hmac.ts          # Validação HMAC-SHA256 com timingSafeEqual
│       ├── handlers/
│       │   ├── pull-request.ts  # Handler de eventos de PR
│       │   └── issue.ts         # Handler de eventos de Issue
│       └── __tests__/
│           └── handlers.test.ts # 8 testes de integração
│
├── docker-compose.yml           # Serviços: webhook-server + ngrok
├── .env.example                 # Template de variáveis de ambiente
├── AGENTS.md                    # System prompt + comandos do agente github-monitor
├── CLAUDE.md                    # Documentação técnica do projeto para LLMs
├── package.json                 # Dependências raiz (better-sqlite3, tsx, TS)
└── tsconfig.json                # Config TypeScript raiz (ES2022, strict)
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
- Executa `omni send --to <phone> --text <message>` via `spawnSync`
- Suporta `OMNI_INSTANCE` opcional para multi-instância
- Usa arrays de argumentos (nunca template strings) para prevenir command injection

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

### `spawnSync` com arrays (nunca `shell: true`)
Toda execução de comando (`omni send`, `sqlite3`) usa arrays de argumentos em vez de template strings. Isso elimina o risco de command injection mesmo se o conteúdo da mensagem contiver caracteres especiais.

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

### Pré-requisitos

- Node.js 20+
- Docker + docker-compose (para execução containerizada)
- Genie CLI (`npm install -g @automagik/genie`)
- Omni CLI + instância WhatsApp conectada
- ngrok account + authtoken
- GitHub token com escopos `repo` e `admin:repo_hook`

### Passo a passo

```bash
# 1. Clone e entre no diretório
git clone <seu-repo-url> namastex-challenge
cd namastex-challenge

# 2. Configure as variáveis de ambiente
cp .env.example .env
# Edite .env com seus valores (GITHUB_TOKEN, NGROK_DOMAIN, etc.)

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

# 7. Execute o setup (valida env + registra webhook no GitHub)
./scripts/setup.sh

# 8. Inicie os serviços (webhook + ngrok)
docker-compose up -d

# OU em modo dev:
npm run dev --prefix webhook-server
ngrok http --domain=seu-dominio.ngrok-free.app 3001
```

### Verificação

Envie uma mensagem no WhatsApp para o número conectado:
- `listar PRs abertos de owner/repo`
- `monitorar owner/repo`
- `quais repos estou monitorando`

---

## Testes

```bash
cd webhook-server && npm test
```

Os testes usam mocks para `notify()` e `db.client`, evitando dependências externas (Omni, SQLite real). As fixtures em `webhook-server/fixtures/` simulam payloads reais do GitHub.

---

## Melhorias Futuras

- **Suporte multi-usuário**: substituir `NOTIFY_PHONE` único por tabela de usuários
- **Eventos de CI**: suporte a `workflow_run` e `check_suite` para notificar sobre falhas em pipelines
- **Dashboard web**: interface para gerenciar subscrições e visualizar histórico
- **Cache de respostas**: evitar consultas repetidas ao GitHub MCP para perguntas frequentes
- **Testes de integração**: testes end-to-end com Genie + Omni em ambiente controlado
