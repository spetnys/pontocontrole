# Project Memory

Memoria viva do projeto onde o Dream Team foi instalado.

Preencher e atualizar conforme o projeto for entendido. Nao inventar contexto.

## Identidade

- Nome do projeto: Ponto Controle publicado em Adegaweb.
- Raiz operacional: `/home/sheila/codex/pontocontrole/wine`.
- Dono / decisor: usuario solicitante; operacao administrativa indicada para Sheila.
- Tipo de projeto: aplicacao web administrativa em React com backend Node e deploy Docker.
- Publico usuario: administradores e equipe operacional.
- Problema real que resolve: organizar clientes, equipe, atividades, agenda, financeiro, relatorios, permissoes e integracao WhatsApp.

## Estado atual

- Estagio: aplicacao atual em producao via Docker.
- Em producao: sim, `https://adegaweb.com.br` e `https://www.adegaweb.com.br`, IP `144.33.20.37`.
- Usuarios reais: previsto para compradores e gerente da loja; sem metrica registrada.
- Stack principal: React/Vite, TypeScript, Express, Docker, Caddy.
- Dependencias criticas: `react`, `vite`, `express`, `lucide-react`, Docker, Caddy.
- Banco/persistencia: PostgreSQL 16 em Docker, tabela `app_store`, coluna JSONB `data`; fallback por arquivo JSON apenas se `DATABASE_URL` nao estiver configurada.
- Integracoes externas: Evolution API para WhatsApp; Olist/Tiny ainda aparece em variaveis de ambiente legadas se configurada.
- Dados sensiveis: credenciais master, chave Evolution API e token Olist/Tiny via variaveis de ambiente; manter `.env` fora do Git/build.

## Estrutura

- Modulos principais: frontend React, API Express, persistencia JSON, proxy Caddy.
- Rotas/fluxos principais: `/`, `/api/health`, `/api/session`, `/api/public-settings`, `/api/whatsapp/*`, `/api/reports`, `/sitemap.xml`, `/robots.txt`.
- Arquivos criticos: `src/App.tsx`, `src/styles.css`, `server/index.js`, `docker-compose.yml`, `Caddyfile`, `.env.example`, `DEPLOY.md`.
- Legado conhecido: `nginx.conf` e `data/products.json` pertencem a versoes anteriores; deploy atual usa Caddy e PostgreSQL. `/data/ponto-controle.json` fica apenas como fallback/backup legado.
- Publicado x parcial x ausente: aplicacao Ponto Controle publicada; neste servidor o deploy oficial e Docker puro via `scripts/deploy-docker-run.sh`, porque `docker compose` nao esta instalado.
- Regra permanente de UI: iPhone/mobile first. Qualquer tela, formulario, modal, navegacao ou CTA deve ser pensado e validado primeiro para iPhone.
- Regra permanente de comunicacao: respostas ao usuario devem ter no maximo 50 linhas, priorizando decisao, pendencias, validacao e proximo passo.

## Fluxos

Para cada fluxo relevante, registrar:

- Loja: visitante maior de 18 anos confirma idade, busca/filtra produtos, abre detalhe ou compra no Mercado Livre. Dono canonico: storefront. Riscos: imagens externas, produto indisponivel no destino, restricao legal de alcool.
- Administracao: gerente acessa `/admin`, faz login, adiciona/edita/copia/oculta/exclui produtos, salva alteracoes. Dono canonico: API `/api/products` e volume `adegaweb_data`. Riscos: token fraco em ambiente, upload base64 inflar arquivo, perda por restaurar lista inicial.
- ERP da Olist: gerente salva o Token API do ERP no admin, busca produtos ativos por pagina, publica um por um ou em massa, e atualiza publicados; preco, estoque, fotos, categorias e dados brutos vem sempre do ERP para Adegaweb. Dono canonico: API `/api/olist/*`. Riscos: token Olist foi exposto no chat e deve ser rotacionado; API bloqueia muitas chamadas por minuto, entao a tela de importacao usa paginacao.
- Links Mercado Livre: script operacional cruza o catalogo com links especificos ja salvos, produtos visiveis na pagina publica da Varinha e SKUs `MLB`; se nao houver correspondencia confiavel, grava `https://www.mercadolivre.com.br/pagina/varinha`. Dono canonico: `scripts/link-mercadolivre-products.mjs` e volume `/data/products.json`. Riscos: listagem completa e API publica do Mercado Livre retornam bloqueio/validacao no servidor, entao produtos nao visiveis/sem SKU `MLB` ficam no fallback.
- SEO: servidor injeta meta tags e JSON-LD por rota, gera sitemap e robots. Dono canonico: `server/index.js`. Riscos: dados do produto incompletos, imagens externas instaveis.
- Deploy: Docker gera app e Caddy serve `adegaweb.com.br`/`www.adegaweb.com.br`; PostgreSQL guarda os dados principais; Compose esta documentado para ambiente com plugin v2, mas neste servidor o caminho oficial e `scripts/deploy-docker-run.sh`. Dono canonico: Docker/Caddy/PostgreSQL. Riscos: volume persistido manter dados antigos; certificados dependem do dominio apontado.

## Funcionalidades

Usar os status:

- `READY`
- `PARTIAL`
- `PLACEHOLDER`
- `LEGACY`
- `MISSING`

| Recurso | Status | Onde | Observacoes |
| --- | --- | --- | --- |
| Loja mobile first | READY | `src/App.tsx`, `src/styles.css` | Vitrine orientada a compra, busca, seletores compactos, banners rotativos, cards densos para iPhone, fotos contidas e carregamento progressivo para catalogos grandes. |
| Modal 18+ | READY | `AgeGate` | Nao confirma redireciona para `https://varinha.com.br`. |
| Painel de produtos | READY | `AdminPage` | Adicionar, editar, copiar, ocultar, excluir, upload de foto, salvar e restaurar. |
| Persistencia de produtos | READY | `server/index.js`, volume Docker | JSON em `/data/products.json`. |
| Rotas de produto | READY | `/produto/:id` | Pagina individual com CTA Mercado Livre e schema Product. |
| SEO tecnico | READY | `server/index.js` | Meta dinamica, canonical, robots, sitemap e JSON-LD. |
| Integracao ERP da Olist | READY | `server/index.js`, `src/App.tsx`, `docker-compose.yml` | Importacao ERP API 2.0 -> Adegaweb publicada; lista apenas produtos ativos, paginada, com imagens via detalhe do produto. |
| Links para Mercado Livre | READY | `scripts/link-mercadolivre-products.mjs`, volume Docker | 500 produtos atualizados: 19 com link especifico e 481 com fallback para a pagina principal da Varinha. |
| WhatsApp CRM | PARTIAL | `server/index.js`, `src/App.tsx` | Envia/recebe via Evolution, busca contatos por `findContacts`, lixeira/restauracao local, edicao outbound quando ha chave da Evolution, sincronizacao por `findChats/findMessages`; historico antigo depende da Evolution retornar dados apos reconexao. |
| Checkout proprio | MISSING | Fora do escopo atual | Compra finaliza no Mercado Livre. |

## Riscos e limites

- Riscos estruturais: storefront e admin ainda ficam no mesmo bundle; painel usa token simples, adequado apenas como MVP.
- Riscos de dados/privacidade: token Olist foi compartilhado no chat; deve ser inativado/rotacionado antes de qualquer integracao real.
- Riscos operacionais: volume Docker preserva produtos; reset troca a lista por `server/default-products.json`.
- Dividas tecnicas: falta banco de dados, historico de alteracoes, controle multiusuario e validacao forte de URLs/imagens.
- Ambiguidades: volume real tem cerca de 1700 produtos ativos; importacao em massa deve ser usada com cautela por limite de chamadas da API.

## Decisoes

| Data | Tema | Classe | Porta | Decisao | Rollback | Revisao |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-05-17 | Produto/admin | D2 | Two-way | Manter Adegaweb como vitrine propria com compra externa e painel simples para gerente. | Reverter `src/App.tsx`, `src/styles.css`, `server/index.js` e catalogo persistido. | Apos uso real da gerente. |
| 2026-05-17 | SEO | D2 | Two-way | Gerar rotas `/produto/:id`, sitemap e JSON-LD no servidor para melhor indexacao. | Remover injecao dinamica e voltar ao SPA estatico. | Ao conectar catalogo real. |
| 2026-05-17 | Integracao Olist | D2 | Two-way | Nao usar token recebido no chat; apenas confirmar viabilidade pela documentacao publica. | Nao aplicavel. | Antes de implementar, rotacionar token e confirmar `X-Shop-Host`. |
| 2026-05-17 | Importacao Olist | D2 | Two-way | Implementar fluxo Olist -> Adegaweb com publicacao individual, em massa e sincronizacao dos publicados. | Reverter alteracoes em `server/index.js`, `src/App.tsx`, `src/styles.css`, `docker-compose.yml`, `.env.example` e `eslint.config.js`. | Apos configurar token novo e `OLIST_SHOP_HOST`. |
| 2026-05-18 | ERP da Olist | D2 | Two-way | Trocar integracao de Olist Ecommerce/VNDA para ERP da Olist API v3 (`api.tiny.com.br/public-api/v3`) sem `X-Shop-Host`. | Reverter alteracoes em `server/index.js`, `src/App.tsx`, `docker-compose.yml` e `.env.example`. | Apos gerar token OAuth valido do ERP. |
| 2026-05-18 | ERP API 2.0 | D2 | Two-way | Usar Token API do ERP via `api.tiny.com.br/api2`, listar apenas `situacao=A` e hidratar imagens por pagina. | Reverter alteracoes em `server/index.js`, `src/App.tsx`, `src/styles.css`, `docker-compose.yml`, `.env.example`. | Apos teste real de publicacao selecionada. |
| 2026-05-18 | UX da loja | D2 | Two-way | Transformar a primeira tela em loja de compra rapida inspirada em melhores praticas de marketplace: busca, categorias, ordenacao, destaque, buy box e carregamento inicial de 24 produtos. | Reverter alteracoes em `src/App.tsx` e `src/styles.css`. | Apos revisao do catalogo real publicado. |
| 2026-05-18 | Paleta visual | D1 | Two-way | Trocar a identidade visual clara/pastel por preto, roxo e laranja forte, mantendo cards legiveis e CTAs de compra em alto contraste. | Reverter alteracoes em `src/styles.css` e `public/*.svg`. | Apos avaliacao visual do dono no site publicado. |
| 2026-05-18 | Banners rotativos | D1 | Two-way | Adicionar banners rotativos logo abaixo da busca/filtros, usando produtos reais da vitrine como conteudo automatico. | Remover bloco `promo-carousel` em `src/App.tsx` e CSS correspondente. | Apos cadastrar banners proprios no admin, se necessario. |
| 2026-05-18 | Links Mercado Livre | D2 | Two-way | Apontar cada produto para link especifico quando houver link salvo, SKU `MLB` ou match na pagina publica da Varinha; demais vao para a pagina principal da Varinha. | Restaurar backup do volume ou rodar script novamente com outra regra. | Apos acesso autorizado/API de anuncios do Mercado Livre, se o dono quiser 100% especifico. |
| 2026-06-10 | Deploy servidor atual | D3 | Two-way | Publicar a aplicacao atual Ponto Controle em Docker para `adegaweb.com.br` e `www.adegaweb.com.br`, IP `144.33.20.37`, usando Caddy e volumes nomeados. | Parar/remover containers `adegaweb` e `ponto-controle-app`; preservar/remover volumes apenas com backup. | Apos instalar Docker Compose funcional ou automatizar systemd. |
| 2026-06-10 | Persistencia SQL | D3 | Two-way | Migrar a base restaurada para PostgreSQL JSONB e remover uso de `localStorage` no frontend. | Recriar app sem `DATABASE_URL` para voltar ao arquivo JSON; manter backup em `base de dados`. | Evoluir para tabelas normalizadas quando houver tempo de refatoracao. |
| 2026-06-10 | WhatsApp lixeira/historico | D2 | Two-way | Adicionar lixeira/restauracao local de mensagens e conversas, edicao de mensagens outbound com chave Evolution e sincronizacao tentativa de historico via Evolution. | Reverter `server/index.js`, `src/App.tsx` e `src/styles.css`; reconstruir imagem anterior. | Apos teste com instancia Evolution real conectada. |

## Proximos passos

- Agora: revisar credenciais reais no `.env`, especialmente `MASTER_PASSWORD`, `POSTGRES_PASSWORD` e chaves de integracao.
- Proximo: se quiser voltar a usar Compose, instalar Docker Compose v2; ate la, usar `sudo ./scripts/deploy-docker-run.sh`.
- Depois: criar rotina de backup do volume `adegaweb_ponto_controle_data`.
