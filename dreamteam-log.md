# Dream Team Log

Registro auditavel de pedidos, leituras, decisoes, alteracoes, testes e
pendencias.

## 2026-06-23

- Pedido do usuario: permitir concluir uma atividade vencida que veio de agenda
  recorrente, inclusive movendo de Planejada para Concluida, e gerar a proxima
  atividade recorrente em Planejamento.
- Data/hora: 2026-06-23 21:04 UTC.
- Contexto: atividades criadas automaticamente pela Agenda podem nao ter
  servico contratado vinculado; a validacao geral de atividades exigia servico
  contratado em toda edicao e podia impedir a conclusao antes da rotina que gera
  a proxima ocorrencia.
- Arquivos analisados: `dreamteam.md`, `wine/server/index.js`,
  `wine/src/App.tsx`, `dreamteam-log.md`, `wine/dreamteam-log.md`.
- Decisoes: no `PUT /api/activities/:id`, detectar se a atividade esta
  vinculada a uma agenda; para atividades vinculadas, nao exigir
  `clientServiceId/serviceId` na validacao de edicao; manter a exigencia para
  atividades manuais.
- Motivos: agenda recorrente deve permitir finalizar a atividade operacional
  mesmo vencida e sem contrato vinculado, usando a rotina existente
  `ensureNextRecurringActivityForCompletedActivity` para criar a proxima
  atividade.
- Arquivos alterados: `wine/server/index.js`, `dreamteam-log.md`,
  `wine/dreamteam-log.md`.
- O que mudou: atividade vinculada a agenda pode ser concluida mesmo sem
  servico contratado; ao concluir recorrencia, a proxima atividade continua
  sendo criada em `planned`.
- Como desfazer: reverter `wine/server/index.js` deste commit.
- Testes executados: `node --check server/index.js`; `npm run build`;
  `sudo ./scripts/deploy-docker-run.sh`;
  `curl -fsS https://adegaweb.com.br/api/health`;
  `curl -fsS https://www.adegaweb.com.br/api/health`; `sudo -n docker ps`.
- Resultados: sintaxe do servidor passou; build Vite passou; deploy em
  producao concluido; os dois dominios retornaram
  `{"ok":true,"app":"ponto-controle","store":"postgres"}`; container
  `ponto-controle-app` ficou healthy.
- Pendencias: nenhuma.

## 2026-06-18

- Pedido do usuario: Agenda tambem deve permitir agendar por empresa master,
  mantendo agendas separadas.
- Data/hora: 2026-06-19 19:24 UTC.
- Contexto: o sistema ja separava clientes, equipe, servicos e atividades por
  empresa master; a Agenda tinha `masterCompanyId` no backend, mas a interface
  ainda nao tinha filtro/seleção explícita por master.
- Arquivos analisados: `dreamteam.md`, `wine/src/App.tsx`,
  `wine/server/index.js`, estado Git.
- Decisoes: adicionar filtro `Empresa master` na Agenda quando houver mais de
  uma master acessivel; filtrar eventos, clientes e pessoas pela master
  selecionada; criar novo agendamento na master selecionada; mostrar selecao de
  master no formulario para qualquer usuario multiempresa.
- Motivos: manter agendas separadas por empresa master sem ampliar acesso a
  dados, usando somente dados ja autorizados pelo backend.
- Arquivos alterados: `wine/src/App.tsx`, `dreamteam-log.md`,
  `wine/dreamteam-log.md`.
- O que mudou: Agenda agora pode ser filtrada por empresa master, e novos
  eventos usam a master selecionada.
- Como desfazer: reverter `wine/src/App.tsx` deste commit.
- Testes executados: `npm run build`; `sudo ./scripts/deploy-docker-run.sh`;
  `curl -fsS https://adegaweb.com.br/api/health`;
  `curl -fsS https://www.adegaweb.com.br/api/health`; `sudo -n docker ps`.
- Resultados: build Vite passou; deploy em producao concluido; os dois
  dominios retornaram `{"ok":true,"app":"ponto-controle","store":"postgres"}`;
  container `ponto-controle-app` ficou healthy.
- Pendencias: nenhuma.

- Pedido do usuario: em Serviços, permitir procurar/filtrar por empresa master.
- Data/hora: 2026-06-19 18:51 UTC.
- Contexto: depois de adicionar filtro por empresa master em Equipe, a tela de
  Serviços também precisava do mesmo recorte para operacao multiempresa.
- Arquivos analisados: `dreamteam.md`, `wine/src/App.tsx`, estado Git.
- Decisoes: adicionar estado `serviceMasterCompanyFilter`; mostrar o seletor
  `Empresa master` quando houver mais de uma master acessivel; aplicar o filtro
  em `filteredServices`; resetar filtros ao abrir Serviços; manter a selecao do
  detalhe limitada aos serviços filtrados.
- Motivos: consistencia operacional entre Equipe, Atividades e Serviços sem
  alterar autorizacao de backend.
- Arquivos alterados: `wine/src/App.tsx`, `dreamteam-log.md`,
  `wine/dreamteam-log.md`.
- O que mudou: Serviços agora pode ser filtrado por empresa master.
- Como desfazer: reverter `wine/src/App.tsx` deste commit.
- Testes executados: `npm run build`; `sudo ./scripts/deploy-docker-run.sh`;
  `curl -fsS https://adegaweb.com.br/api/health`;
  `curl -fsS https://www.adegaweb.com.br/api/health`; `sudo -n docker ps`.
- Resultados: build Vite passou; deploy em producao concluido; os dois
  dominios retornaram `{"ok":true,"app":"ponto-controle","store":"postgres"}`;
  container `ponto-controle-app` ficou healthy.
- Pendencias: nenhuma.

- Pedido do usuario: em Equipe, adicionar opcao de empresa master nos filtros e
  colocar titulo nos campos de filtro e busca.
- Data/hora: 2026-06-19 16:56 UTC.
- Contexto: apos habilitar operacao multiempresa, a tela de Equipe precisava
  permitir separar pessoas por empresa master e identificar melhor os campos de
  busca.
- Arquivos analisados: `dreamteam.md`, `wine/src/App.tsx`,
  `wine/src/styles.css`, estado Git.
- Decisoes: adicionar filtro de `Empresa master` apenas quando houver mais de
  uma master acessivel ao usuario; manter busca por pessoa e servico alocado,
  agora com titulos visiveis; resetar filtros ao abrir Equipe.
- Motivos: melhora operacional sem ampliar acesso a dados, pois usa somente as
  empresas master ja presentes no bootstrap autorizado.
- Arquivos alterados: `wine/src/App.tsx`, `wine/src/styles.css`,
  `dreamteam-log.md`, `wine/dreamteam-log.md`.
- O que mudou: Equipe ganhou filtro por empresa master e labels `Pessoa` e
  `Serviços alocados` nos campos de busca.
- Como desfazer: reverter `wine/src/App.tsx` e `wine/src/styles.css` deste
  commit.
- Testes executados: `npm run build`; `sudo ./scripts/deploy-docker-run.sh`;
  `curl -fsS https://adegaweb.com.br/api/health`;
  `curl -fsS https://www.adegaweb.com.br/api/health`; `sudo -n docker ps`.
- Resultados: build Vite passou; deploy em producao concluido; os dois
  dominios retornaram `{"ok":true,"app":"ponto-controle","store":"postgres"}`;
  container `ponto-controle-app` ficou healthy.
- Pendencias: nenhuma.

- Pedido do usuario: corrigir publicacao no GitHub porque o repositorio remoto
  mostrava apenas `Initial commit` em vez dos commits retroativos.
- Data/hora: 2026-06-19 00:00 UTC.
- Contexto: o historico retroativo havia sido criado localmente, mas ainda nao
  estava publicado no remoto `spetnys/pontocontrole`; o GitHub tinha uma `main`
  propria com apenas um commit inicial.
- Arquivos analisados: `dreamteam.md`, `.git`, historico local `main`,
  `origin/main`.
- Decisoes: configurar `origin` como
  `git@github.com:spetnys/pontocontrole.git`; buscar a `main` remota; publicar
  a `main` local usando `git push --force-with-lease -u origin main` para
  substituir com seguranca o commit inicial remoto pelo historico reconstruido.
- Motivos: o pedido explicito era publicar todos os commits retroativos no
  GitHub; `--force-with-lease` evita sobrescrever alteracao remota inesperada.
- Arquivos alterados: nenhum arquivo de codigo; refs/configuracao Git local e
  branch remota `main`.
- O que mudou: `origin/main` passou de `f9aefab Initial commit` para
  `14effef docs: registrar historico Git reconstruido`, com 28 commits
  publicados.
- Como desfazer: restaurar a `main` remota para `f9aefab` com push explicito,
  se for necessario voltar ao commit inicial do GitHub.
- Testes executados: `git fetch origin main`; `git rev-list --count main`;
  `git rev-list --count origin/main`; `git push --force-with-lease -u origin
  main`; `git ls-remote origin refs/heads/main`; `git log origin/main`;
  `git status --short --branch`.
- Resultados: push aceito; `origin/main` aponta para
  `14effefa3e4d4fb21223dbd612ebdac341495e91`; remoto validado com 28 commits;
  branch local rastreia `origin/main`.
- Pendencias: nenhuma.

- Pedido do usuario: criar historico Git retroativo do projeto Ponto Controle
  para uso no GitHub.
- Data/hora: 2026-06-18 23:58 UTC.
- Contexto: foi criada chave SSH para GitHub e o usuario adicionou a chave ao
  projeto Ponto Controle; a raiz tinha uma pasta `.git` vazia/invalida, sem
  historico Git recuperavel.
- Arquivos analisados: `dreamteam.md`, `.git`, `dreamteam-log.md`,
  `wine/dreamteam-log.md`, estrutura da raiz, `wine/package.json`,
  `wine/server/index.js`, `wine/src/App.tsx`.
- Decisoes: inicializar um novo repositorio Git local; criar `.gitignore`
  conservador para excluir dependencias, build, `.env`, banco e backups;
  reconstruir commits retroativos com base nos registros de `dreamteam-log.md`,
  deixando claro que e historico reconstruido, nao historico Git original.
- Motivos: nao ha commits reais anteriores nesta copia; criar commits com datas
  dos logs organiza auditoria sem inventar diffs inexistentes.
- Arquivos alterados: `.gitignore`, `.git`, `dreamteam-log.md`,
  `wine/dreamteam-log.md`.
- O que mudou: repositorio Git local sera inicializado e preparado para GitHub;
  arquivos sensiveis/pesados foram bloqueados no `.gitignore`.
- Como desfazer: remover `.git` e `.gitignore`; se ja houver push, remover ou
  recriar o repositorio remoto conforme necessidade.
- Testes executados: `git status --short`; `git status --ignored --short`;
  `git add .`; `git commit`; commits retroativos com `git commit --allow-empty`;
  `git log --oneline --decorate --date=iso`; `git remote -v`; configuracao
  `core.sshCommand` com a chave SSH do projeto.
- Resultados: `.git` antigo estava vazio/invalido; novo Git local foi criado
  com 27 commits, sendo um snapshot inicial reconstruido e 26 marcos
  retroativos baseados nos logs; `git status --short` ficou limpo; ainda nao ha
  remoto configurado.
- Pendencias: receber a URL SSH do repositorio GitHub para configurar `origin`
  e fazer `git push -u origin main`.

- Pedido do usuario: permitir que a administradora geral crie clientes
  escolhendo a empresa master, filtre atividades por empresa master e configure
  usuarios com acesso a mais de uma empresa master quando necessario.
- Data/hora: 2026-06-18 21:56 UTC.
- Contexto: a administradora geral trabalha para mais de uma empresa master e
  precisa visualizar/operar tudo; usuarios comuns devem continuar restritos a
  sua empresa master, salvo permissao multiempresa explicita.
- Arquivos analisados: `dreamteam.md`, `wine/AGENTS.md`,
  `wine/server/index.js`, `wine/src/App.tsx`, `dreamteam-log.md`,
  `wine/dreamteam-log.md`.
- Decisoes: ampliar a regra de acesso por master no backend com
  `permissions.multiMasterAccess` e `permissions.masterCompanyIds`; manter
  administradora principal com acesso total; mostrar selecao de empresa master
  no cliente somente para administradora geral; adicionar filtro de empresa
  master em atividades quando houver mais de uma master acessivel.
- Motivos: filtro visual sem autorizacao no backend seria insuficiente; o
  vinculo por `masterCompanyId` ja existe em clientes e atividades.
- Arquivos alterados: `wine/server/index.js`, `wine/src/App.tsx`,
  `dreamteam-log.md`, `wine/dreamteam-log.md`.
- O que mudou: usuarios podem receber acesso multiempresa pela tela de
  Usuarios; clientes novos podem ser criados pela administradora geral na master
  escolhida; atividades podem ser filtradas por master; backend filtra clientes,
  atividades e empresas master com base nas masters permitidas.
- Como desfazer: reverter `wine/server/index.js` e `wine/src/App.tsx`; remover
  dos usuarios quaisquer permissoes `multiMasterAccess`/`masterCompanyIds`
  gravadas em teste, se necessario.
- Testes executados: `node --check server/index.js`; `npm run build`;
  `sudo ./scripts/deploy-docker-run.sh`;
  `curl -fsS https://adegaweb.com.br/api/health`;
  `curl -fsS https://www.adegaweb.com.br/api/health`; `sudo -n docker ps`.
- Resultados: sintaxe do servidor passou; build Vite passou; deploy em
  producao concluido; os dois dominios retornaram
  `{"ok":true,"app":"ponto-controle","store":"postgres"}`; container
  `ponto-controle-app` ficou healthy.
- Pendencias: validar visualmente com a administradora geral criando cliente em
  outra empresa master e filtrando atividades por master.

- Pedido do usuario: remover os relatorios personalizados do Ponto Controle.
- Data/hora: 2026-06-18 21:03 UTC.
- Contexto: o usuario decidiu que nao fara os relatorios personalizados dentro
  do Ponto Controle; a funcionalidade expunha menu, permissao, tela, portal do
  cliente e rotas API para faturamento de vendas do cliente.
- Arquivos analisados: `dreamteam.md`, `wine/AGENTS.md`,
  `wine/server/index.js`, `wine/src/App.tsx`, `wine/src/styles.css`,
  `dreamteam-log.md`, `wine/dreamteam-log.md`.
- Decisoes: remover a funcionalidade visivel e as rotas de API; preservar a
  chave legada `salesRevenues` no JSON do store para evitar perda de dados nao
  solicitada.
- Motivos: atender ao novo escopo sem executar limpeza destrutiva no banco.
- Arquivos alterados: `wine/server/index.js`, `wine/src/App.tsx`,
  `wine/src/styles.css`, `dreamteam-log.md`, `wine/dreamteam-log.md`.
- O que mudou: modulo `customReports` saiu das permissoes; menu/tela de
  relatorios personalizados foram removidos; permissao por cliente e painel de
  faturamento de vendas no portal foram removidos; rotas
  `/api/custom-reports/sales-revenues` foram removidas; CSS do grafico removido.
- Como desfazer: reverter os arquivos alterados desta entrada; os dados legados
  de `salesRevenues` continuam preservados no store.
- Testes executados: `node --check server/index.js`; `npm run build`;
  `sudo ./scripts/deploy-docker-run.sh`;
  `curl -fsS https://adegaweb.com.br/api/health`;
  `curl -fsS https://www.adegaweb.com.br/api/health`; `sudo -n docker ps`.
- Resultados: sintaxe do servidor passou; build Vite passou; deploy em
  producao concluido; os dois dominios retornaram
  `{"ok":true,"app":"ponto-controle","store":"postgres"}`; container
  `ponto-controle-app` ficou healthy.
- Pendencias: nenhuma tecnica; validar visualmente com usuario administrador se
  o item saiu do menu esperado.

- Pedido do usuario: aplicar regra para compromissos recorrentes gerarem apenas
  uma atividade por vez, criando a proxima atividade quando a atual for
  concluida.
- Data/hora: 2026-06-18 20:29 UTC.
- Contexto: agendamentos recorrentes podiam gerar preocupacao de acumulo de
  atividades nao feitas; a agenda ja tinha recorrencia semanal/quinzenal/mensal
  e uma atividade vinculada por `activityId`.
- Arquivos analisados: `dreamteam.md`, `wine/server/index.js`,
  `wine/src/App.tsx`, `dreamteam-log.md`, `wine/dreamteam-log.md`.
- Decisoes: manter a agenda como fonte da recorrencia; ao concluir uma
  atividade vinculada a agenda recorrente, criar uma nova atividade planejada
  para a proxima ocorrencia e atualizar `agenda.activityId`; nao gerar varias
  atividades futuras automaticamente.
- Motivos: evitar poluir o quadro com muitas atividades futuras/atrasadas e
  preservar uma fila operacional simples.
- Arquivos alterados: `wine/server/index.js`, `wine/src/App.tsx`,
  `dreamteam-log.md`, `wine/dreamteam-log.md`.
- O que mudou: backend calcula a proxima data semanal, quinzenal ou mensal,
  cria a proxima atividade ao concluir a atual e move o vinculo da agenda para
  ela; card mostra a recorrencia na pílula de agenda vinculada.
- Como desfazer: reverter `wine/server/index.js` e `wine/src/App.tsx`; remover
  manualmente atividades recorrentes criadas em teste se necessario.
- Testes executados: `node --check server/index.js`; `npm run build`;
  `sudo ./scripts/deploy-docker-run.sh`;
  `curl -fsS https://adegaweb.com.br/api/health`;
  `curl -fsS https://www.adegaweb.com.br/api/health`; `sudo -n docker ps`.
- Resultados: sintaxe e build passaram; deploy em producao concluido; os dois
  dominios retornaram `{"ok":true,"app":"ponto-controle","store":"postgres"}`;
  container `ponto-controle-app` ficou healthy.
- Pendencias: validar com uma agenda recorrente real semanal/mensal.

- Pedido do usuario: notificar como atrasada atividade planejada cujo inicio ja
  passou, notificar termino vencido quando nao concluida, e manter a mesma tela
  apos refresh.
- Data/hora: 2026-06-18 19:41 UTC.
- Contexto: o alerta anterior considerava apenas `dueDate` vencido; refresh
  voltava para Inicio porque a tela atual ficava apenas em memoria React.
- Arquivos analisados: `dreamteam.md`, `wine/src/App.tsx`,
  `wine/src/styles.css`, `dreamteam-log.md`, `wine/dreamteam-log.md`.
- Decisoes: atraso passa a considerar dois motivos: `Início atrasado` quando
  `startDate` passou e status ainda e `planned`, e `Término vencido` quando
  `dueDate` passou e status nao e `done`; preservar tela por hash de URL
  `#view=...`, sem usar `localStorage` ou `sessionStorage`.
- Motivos: cobrir atividades de agenda e criadas manualmente com a mesma regra;
  respeitar a regra do projeto de nao persistir dados de negocio no navegador.
- Arquivos alterados: `wine/src/App.tsx`, `dreamteam-log.md`,
  `wine/dreamteam-log.md`.
- O que mudou: cards atrasados indicam o motivo exato; menu atual fica na URL
  e o refresh retorna para a mesma tela quando o usuario tem permissao.
- Como desfazer: reverter `wine/src/App.tsx`.
- Testes executados: `node --check server/index.js`; `npm run build`;
  `sudo ./scripts/deploy-docker-run.sh`;
  `curl -fsS https://adegaweb.com.br/api/health`;
  `curl -fsS https://www.adegaweb.com.br/api/health`; `sudo -n docker ps`.
- Resultados: sintaxe e build passaram; deploy em producao concluido; os dois
  dominios retornaram `{"ok":true,"app":"ponto-controle","store":"postgres"}`;
  container `ponto-controle-app` ficou healthy.
- Pendencias: validar visualmente refresh em telas internas e cards com atraso
  por inicio vencido.

- Pedido do usuario: permitir duplicar atividade, abrindo a nova com campos
  previamente preenchidos a partir da original para ajuste antes de salvar.
- Data/hora: 2026-06-18 19:28 UTC.
- Contexto: atividades tinham criar/editar/excluir, mas nao havia acao rapida
  para repetir uma atividade semelhante.
- Arquivos analisados: `dreamteam.md`, `wine/src/App.tsx`,
  `wine/src/styles.css`, `dreamteam-log.md`, `wine/dreamteam-log.md`.
- Decisoes: adicionar duplicacao no card de atividade para usuarios com acao
  `create`; abrir formulario de nova atividade sem `id`, preservando cliente,
  servico, responsaveis, status, prioridade, datas, descricao e tags; alterar o
  titulo para indicar copia; nao vincular automaticamente a agenda.
- Motivos: reduzir retrabalho e manter revisao humana antes de criar a nova
  atividade.
- Arquivos alterados: `wine/src/App.tsx`, `dreamteam-log.md`,
  `wine/dreamteam-log.md`.
- O que mudou: card de atividade ganhou botao de duplicar; ao clicar, abre o
  modal de nova atividade com campos editaveis ja preenchidos.
- Como desfazer: reverter `wine/src/App.tsx`.
- Testes executados: `node --check server/index.js`; `npm run build`;
  `sudo ./scripts/deploy-docker-run.sh`;
  `curl -fsS https://adegaweb.com.br/api/health`;
  `curl -fsS https://www.adegaweb.com.br/api/health`; `sudo -n docker ps`.
- Resultados: sintaxe e build passaram; deploy em producao concluido; os dois
  dominios retornaram `{"ok":true,"app":"ponto-controle","store":"postgres"}`;
  container `ponto-controle-app` ficou healthy.
- Pendencias: validar visualmente duplicando uma atividade real.

- Pedido do usuario: controlar agendamentos/atividades atrasadas e permitir que
  atividade vinculada a agenda seja movida entre status de atividades.
- Data/hora: 2026-06-18 19:16 UTC.
- Contexto: atividades criadas a partir de agenda iniciam em `planned`; o quadro
  Kanban ja permitia movimento por drag/drop, mas nao havia destaque claro para
  atraso nem indicacao visual de vinculo com agenda.
- Arquivos analisados: `dreamteam.md`, `wine/AGENTS.md`,
  `wine/src/App.tsx`, `wine/src/styles.css`, `wine/server/index.js`.
- Decisoes: tratar atraso como regra visual derivada de `dueDate < hoje` e
  status diferente de `done`; manter atividades vinculadas a agenda moviveis
  nos mesmos status; exibir resumo, alerta e etiqueta no card.
- Motivos: nao criar novo estado persistido desnecessario; preservar a
  movimentacao livre do Kanban e dar notificacao operacional imediata.
- Arquivos alterados: `wine/src/App.tsx`, `wine/src/styles.css`,
  `dreamteam-log.md`, `wine/dreamteam-log.md`.
- O que mudou: modulo Atividades mostra cards de resumo de atrasadas/vencem
  hoje/com agenda, alerta com nomes das primeiras atrasadas, borda vermelha e
  etiqueta `Atrasada`, e pílula `Agenda vinculada` com data/hora do evento.
- Como desfazer: reverter `wine/src/App.tsx` e `wine/src/styles.css`.
- Testes executados: `node --check server/index.js`; `npm run build`;
  `sudo ./scripts/deploy-docker-run.sh`;
  `curl -fsS https://adegaweb.com.br/api/health`;
  `curl -fsS https://www.adegaweb.com.br/api/health`; `sudo -n docker ps`.
- Resultados: sintaxe e build passaram; deploy em producao concluido; os dois
  dominios retornaram `{"ok":true,"app":"ponto-controle","store":"postgres"}`;
  container `ponto-controle-app` ficou healthy.
- Pendencias: validar visualmente em Atividades com tarefas atrasadas reais.

## 2026-06-17

- Pedido do usuario: corrigir envio de WhatsApp em Atividades para nao abrir
  webmail/aplicativo externo; deve enviar automatico pela API.
- Data/hora: 2026-06-17 20:44 UTC.
- Contexto: o formulario de Atividades usava fallback externo (`wa.me`) quando
  a condicao de permissao local nao passava, e os cards ainda tinham atalhos
  antigos com `mailto`/links externos.
- Arquivos analisados: `wine/src/App.tsx`, `wine/src/styles.css`,
  `wine/server/index.js`, `dreamteam-log.md`, `wine/dreamteam-log.md`.
- Decisoes: remover fallback externo em Atividades; usar somente
  `sendWhatsappText` pela API quando o modulo WhatsApp estiver disponivel;
  trocar atalhos dos cards para botoes de envio direto; se faltar modulo ou
  telefone, mostrar aviso no sistema.
- Motivos: impedir abertura de webmail/aba externa e manter envio automatico
  pela sessao WhatsApp/Evolution.
- Arquivos alterados: `wine/src/App.tsx`, `wine/src/styles.css`,
  `dreamteam-log.md`, `wine/dreamteam-log.md`.
- O que mudou: botoes de WhatsApp de Atividades nao usam mais `wa.me` ou
  `mailto`; os cards tambem enviam pela API sem abrir aplicativo externo.
- Como desfazer: reverter `wine/src/App.tsx` e `wine/src/styles.css`.
- Testes executados: `node --check server/index.js`; `npm run build`;
  `sudo ./scripts/deploy-docker-run.sh`;
  `curl -fsS https://adegaweb.com.br/api/health`;
  `curl -fsS https://www.adegaweb.com.br/api/health`; `sudo -n docker ps`.
- Resultados: sintaxe e build passaram; deploy em producao concluido; os dois
  dominios retornaram `{"ok":true,"app":"ponto-controle","store":"postgres"}`;
  container `ponto-controle-app` ficou healthy.
- Pendencias: testar visualmente envio real em Atividades com Evolution
  conectada.

- Pedido do usuario: permitir em Atividades enviar a atividade pelo WhatsApp
  automaticamente, como ja e feito em Agenda.
- Data/hora: 2026-06-17 20:16 UTC.
- Contexto: a Agenda ja tinha acoes de copiar/enviar convite por WhatsApp via
  Evolution ou `wa.me`; Atividades so tinha lembretes simples nos cards.
- Arquivos analisados: `dreamteam.md`, `wine/src/App.tsx`,
  `dreamteam-log.md`, `wine/dreamteam-log.md`.
- Decisoes: reaproveitar o padrao visual `agenda-share-actions`; criar mensagem
  da atividade com cliente, servico, status, prioridade, inicio, prazo,
  responsaveis e descricao; enviar por API do WhatsApp quando o usuario tem
  modulo WhatsApp e acao de criar; usar fallback `wa.me` quando nao tiver API.
- Motivos: manter consistencia com Agenda sem disparar mensagem automaticamente
  ao salvar, evitando envio involuntario.
- Arquivos alterados: `wine/src/App.tsx`, `dreamteam-log.md`,
  `wine/dreamteam-log.md`.
- O que mudou: formulario de Atividades ganhou botao para copiar mensagem e
  botoes de envio por WhatsApp para cliente e pessoas responsaveis com telefone.
- Como desfazer: reverter `wine/src/App.tsx`.
- Testes executados: `node --check server/index.js`; `npm run build`;
  `sudo ./scripts/deploy-docker-run.sh`;
  `curl -fsS https://adegaweb.com.br/api/health`;
  `curl -fsS https://www.adegaweb.com.br/api/health`; `sudo -n docker ps`.
- Resultados: sintaxe e build passaram; deploy em producao concluido; os dois
  dominios retornaram `{"ok":true,"app":"ponto-controle","store":"postgres"}`;
  container `ponto-controle-app` ficou healthy.
- Pendencias: testar visualmente o envio pelo formulario de Atividades com
  WhatsApp configurado.

- Pedido do usuario: criar vinculo entre agenda e atividades para que, ao criar
  uma reuniao/agendamento, uma atividade seja criada automaticamente em
  planejamento com dia e hora.
- Data/hora: 2026-06-17 18:54 UTC.
- Contexto: agenda e atividades ja tinham relacao opcional por `activityId`,
  mas criar agenda nao gerava atividade automaticamente.
- Arquivos analisados: `dreamteam.md`, `wine/AGENTS.md`,
  `wine/server/index.js`, `wine/src/App.tsx`, `dreamteam-log.md`,
  `wine/dreamteam-log.md`.
- Decisoes: implementar no backend a criacao automatica de atividade apenas
  para novo agendamento com cliente e sem atividade ja selecionada; manter o
  vinculo salvando o `activityId` no evento; manter edicao de agenda sem criar
  duplicatas.
- Motivos: garantir consistencia mesmo se a agenda for criada por API/tela e
  evitar atividade invisivel quando o agendamento nao tem cliente.
- Arquivos alterados: `wine/server/index.js`, `wine/src/App.tsx`,
  `dreamteam-log.md`, `wine/dreamteam-log.md`.
- O que mudou: novo helper cria atividade `planned` com data/hora no texto,
  copia cliente/servico/pessoas e vincula o evento; formulario da agenda mostra
  aviso quando a atividade sera criada.
- Como desfazer: reverter `wine/server/index.js` e `wine/src/App.tsx`; se
  necessario, remover manualmente atividades criadas automaticamente em testes.
- Testes executados: `node --check server/index.js`; `npm run build`;
  `sudo ./scripts/deploy-docker-run.sh`;
  `curl -fsS https://adegaweb.com.br/api/health`;
  `curl -fsS https://www.adegaweb.com.br/api/health`; `sudo -n docker ps`.
- Resultados: sintaxe e build passaram; deploy em producao concluido; os dois
  dominios retornaram `{"ok":true,"app":"ponto-controle","store":"postgres"}`;
  container `ponto-controle-app` ficou healthy.
- Pendencias: testar visualmente criando um agendamento real com cliente.

## 2026-06-16

- Pedido do usuario: apresentar o relatorio de faturamento de vendas em grafico
  visualmente bonito.
- Data/hora: 2026-06-16 17:44 UTC.
- Contexto: o primeiro MVP mostrava evolucao com linhas simples; o usuario
  pediu apresentacao mais visual para o relatorio personalizado.
- Arquivos analisados: `wine/src/App.tsx`, `wine/src/styles.css`,
  `dreamteam-log.md`, `wine/dreamteam-log.md`.
- Decisoes: substituir a visualizacao simples por painel grafico com barras
  mensais, comparativo bruto/liquido, destaque do melhor mes, legenda e resumo
  visual; aplicar o mesmo padrao no portal do cliente e na area interna.
- Motivos: tornar o relatorio mais claro para decisao e apresentacao ao
  cliente, preservando os filtros e permissoes ja implementados.
- Arquivos alterados: `wine/src/App.tsx`, `wine/src/styles.css`,
  `dreamteam-log.md`, `wine/dreamteam-log.md`.
- O que mudou: grafico de faturamento agora usa barras mensais responsivas,
  resumo lateral, destaque do mes selecionado/melhor mes e legenda
  bruto/liquido.
- Como desfazer: reverter `wine/src/App.tsx` e `wine/src/styles.css` para a
  versao anterior do relatorio.
- Testes executados: `node --check server/index.js`; `npm run build`;
  `sudo ./scripts/deploy-docker-run.sh`;
  `curl -fsS https://adegaweb.com.br/api/health`;
  `curl -fsS https://www.adegaweb.com.br/api/health`; `sudo -n docker ps`.
- Resultados: sintaxe e build passaram; deploy em producao concluido; os dois
  dominios retornaram `{"ok":true,"app":"ponto-controle","store":"postgres"}`;
  container `ponto-controle-app` ficou healthy.
- Pendencias: validar visualmente no navegador com dados reais de faturamento.

- Pedido do usuario: implementar Relatorios Personalizados com o primeiro
  relatorio de Faturamento de Vendas do Cliente.
- Data/hora: 2026-06-16 17:38 UTC.
- Contexto: os relatorios atuais medem principalmente servicos/financeiro do
  Ponto Controle; o cliente precisa acompanhar o faturamento das proprias
  vendas, com dados informados separadamente.
- Arquivos analisados: `AGENTS.md`, `dreamteam.md`, `DREAMTEAM_COUNCIL.md`,
  `PROJECT_MEMORY.md`, `wine/AGENTS.md`, `wine/src/App.tsx`,
  `wine/server/index.js`, `wine/package.json`, `dreamteam-log.md`,
  `wine/dreamteam-log.md`.
- Decisoes: criar modulo separado `customReports`; criar colecao
  `salesRevenues`; liberar o relatorio por cliente via
  `customReportAccess.salesRevenue`; manter CRUD interno por permissoes
  existentes de modulo/acoes; no portal do cliente, mostrar somente dados
  filtrados pelo servidor, visiveis ao cliente e de cliente vinculado.
- Motivos: separar faturamento de vendas do cliente do financeiro dos servicos
  cobrados pela plataforma; preservar privacidade e facilitar novos relatorios
  personalizados no futuro.
- Arquivos alterados: `wine/server/index.js`, `wine/src/App.tsx`,
  `dreamteam-log.md`, `wine/dreamteam-log.md`.
- O que mudou: backend ganhou normalizacao, filtros e rotas
  `/api/custom-reports/sales-revenues`; frontend ganhou menu
  `Relatórios personalizados`, cadastro mensal de faturamento de vendas,
  checkbox no cliente para liberar no portal e bloco de faturamento de vendas
  no portal do cliente.
- Como desfazer: reverter `wine/server/index.js` e `wine/src/App.tsx`; remover
  registros `salesRevenues` do JSONB apenas se for necessario limpar dados
  criados durante teste.
- Testes executados: `node --check server/index.js`; `npm run build`;
  `sudo ./scripts/deploy-docker-run.sh`;
  `curl -fsS https://adegaweb.com.br/api/health`;
  `curl -fsS https://www.adegaweb.com.br/api/health`; `sudo -n docker ps`.
- Resultados: sintaxe e build passaram; deploy em producao concluido; os dois
  dominios retornaram `{"ok":true,"app":"ponto-controle","store":"postgres"}`;
  container `ponto-controle-app` ficou healthy.
- Pendencias: testar em navegador com usuario interno e usuario cliente.

## 2026-06-11

- Pedido do usuario: verificar por que chamadas recebidas pelo WhatsApp eram
  recusadas com mensagem automatica do Ponto Controle.
- Data/hora: 2026-06-11 16:00 UTC.
- Contexto: o backend criava instancias Evolution com `rejectCall: true` e
  `msgCall: Este número atende mensagens do Ponto Controle.`, causando rejeicao
  automatica das chamadas.
- Arquivos analisados: `wine/server/index.js`, `wine/src/App.tsx`,
  `dreamteam-log.md`.
- Decisoes: criar novas instancias com `rejectCall: false`; adicionar
  configuracao server-side `/settings/set/{instance}` para tentar aplicar
  `rejectCall: false` tambem em instancias ja existentes; marcar a empresa com
  `whatsappCallsEnabled: true` apos tentativa de configuracao.
- Motivos: permitir que chamadas do WhatsApp cheguem ao aparelho conectado,
  removendo a mensagem automatica de recusa.
- Arquivos alterados: `wine/server/index.js`, `dreamteam-log.md`,
  `wine/dreamteam-log.md`.
- O que mudou: novas conexoes nao rejeitam chamadas e a instancia existente
  tenta receber a configuracao ao abrir/conectar WhatsApp.
- Como desfazer: reverter `wine/server/index.js`; reconstruir a imagem
  anterior.
- Testes executados: `node --check server/index.js`; `npm run lint`;
  `npm run build`; `sudo ./scripts/deploy-docker-run.sh`;
  `curl -fsS https://adegaweb.com.br/api/health`;
  `curl -fsS https://www.adegaweb.com.br/api/health`; `sudo -n docker ps`.
- Resultados: sintaxe, lint e build passaram; deploy em producao concluido;
  dominios retornaram `{"ok":true,"app":"ponto-controle","store":"postgres"}`;
  container `ponto-controle-app` ficou healthy.
- Pendencias: testar uma chamada real; se a Evolution nao aceitar alterar
  settings em instancia existente, reconectar pode ser necessario.

- Pedido do usuario: colocar a funcao de buscar contato do WhatsApp para o lado
  direito da tela.
- Data/hora: 2026-06-11 15:47 UTC.
- Contexto: a busca de contato ficava na lista lateral esquerda junto das
  conversas. O usuario pediu para mover essa funcao para o painel direito da
  conversa.
- Arquivos analisados: `dreamteam.md`, `wine/src/App.tsx`,
  `wine/src/styles.css`.
- Decisoes: remover o formulario e os resultados de busca de contato da
  `whatsapp-sidebar`; inserir a busca em `whatsapp-chat`, abaixo do cabecalho
  da conversa; manter as mesmas acoes de usar contato/criar cliente/criar
  pessoa.
- Motivos: deixar a lateral esquerda focada apenas em conversas e mover acoes
  de contato para o painel operacional da direita.
- Arquivos alterados: `wine/src/App.tsx`, `wine/src/styles.css`,
  `dreamteam-log.md`, `wine/dreamteam-log.md`.
- O que mudou: busca de contato e resultados agora aparecem no lado direito da
  tela; lista lateral manteve apenas status, busca de conversa, nova conversa e
  conversas.
- Como desfazer: reverter `wine/src/App.tsx` e `wine/src/styles.css`;
  reconstruir a imagem anterior.
- Testes executados: `npm run lint`; `npm run build`;
  `sudo ./scripts/deploy-docker-run.sh`;
  `curl -fsS https://adegaweb.com.br/api/health`;
  `curl -fsS https://www.adegaweb.com.br/api/health`; `sudo -n docker ps`.
- Resultados: lint e build passaram; deploy em producao concluido; dominios
  retornaram `{"ok":true,"app":"ponto-controle","store":"postgres"}`;
  container `ponto-controle-app` ficou healthy.
- Pendencias: validar visualmente no WhatsApp em iPhone.

## 2026-06-10

- Pedido do usuario: em Usuarios, deixar `Tipo de usuario` como selecao
  configuravel e criar em configuracoes/usuarios um campo para cadastrar tipos
  de usuarios.
- Data/hora: 2026-06-10 16:01 UTC.
- Contexto: o formulario ja tinha select de tipo, mas apenas com os tipos fixos
  `Pessoa/equipe` e `Cliente`; nao havia cadastro de tipos personalizados.
- Arquivos analisados: `wine/src/App.tsx`, `wine/server/index.js`,
  `wine/src/styles.css`.
- Decisoes: manter `Pessoa/equipe` e `Cliente` como tipos de sistema; adicionar
  tipos personalizados em `settings.userTypes`; expor `options.userTypes` no
  bootstrap; criar endpoints `POST/DELETE /api/settings/user-types`; ao remover
  um tipo personalizado, usuarios voltam para `Pessoa/equipe`.
- Motivos: permitir classificacao operacional de usuarios sem quebrar o fluxo
  especial de portal do tipo `Cliente`.
- Arquivos alterados: `wine/server/index.js`, `wine/src/App.tsx`,
  `wine/src/styles.css`, `dreamteam-log.md`, `wine/dreamteam-log.md`.
- O que mudou: tela Usuarios ganhou painel `Tipos de usuário`; o select de tipo
  usa a lista configurada; filtros e labels usam os tipos dinamicos.
- Como desfazer: reverter `wine/server/index.js`, `wine/src/App.tsx` e
  `wine/src/styles.css`; remover tipos personalizados de `settings.userTypes`
  se necessario.
- Testes executados: `node --check server/index.js`; `npm run lint`;
  `npm run build`; `sudo ./scripts/deploy-docker-run.sh`;
  `curl -fsS https://adegaweb.com.br/api/health`;
  `curl -fsS https://www.adegaweb.com.br/api/health`; `sudo -n docker ps`.
- Resultados: sintaxe, lint e build passaram; deploy em producao concluido;
  dominios retornaram `{"ok":true,"app":"ponto-controle","store":"postgres"}`;
  container `ponto-controle-app` ficou healthy.
- Pendencias: testar criacao/remocao de tipo com usuario administrador.

- Pedido do usuario: permitir excluir agendamentos.
- Data/hora: 2026-06-10 15:51 UTC.
- Contexto: a API de agenda ja tinha rota `DELETE /api/agenda-events/:id`,
  mas dependia da acao global `delete`; a UI tambem nao oferecia exclusao
  dentro do formulario de edicao do evento.
- Arquivos analisados: `wine/src/App.tsx`, `wine/server/index.js`,
  `wine/src/styles.css`, `dreamteam.md`.
- Decisoes: permitir DELETE de agendamento para usuarios com modulo Agenda e
  acesso ao evento; adicionar botao Excluir no formulario de edicao com
  confirmacao; manter escopo por empresa/cliente via filtros existentes.
- Motivos: exclusao de agenda e parte natural do fluxo operacional e deve
  estar disponivel no proprio evento, especialmente no mobile.
- Arquivos alterados: `wine/server/index.js`, `wine/src/App.tsx`,
  `wine/src/styles.css`, `dreamteam-log.md`, `wine/dreamteam-log.md`.
- O que mudou: rota de exclusao da agenda nao exige mais permissao global
  `delete`; modal de evento salvo mostra botao `Excluir`; exclusao fecha o
  modal e atualiza os dados.
- Como desfazer: reverter `wine/server/index.js`, `wine/src/App.tsx` e
  `wine/src/styles.css`; reconstruir a imagem anterior.
- Testes executados: `node --check server/index.js`; `npm run lint`;
  `npm run build`; `sudo ./scripts/deploy-docker-run.sh`;
  `curl -fsS https://adegaweb.com.br/api/health`;
  `curl -fsS https://www.adegaweb.com.br/api/health`; `sudo -n docker ps`.
- Resultados: sintaxe, lint e build passaram; deploy em producao concluido;
  dominios retornaram `{"ok":true,"app":"ponto-controle","store":"postgres"}`;
  container `ponto-controle-app` ficou healthy.
- Pendencias: testar exclusao com usuario real de agenda.

- Pedido do usuario: corrigir de novo a lista lateral esquerda do WhatsApp,
  onde o nome do proprio usuario aparecia quando ele enviava a ultima mensagem.
- Data/hora: 2026-06-10 15:32 UTC.
- Contexto: mensagens outbound vindas da Evolution pelo webhook/sync podem
  trazer `pushName` do dono do WhatsApp. Esse valor estava sendo usado como
  fallback de nome da conversa quando nao havia cliente/equipe/contato
  conhecido.
- Arquivos analisados: `wine/src/App.tsx`, `wine/server/index.js`.
- Decisoes: ignorar `targetLabel` de mensagens outbound vindas de provider
  (`webhook`/`sync`) na lista de conversas; no backend, nao salvar `targetLabel`
  de outbound individual recebido por webhook.
- Motivos: a conversa deve ser identificada pelo telefone, contato, cliente,
  pessoa/equipe ou grupo, nunca pelo nome do remetente proprietario da sessao.
- Arquivos alterados: `wine/src/App.tsx`, `wine/server/index.js`,
  `dreamteam-log.md`, `wine/dreamteam-log.md`.
- O que mudou: labels antigos ruins deixam de aparecer na lista mesmo se ja
  estiverem salvos; mensagens futuras outbound do webhook individual nao salvam
  o nome do proprietario como contato.
- Como desfazer: reverter `wine/src/App.tsx` e `wine/server/index.js`;
  reconstruir a imagem anterior.
- Testes executados: `node --check server/index.js`; `npm run lint`;
  `npm run build`; `sudo ./scripts/deploy-docker-run.sh`;
  `curl -fsS https://adegaweb.com.br/api/health`;
  `curl -fsS https://www.adegaweb.com.br/api/health`; `sudo -n docker ps`.
- Resultados: sintaxe, lint e build passaram; deploy em producao concluido;
  dominios retornaram `{"ok":true,"app":"ponto-controle","store":"postgres"}`;
  container `ponto-controle-app` ficou healthy.
- Pendencias: confirmar visualmente com conversa onde a ultima mensagem foi
  enviada pelo proprio WhatsApp.

- Pedido do usuario: deixar a busca de contato igual a busca de conversa,
  corrigir o botao de criar pessoa/cliente a partir do contato e verificar
  suporte a grupos de WhatsApp.
- Data/hora: 2026-06-10 15:06 UTC.
- Contexto: a busca de contato ainda tinha layout proprio; criar pessoa abria
  o formulario sem trocar para a tela Equipe; grupos eram descartados pelo
  backend (`@g.us`).
- Arquivos analisados: `wine/server/index.js`, `wine/src/App.tsx`,
  `wine/src/styles.css`.
- Decisoes: reutilizar a classe visual `whatsapp-search`; ao criar cliente ou
  pessoa, trocar para a tela correspondente com o formulario aberto; permitir
  grupos em busca/sincronizacao/envio como JID `@g.us`; ocultar acoes de criar
  cliente/pessoa para grupos.
- Motivos: reduzir friccao no fluxo mobile e tratar grupos como conversa, nao
  como cadastro individual.
- Arquivos alterados: `wine/server/index.js`, `wine/src/App.tsx`,
  `wine/src/styles.css`, `dreamteam-log.md`, `wine/dreamteam-log.md`.
- O que mudou: busca de contato usa o mesmo visual de busca de conversa; botoes
  de criar navegam para Clientes/Equipe; grupos podem aparecer e ser usados em
  conversa quando a Evolution retornar `@g.us`.
- Como desfazer: reverter `wine/server/index.js`, `wine/src/App.tsx` e
  `wine/src/styles.css`; reconstruir a imagem anterior.
- Testes executados: `node --check server/index.js`; `npm run lint`;
  `npm run build`; `sudo ./scripts/deploy-docker-run.sh`;
  `curl -fsS https://adegaweb.com.br/api/health`;
  `curl -fsS https://www.adegaweb.com.br/api/health`; `sudo -n docker ps`.
- Resultados: sintaxe, lint e build passaram; deploy em producao concluido;
  dominios retornaram `{"ok":true,"app":"ponto-controle","store":"postgres"}`;
  container `ponto-controle-app` ficou healthy.
- Pendencias: testar com grupo real retornado pela Evolution.

- Pedido do usuario: corrigir a lista do WhatsApp para mostrar o nome da pessoa
  da conversa, compactar o campo de busca de contatos e melhorar a busca que
  nao achou contato existente.
- Data/hora: 2026-06-10 14:31 UTC.
- Contexto: o nome da conversa podia ser trocado pelo `targetLabel` da ultima
  mensagem, inclusive o nome de quem enviou por ultimo. A busca de contato
  dependia apenas de `findContacts`, sem fallback em chats, e o campo visual
  ocupava espaco demais na lateral.
- Arquivos analisados: `wine/src/App.tsx`, `wine/src/styles.css`,
  `wine/server/index.js`.
- Decisoes: resolver o nome da conversa por telefone usando cliente/equipe/
  contato conhecido; nao atualizar o label com a ultima mensagem; buscar
  contatos na Evolution por variacoes de telefone e tambem via `findChats`;
  deduplicar contatos por telefone; reduzir altura/largura visual dos campos.
- Motivos: identificar conversas pelo destinatario/contato e tornar a busca
  mais robusta antes de exigir desconectar/reconectar a instancia.
- Arquivos alterados: `wine/server/index.js`, `wine/src/App.tsx`,
  `wine/src/styles.css`, `dreamteam-log.md`, `wine/dreamteam-log.md`.
- O que mudou: lista de conversas usa nome estavel por telefone; busca de
  contato combina agenda e chats da Evolution; layout lateral ficou mais
  compacto; estado vazio informa quando a Evolution nao tem contato
  sincronizado.
- Como desfazer: reverter `wine/server/index.js`, `wine/src/App.tsx` e
  `wine/src/styles.css`; reconstruir a imagem anterior.
- Testes executados: `node --check server/index.js`; `npm run lint`;
  `npm run build`; `sudo ./scripts/deploy-docker-run.sh`;
  `curl -fsS https://adegaweb.com.br/api/health`;
  `curl -fsS https://www.adegaweb.com.br/api/health`; `sudo -n docker ps`.
- Resultados: sintaxe, lint e build passaram; deploy em producao concluido;
  dominios retornaram `{"ok":true,"app":"ponto-controle","store":"postgres"}`;
  container `ponto-controle-app` ficou healthy.
- Pendencias: testar busca com instancia Evolution conectada; se a Evolution
  ainda nao listar o contato, sincronizar historico/contatos ou reconectar a
  instancia pode ser necessario.

- Pedido do usuario: ajustar a aba WhatsApp para buscar contatos que ja existem
  no WhatsApp do celular e permitir iniciar conversa ou cadastrar como
  cliente/pessoa.
- Data/hora: 2026-06-10 14:25 UTC.
- Contexto: a busca atual da aba WhatsApp encontrava apenas conversas ja
  importadas/salvas no Ponto Controle. A Evolution API possui endpoint
  `findContacts`, mas ele ainda nao estava integrado ao produto.
- Arquivos analisados: `wine/server/index.js`, `wine/src/App.tsx`,
  `wine/src/styles.css`, formularios de cliente/equipe e documentacao Evolution
  API v2 `Find Contacts`.
- Decisoes: criar rota server-side `/api/whatsapp/contacts`; manter a chave da
  Evolution somente no backend; normalizar formatos variados de contato; exibir
  resultados compactos na lateral do WhatsApp; permitir usar contato na nova
  conversa, criar cliente ou criar pessoa somente por clique explicito.
- Motivos: reduzir digitacao/erro sem salvar contato pessoal automaticamente no
  banco.
- Arquivos alterados: `wine/server/index.js`, `wine/src/App.tsx`,
  `wine/src/styles.css`, `PROJECT_MEMORY.md`, `dreamteam-log.md`,
  `wine/dreamteam-log.md`.
- O que mudou: backend consulta `POST /chat/findContacts/{instance}`; UI ganhou
  campo `Contato do celular`, lista de resultados e botoes por icone para
  conversar, criar cliente e criar pessoa.
- Como desfazer: reverter `wine/server/index.js`, `wine/src/App.tsx` e
  `wine/src/styles.css`; reconstruir a imagem anterior.
- Testes executados: `node --check server/index.js`; `npm run lint`;
  `npm run build`; `sudo ./scripts/deploy-docker-run.sh`;
  `curl -fsS https://adegaweb.com.br/api/health`;
  `curl -fsS https://www.adegaweb.com.br/api/health`; `sudo -n docker ps`.
- Resultados: sintaxe, lint e build passaram; deploy em producao concluido;
  dominios retornaram `{"ok":true,"app":"ponto-controle","store":"postgres"}`;
  container `ponto-controle-app` ficou healthy.
- Pendencias: testar com instancia Evolution conectada; retorno real depende
  dos contatos sincronizados pela Evolution.

- Pedido do usuario: aplicar recomendacoes para a sessao do WhatsApp: apagar
  conversas, editar mensagens e restaurar conversas feitas anteriormente no
  celular quando a Evolution permitir.
- Data/hora: 2026-06-10 12:16 UTC.
- Contexto: a aba WhatsApp usava Evolution API para conectar, enviar, receber
  webhook e listar a copia local das mensagens; nao havia lixeira, restauracao,
  edicao ou tentativa de sincronizar historico antigo.
- Arquivos analisados: `dreamteam.md`, `PROJECT_MEMORY.md`,
  `wine/PROJECT_MEMORY.md`, `wine/server/index.js`, `wine/src/App.tsx`,
  `wine/src/styles.css`, documentacao Evolution API v2 para chats/mensagens.
- Decisoes: implementar lixeira/restauracao local como comportamento padrao;
  guardar `providerMessageId`, `remoteJid` e `fromMe` para mensagens novas;
  editar mensagem outbound via Evolution quando houver chave; manter apagar
  conversa como acao reversivel no Ponto Controle; ativar `syncFullHistory`
  para novas instancias e adicionar sincronizacao via `findChats/findMessages`.
- Motivos: evitar apagamento destrutivo no WhatsApp real como padrao e preparar
  a base para acoes reais quando a Evolution tiver os identificadores corretos.
- Arquivos alterados: `wine/server/index.js`, `wine/src/App.tsx`,
  `wine/src/styles.css`, `PROJECT_MEMORY.md`, `dreamteam-log.md`,
  `wine/dreamteam-log.md`.
- O que mudou: API ganhou sincronizacao de historico, edicao de mensagem,
  lixeira/restauracao de mensagem e conversa; UI ganhou botoes compactos para
  sincronizar, abrir lixeira, apagar/restaurar conversa, editar/apagar/restaurar
  mensagem; novas instancias Evolution sao criadas com `syncFullHistory: true`.
- Como desfazer: reverter `wine/server/index.js`, `wine/src/App.tsx` e
  `wine/src/styles.css`; remover este registro dos logs; reconstruir a imagem
  antes de publicar.
- Testes executados: `node --check server/index.js`; `npm run lint`;
  `npm run build`; `sudo ./scripts/deploy-docker-run.sh`;
  `curl -fsS https://adegaweb.com.br/api/health`;
  `curl -fsS https://www.adegaweb.com.br/api/health`;
  `sudo -n docker ps`.
- Resultados: sintaxe, lint e build passaram; deploy em producao concluido;
  `adegaweb.com.br` e `www.adegaweb.com.br` retornaram
  `{"ok":true,"app":"ponto-controle","store":"postgres"}`; containers
  `adegaweb`, `ponto-controle-app`, `ponto-controle-db` e
  `ponto-controle-backup` ficaram ativos, com app healthy.
- Pendencias: testar com uma instancia Evolution real conectada; historico
  antigo depende da Evolution retornar mensagens apos reconexao/sincronizacao.

- Pedido do usuario: descartar auditoria e normalizacao do banco; implementar
  as melhorias restantes: F5 sem piscar, sessoes no PostgreSQL, backup
  automatico, WhatsApp/mobile e revisao iPhone basica.
- Data/hora: 2026-06-10 UTC.
- Contexto: sessoes ja sobreviviam ao F5 por cookie HttpOnly, mas ainda ficavam
  em memoria e o frontend podia mostrar login durante bootstrap. Backup
  automatico ainda nao existia.
- Arquivos analisados: `wine/server/index.js`, `wine/src/App.tsx`,
  `wine/src/styles.css`, `wine/docker-compose.yml`.
- Decisoes: criar tabela `app_sessions`; autenticar por cookie/Bearer buscando
  sessao no PostgreSQL; criar estado `authChecking`; subir container
  `ponto-controle-backup` com `pg_dump` diario e retencao de 14 dias; manter
  auditoria e normalizacao fora do escopo.
- Arquivos alterados: `wine/server/index.js`, `wine/src/App.tsx`,
  `wine/src/styles.css`, `wine/docker-compose.yml`, `PROJECT_MEMORY.md`,
  `dreamteam-log.md`.
- Testes executados: `node --check`, `npm run lint`, `npm run build`, busca por
  storage local, `docker build`, restart do app, login com cookie, bootstrap
  sem Authorization, restart do container e bootstrap novamente, health publico,
  checagem de backup e contagem de `app_sessions`.
- Resultados: F5 simulado funciona; sessao sobrevive a restart do container;
  `ponto-controle-backup` esta rodando; primeiro dump gerado em
  `base de dados/backups`; app healthy com PostgreSQL.
- Pendencias: validar visualmente em iPhone real.

- Pedido do usuario: corrigir logoff ao dar F5 e confirmar se o Dream Team esta
  ativo no projeto com o conselho de mais de 80 pessoas.
- Data/hora: 2026-06-10 UTC.
- Contexto: depois da remocao de `localStorage`, o token ficava apenas no estado
  React. Ao recarregar a pagina, esse estado era perdido e a tela voltava para
  login. A regra do projeto continua proibindo dados de negocio em storage do
  navegador.
- Arquivos analisados: `wine/server/index.js`, `wine/src/App.tsx`,
  `AGENTS.md`, `dreamteam.md`, `DREAMTEAM_COUNCIL.md`, `PROJECT_MEMORY.md`.
- Decisoes: usar cookie de sessao HttpOnly/SameSite no servidor, lido pelo
  backend em `requireAuth`; fazer o frontend tentar `/api/bootstrap` no mount
  sem Authorization; manter token em memoria somente durante a sessao aberta;
  adicionar `DELETE /api/session` para logout limpar o cookie.
- Motivos: F5 precisa preservar a sessao sem voltar a `localStorage`; cookie
  HttpOnly nao expõe o token ao JavaScript e nao guarda dados de negocio.
- Arquivos alterados: `wine/server/index.js`, `wine/src/App.tsx`,
  `dreamteam-log.md`.
- O que mudou: login agora envia `Set-Cookie` para `ponto_controle_session`;
  `requireAuth` aceita Bearer ou cookie; bootstrap por cookie restaura a tela
  apos F5; logout remove sessao e limpa cookie.
- Como desfazer: reverter `wine/server/index.js` e `wine/src/App.tsx`, rebuildar
  Docker e recriar `ponto-controle-app`.
- Testes executados: `node --check server/index.js`; `npm run lint`;
  `npm run build`; contagem do conselho expandido com `awk`; `docker build`;
  recriacao do container; `curl` com cookie jar para login, bootstrap sem
  Authorization, logout e bootstrap apos logout.
- Resultados: F5 simulado funcionou por cookie; bootstrap retornou usuario
  `sheila`, 3 usuarios visiveis e 4 clientes; logout retornou `ok: true`; apos
  logout, bootstrap retornou 401. Conselho expandido confirmado com 95 perfis.
- Pendencias: sessoes ainda sao mantidas em memoria do processo; um restart do
  container exige novo login. Se quiser manter sessao apos restart, criar tabela
  SQL de sessoes.

- Pedido do usuario: deixar a aba WhatsApp simples, parecida com WhatsApp Web,
  e fazer o QR Code ficar parado por 1 minuto sem piscar.
- Data/hora: 2026-06-10 UTC.
- Contexto: a aba WhatsApp tinha painel tecnico de Evolution API, botao de
  conectar, reiniciar, desconectar, atualizar e renderizacao do QR sem janela
  explicita de validade visual. O usuario pediu comportamento simples e estavel
  no padrao WhatsApp Web.
- Arquivos analisados: `wine/src/App.tsx`, `wine/src/styles.css`,
  `wine/server/index.js`.
- Decisoes: implementar validade visual de 60 segundos no frontend; nao gerar
  outro QR enquanto o atual estiver ativo; remover reset automatico ao abrir a
  aba; simplificar o painel para instrucoes de pareamento pelo celular; manter
  controles tecnicos essenciais, mas com copy mais direta.
- Motivos: reduzir piscadas/recriacao visual, aproximar do comportamento
  esperado no WhatsApp Web e preservar iPhone/mobile first.
- Arquivos alterados: `wine/src/App.tsx`, `wine/src/styles.css`.
- O que mudou: `whatsappQr` ganhou `expiresAt`; QR e codigo ficam visiveis e
  parados por 1 minuto; botao mostra `QR Code ativo` durante a validade; bloco
  visual agora orienta `Abra o WhatsApp, toque em Aparelhos conectados...`;
  CSS adicionou cartao de pareamento e tamanho estavel para o QR no iPhone.
- Como desfazer: reverter `wine/src/App.tsx` e `wine/src/styles.css`, rebuildar
  a imagem e recriar `ponto-controle-app`.
- Testes executados: `npm run lint`; `npm run build`; busca por storage local;
  `docker build`; recriacao do container `ponto-controle-app`; `curl` em
  `/api/health`; conferencia dos assets publicados.
- Resultados: lint/build passaram; app voltou `healthy`; health publico retorna
  `store: "postgres"`; assets novos `index-BIPOj_5w.js` e
  `index-CMtCETxr.css` publicados.
- Pendencias: validar visualmente em iPhone real quando uma instancia Evolution
  retornar QR real.

- Pedido do usuario: carregar o Dream Team que estava em `/codex/dreamteam` e
  usar neste projeto, adaptando ao projeto atual sem perder as regras.
- Data/hora: 2026-06-10 UTC.
- Contexto: `/codex/dreamteam` nao existe neste servidor; o kit foi localizado
  em `/home/sheila/codex/dreamteam`. A aplicacao principal do projeto esta em
  `wine`, mas a raiz real do workspace e `/home/sheila/codex/pontocontrole`.
- Arquivos analisados: `/home/sheila/codex/dreamteam/AGENTS.md`,
  `/home/sheila/codex/dreamteam/dreamteam.md`,
  `/home/sheila/codex/dreamteam/DREAMTEAM_COUNCIL.md`,
  `/home/sheila/codex/dreamteam/PROJECT_MEMORY.md`,
  `/home/sheila/codex/dreamteam/dreamteam-log.md`,
  `/home/sheila/codex/dreamteam/README.md`,
  `wine/AGENTS.md`, `wine/dreamteam.md`,
  `wine/DREAMTEAM_COUNCIL.md`, `wine/PROJECT_MEMORY.md`.
- Decisoes: instalar o kit na raiz do projeto; copiar `dreamteam.md`,
  `DREAMTEAM_COUNCIL.md` e `README.md` do kit base sem alterar o protocolo;
  criar `AGENTS.md`, `PROJECT_MEMORY.md` e `dreamteam-log.md` adaptados ao
  Ponto Controle/Adegaweb; manter regras adicionais do projeto sobre
  iPhone-first e dados online no servidor/banco.
- Motivos: garantir que futuras execucoes iniciadas na raiz carreguem o Dream
  Team correto; evitar que memoria antiga da loja/vitrine contamine decisoes do
  produto atual; preservar as regras originais do kit.
- Arquivos alterados/criados: `AGENTS.md`, `README.md`, `dreamteam.md`,
  `DREAMTEAM_COUNCIL.md`, `PROJECT_MEMORY.md`, `dreamteam-log.md`.
- O que mudou: a raiz agora tem Dream Team operacional; `PROJECT_MEMORY.md`
  descreve Ponto Controle, Docker/Caddy/PostgreSQL, restore de `base de dados`,
  regra iPhone-first e regra de nao usar storage local para dados de negocio.
- Como desfazer: remover os arquivos Dream Team da raiz ou restaurar a partir
  de `/home/sheila/codex/dreamteam`; manter `wine/*` se quiser escopo apenas na
  aplicacao.
- Testes executados: `find`/`ls` para localizar kit; `cmp` para confirmar que
  `wine/dreamteam.md` e `wine/DREAMTEAM_COUNCIL.md` ja eram identicos ao kit;
  diff de `AGENTS.md` para identificar adaptacao iPhone-first.
- Resultados: kit base carregado e adaptado a
  `/home/sheila/codex/pontocontrole`.
- Pendencias: opcionalmente limpar memoria legada dentro de
  `wine/PROJECT_MEMORY.md`, que ainda contem trechos historicos de loja antiga.

- Pedido do usuario: trazer apenas o formato da aba WhatsApp do Gabinete360
  para o projeto atual, sem importar o restante do 360.
- Data/hora: 2026-06-10 UTC.
- Decisao: manter as APIs/armazenamento do Ponto Controle e adaptar a UX para
  conversa tipo WhatsApp Web: lista, chat, compositor e QR simples.
- Arquivos alterados: `wine/src/App.tsx`, `wine/src/styles.css`.
- Deploy: imagem `adegaweb-ponto-controle:latest` reconstruida e container
  `ponto-controle-app` recriado.
- Validacao: `npm run build`, build Docker e `https://adegaweb.com.br/api/health`
  OK com store `postgres`.

- Pedido do usuario: investigar e corrigir lentidao geral ao mover atividades,
  salvar agenda e executar acoes comuns.
- Data/hora: 2026-07-08 21:15:05 UTC.
- Contexto: acoes pequenas estavam lentas em producao. A medicao mostrou
  `app_store` com cerca de 361 MB, JSON de negocio com 96 MB e
  `whatsappMessages` sozinho com cerca de 95 MB. Logs do app tambem tinham
  `PayloadTooLargeError`.
- Arquivos analisados: `dreamteam.md`, `wine/server/index.js`,
  `dreamteam-log.md`, `wine/dreamteam-log.md`.
- Decisoes: remover o historico de WhatsApp do `bootstrapPayload` global e
  manter o carregamento do historico somente pelo endpoint dedicado
  `/api/whatsapp`.
- Motivos: respostas globais sao retornadas apos acoes comuns; enviar 95 MB de
  historico de WhatsApp em cada fluxo degrada agenda, atividades e demais
  modulos que nao precisam dessas mensagens.
- Arquivos alterados: `wine/server/index.js`, `dreamteam-log.md`,
  `wine/dreamteam-log.md`.
- O que mudou: `bootstrapPayload` passa a retornar `whatsappMessages: []`; o
  modulo WhatsApp continua usando seus endpoints proprios para mensagens e
  mensagens apagadas.
- Como desfazer: restaurar a linha anterior em `bootstrapPayload`, retornando
  `filterWhatsappMessages(user, store.whatsappMessages)` para usuarios com o
  modulo WhatsApp.
- Testes executados: `node --check server/index.js`; `npm run build`.
- Resultados: sintaxe do servidor valida; build Vite passou, gerando
  `dist/assets/index-5c6siVF1.js` e `dist/assets/index-C1dhWKlM.css`.
- Deploy: `sudo ./scripts/deploy-docker-run.sh` executado em `wine`; imagem
  `adegaweb-ponto-controle:latest` reconstruida e container recriado.
- Validacao em producao: `https://adegaweb.com.br/api/health` e
  `https://www.adegaweb.com.br/api/health` retornaram
  `{"ok":true,"app":"ponto-controle","store":"postgres"}`; container
  `ponto-controle-app` ficou `healthy`.
- Pendencias: acompanhar uso real; se ainda houver lentidao, o proximo passo e
  compactar/sanitizar anexos antigos em `whatsappMessages` com backup antes.
