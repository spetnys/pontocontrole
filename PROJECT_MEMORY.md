# Project Memory

Memoria viva do projeto Ponto Controle/Adegaweb. Nao inventar contexto; atualizar
quando o entendimento mudar.

## Identidade

- Nome do projeto: Ponto Controle publicado em Adegaweb.
- Raiz operacional: `/home/sheila/codex/pontocontrole`.
- Aplicacao principal: `/home/sheila/codex/pontocontrole/wine`.
- Dono / decisor: usuario solicitante; operacao administrativa indicada para
  Sheila.
- Tipo de projeto: aplicacao web administrativa em React com backend Node,
  PostgreSQL, Docker e Caddy.
- Publico usuario: administradores, equipe operacional e clientes autorizados.
- Problema real que resolve: organizar clientes, equipe, atividades, agenda,
  financeiro, relatorios, permissoes e integracao WhatsApp.

## Estado atual

- Estagio: aplicacao atual em producao via Docker.
- Em producao: sim, `https://adegaweb.com.br` e
  `https://www.adegaweb.com.br`, IP `144.33.20.37`.
- Usuarios reais: master `sheila`; usuarios restaurados
  `sheila@varinha.com.br` e `teste@teste.com`.
- Stack principal: React/Vite, TypeScript, Express, PostgreSQL 16, Docker,
  Caddy.
- Dependencias criticas: `react`, `vite`, `express`, `pg`, `lucide-react`,
  Docker, Caddy, PostgreSQL.
- Banco/persistencia: PostgreSQL 16 em Docker, tabela `app_store`, coluna JSONB
  `data`; fallback por arquivo JSON apenas se `DATABASE_URL` nao estiver
  configurada.
- Integracoes externas: Evolution API para WhatsApp; Olist/Tiny aparece em
  variaveis de ambiente legadas se configurada.
- Dados sensiveis: credenciais master, senha PostgreSQL, chave Evolution API e
  token Olist/Tiny via `.env`; manter segredos fora de build publico e logs.
- Regra de dados: dados de negocio ficam no servidor/banco, nunca em storage do
  navegador.
- Regra de UI: iPhone/mobile first em toda tela, fluxo, formulario, tabela,
  modal, navegacao e CTA.

## Estrutura

- `wine`: aplicacao principal Ponto Controle.
- `base de dados`: backups/restores de dados, incluindo
  `ponto-controle-db-backup-2026-06-10.json`.
- `wsp`: outro produto/legado (`gabinete360`) e documentos auxiliares.
- `Imagens`: imagens de referencia.
- `velascordeiro`: pasta auxiliar ainda nao analisada.
- `.agents` e `.codex`: artefatos auxiliares do ambiente.

## Modulos e Fluxos

- Autenticacao: `POST /api/session`, sessoes em memoria do servidor, sem
  persistencia no navegador.
- Bootstrap: `GET /api/bootstrap` entrega dados filtrados por usuario/permissao.
- Clientes/servicos/equipe/atividades/agenda/financeiro/relatorios/usuarios:
  CRUD e consultas via API Express, persistidos no PostgreSQL.
- WhatsApp: rotas `/api/whatsapp/*` integram com Evolution API quando
  configurada.
- Configuracoes publicas: `/api/public-settings` e `/api/login-image`.
- Deploy: containers `ponto-controle-app`, `ponto-controle-db` e `adegaweb`.
- HTTPS/proxy: Caddy serve `adegaweb.com.br` e `www.adegaweb.com.br`.

## Funcionalidades

Usar os status:

- `READY`
- `PARTIAL`
- `PLACEHOLDER`
- `LEGACY`
- `MISSING`

| Recurso | Status | Onde | Observacoes |
| --- | --- | --- | --- |
| Aplicacao Ponto Controle | READY | `wine/src`, `wine/server` | Produto ativo publicado. |
| PostgreSQL online | READY | Docker `ponto-controle-db` | Dados principais em `app_store.data` JSONB. |
| Restore do backup | READY | `base de dados`, PostgreSQL | 2 usuarios, 2 empresas master, 4 clientes, 96 financeiros. |
| HTTPS Adegaweb | READY | `wine/Caddyfile` | Certificados emitidos para apex e www. |
| iPhone-first | READY | `AGENTS.md`, `wine/AGENTS.md` | Regra permanente de UI. |
| Sem storage local de negocio | READY | `wine/src/App.tsx` | `localStorage/sessionStorage/IndexedDB` removidos do codigo. |
| Docker Compose | PARTIAL | `wine/docker-compose.yml` | Arquivo atualizado, mas Compose local do servidor esta quebrado. |
| Backup automatizado PostgreSQL | READY | Docker `ponto-controle-backup` | `pg_dump` diario em `base de dados/backups`, retencao 14 dias. |
| WhatsApp CRM | PARTIAL | `wine/server/index.js`, `wine/src/App.tsx` | Envia/recebe via Evolution, busca contatos por `findContacts`, lixeira/restauracao local, edicao outbound quando ha chave da Evolution, sincronizacao por `findChats/findMessages`; historico antigo depende da Evolution retornar dados apos reconexao. |
| Tabelas relacionais normalizadas | PARTIAL | PostgreSQL JSONB | JSONB e conservador; normalizar se houver necessidade analitica. |
| `wsp/gabinete360` | LEGACY | `wsp/files` | Nao e o produto publicado em Adegaweb. |

## Riscos e Limites

- Riscos estruturais: estado da aplicacao ainda e documento JSONB unico; bom
  para migracao conservadora, limitado para consultas SQL complexas.
- Riscos de dados/privacidade: `.env` contem segredos; nao expor em logs,
  screenshots ou commits.
- Riscos operacionais: Compose local indisponivel; manutencao usa Docker puro
  ate corrigir Compose v2.
- Riscos de producao: qualquer alteracao em Docker, banco, Caddy ou restore e
  classe D3 e exige rollback claro.
- Dividas tecnicas: rotina de backup PostgreSQL ausente; tabelas normalizadas
  ainda nao implementadas.
- Ambiguidades: `wsp`, `velascordeiro` e outros legados podem conter codigo nao
  relacionado ao produto ativo.

## Decisoes

| Data | Tema | Classe | Porta | Decisao | Rollback | Revisao |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-06-10 | Raiz Dream Team | D2 | Two-way | Instalar/adaptar Dream Team na raiz `/home/sheila/codex/pontocontrole`, mantendo protocolo base e regras do projeto. | Remover arquivos Dream Team da raiz ou voltar aos arquivos de `/home/sheila/codex/dreamteam`. | Quando nova estrutura de repo for definida. |
| 2026-06-10 | Deploy servidor atual | D3 | Two-way | Publicar Ponto Controle em Docker para `adegaweb.com.br` e `www.adegaweb.com.br`, IP `144.33.20.37`, usando Caddy. | Parar/remover containers `adegaweb` e `ponto-controle-app`; preservar volumes com backup. | Apos instalar Docker Compose funcional. |
| 2026-06-10 | Persistencia SQL | D3 | Two-way | Migrar backup para PostgreSQL JSONB e remover storage persistente do navegador. | Recriar app sem `DATABASE_URL` para fallback JSON; restaurar backup de `base de dados`. | Evoluir para tabelas normalizadas se necessario. |
| 2026-06-10 | iPhone-first | D2 | Two-way | Tornar iPhone/mobile first regra permanente do projeto. | Remover regra dos `AGENTS.md`; nao recomendado. | Toda mudanca de UI. |
| 2026-06-10 | Sessoes e backup | D3 | Two-way | Persistir sessoes em PostgreSQL, remover pisca no F5 com `authChecking` e ativar backup automatico. | Reverter `server/index.js`, `src/App.tsx`, `docker-compose.yml`; parar `ponto-controle-backup`. | Apos uso real em iPhone. |
| 2026-06-10 | WhatsApp estilo Gabinete360 | D2 | Two-way | Adaptar somente a aba WhatsApp para layout de conversa tipo WhatsApp Web, mantendo APIs/dados do Ponto Controle e QR parado por 1 minuto. | Reverter `wine/src/App.tsx` e `wine/src/styles.css`; reconstruir imagem anterior. | Apos testar com QR real no iPhone. |
| 2026-06-10 | WhatsApp lixeira/historico | D2 | Two-way | Adicionar lixeira/restauracao local de mensagens e conversas, edicao de mensagens outbound com chave Evolution e sincronizacao tentativa de historico via Evolution. | Reverter `wine/server/index.js`, `wine/src/App.tsx` e `wine/src/styles.css`; reconstruir imagem anterior. | Apos teste com instancia Evolution real conectada. |

## Proximos Passos

- Agora: revisar credenciais reais no `.env`, especialmente `MASTER_PASSWORD`,
  `POSTGRES_PASSWORD` e chaves de integracao.
- Proximo: instalar/corrigir Docker Compose v2 para operar
  `wine/docker-compose.yml` diretamente.
- Depois: revisar telas principais em iPhone real.
