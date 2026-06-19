# Dream Team Log

Registro auditavel de pedidos, leituras, decisoes, alteracoes, testes e
pendencias.

## 2026-06-18

- Pedido do usuario: criar historico Git retroativo do projeto Ponto Controle
  para uso no GitHub.
- Data/hora: 2026-06-18 23:58 UTC.
- Contexto: a aplicacao `wine` faz parte do projeto que sera versionado no
  GitHub; nao havia historico Git valido nesta copia local.
- Arquivos analisados: `../dreamteam.md`, `../.git`, `../dreamteam-log.md`,
  `dreamteam-log.md`, `package.json`, `server/index.js`, `src/App.tsx`.
- Decisoes: participar do primeiro snapshot versionado; excluir `.env`,
  `node_modules`, `dist` e dados runtime; registrar que commits antigos serao
  reconstrucao baseada nos logs.
- Arquivos alterados: `../.gitignore`, `../dreamteam-log.md`,
  `dreamteam-log.md`.
- O que mudou: projeto preparado para versionamento Git/GitHub com ignore
  seguro.
- Como desfazer: remover `../.git` e `../.gitignore`; desfazer push remoto se
  for publicado.
- Testes executados: `git status --short`; `git status --ignored --short`;
  `git add .`; `git commit`; commits retroativos com `git commit --allow-empty`;
  `git log --oneline --decorate --date=iso`; `git remote -v`.
- Resultados: dependencias, build, `.env` e dados locais ficaram ignorados; o
  repositorio local foi criado com 27 commits reconstruidos, incluindo marcos
  retroativos baseados nos logs.
- Pendencias: receber a URL SSH do repositorio GitHub para configurar `origin`
  e publicar a branch `main`.

- Pedido do usuario: permitir operacao multiempresa para administradora geral:
  criar clientes escolhendo empresa master, filtrar atividades por master e
  configurar usuarios com acesso a mais de uma master.
- Data/hora: 2026-06-18 21:56 UTC.
- Contexto: usuarios comuns devem ver apenas a empresa master a que pertencem,
  enquanto a administradora geral precisa operar todas.
- Arquivos analisados: `../dreamteam.md`, `../AGENTS.md`, `../wine/AGENTS.md`,
  `server/index.js`, `src/App.tsx`, `../dreamteam-log.md`,
  `dreamteam-log.md`.
- Decisoes: aplicar permissao multiempresa no backend; expor seletor de master
  no cliente apenas para a administradora geral; incluir filtro de master em
  atividades; criar botao de usuario `Faz parte de mais de uma empresa master`
  com selecao das masters adicionais.
- Arquivos alterados: `server/index.js`, `src/App.tsx`,
  `../dreamteam-log.md`, `dreamteam-log.md`.
- O que mudou: `permissions.multiMasterAccess` e
  `permissions.masterCompanyIds` passaram a controlar acesso multiempresa;
  atividades e clientes respeitam essa regra.
- Como desfazer: reverter `server/index.js` e `src/App.tsx`; limpar as novas
  chaves de permissao nos usuarios, se houver teste.
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
- Contexto: o usuario decidiu retirar a area de relatorios personalizados da
  aplicacao `wine`.
- Arquivos analisados: `../dreamteam.md`, `../AGENTS.md`, `../wine/AGENTS.md`,
  `server/index.js`, `src/App.tsx`, `src/styles.css`, `../dreamteam-log.md`,
  `dreamteam-log.md`.
- Decisoes: retirar menu, permissao de modulo, formulario de permissao no
  cliente, tela, painel do portal e rotas API; manter dados legados inertes para
  nao apagar historico sem pedido explicito.
- Arquivos alterados: `server/index.js`, `src/App.tsx`, `src/styles.css`,
  `../dreamteam-log.md`, `dreamteam-log.md`.
- O que mudou: a aplicacao deixou de exibir e operar relatorios personalizados
  de faturamento de vendas do cliente.
- Como desfazer: reverter `server/index.js`, `src/App.tsx`, `src/styles.css` e
  os logs desta entrada.
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
- Contexto: agenda recorrente podia causar acumulo se cada ocorrencia virasse
  atividade ao mesmo tempo.
- Arquivos analisados: `../dreamteam.md`, `server/index.js`, `src/App.tsx`,
  `../dreamteam-log.md`, `dreamteam-log.md`.
- Decisoes: criar a proxima atividade somente quando a atividade atual vinculada
  a agenda recorrente for concluida; atualizar `activityId` da agenda para a
  nova atividade.
- Arquivos alterados: `server/index.js`, `src/App.tsx`,
  `../dreamteam-log.md`, `dreamteam-log.md`.
- O que mudou: recorrencia semanal, quinzenal e mensal agora anda uma
  ocorrencia por vez no quadro de atividades; card mostra a recorrencia quando
  ha agenda vinculada.
- Como desfazer: reverter `server/index.js` e `src/App.tsx`; apagar atividades
  de teste criadas automaticamente, se houver.
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
- Contexto: atividade atrasada era detectada apenas por prazo final; tela atual
  nao era preservada ao atualizar o navegador.
- Arquivos analisados: `../dreamteam.md`, `src/App.tsx`, `src/styles.css`,
  `../dreamteam-log.md`, `dreamteam-log.md`.
- Decisoes: ampliar regra visual de atraso para inicio planejado vencido e
  termino vencido; guardar somente a tela atual no hash da URL.
- Arquivos alterados: `src/App.tsx`, `../dreamteam-log.md`,
  `dreamteam-log.md`.
- O que mudou: cards atrasados mostram `Início atrasado` ou `Término vencido`;
  refresh mantem a tela por `#view=...` quando ha permissao.
- Como desfazer: reverter `src/App.tsx`.
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
- Contexto: cards de atividades tinham edicao e exclusao, mas nao duplicacao.
- Arquivos analisados: `../dreamteam.md`, `src/App.tsx`, `src/styles.css`,
  `../dreamteam-log.md`, `dreamteam-log.md`.
- Decisoes: adicionar botao de duplicar para usuarios com permissao de criar;
  preencher `ActivityForm` sem `id` com os dados da atividade original; manter
  o modal como nova atividade para revisao antes de salvar.
- Arquivos alterados: `src/App.tsx`, `../dreamteam-log.md`,
  `dreamteam-log.md`.
- O que mudou: card de atividade ganhou acao de duplicar com campos
  pre-preenchidos e editaveis.
- Como desfazer: reverter `src/App.tsx`.
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
- Contexto: atividades vinculadas a agenda ja podiam usar os mesmos endpoints de
  atividade, mas a tela nao destacava atraso nem o vinculo.
- Arquivos analisados: `../dreamteam.md`, `AGENTS.md`, `src/App.tsx`,
  `src/styles.css`, `server/index.js`.
- Decisoes: adicionar notificacao visual no modulo Atividades usando `dueDate`
  e status; destacar cards atrasados; indicar atividade com agenda vinculada;
  nao alterar backend nem criar novo status.
- Arquivos alterados: `src/App.tsx`, `src/styles.css`,
  `../dreamteam-log.md`, `dreamteam-log.md`.
- O que mudou: resumo de atrasadas/vencem hoje/com agenda, alerta textual,
  etiqueta `Atrasada`, borda vermelha e pílula de agenda vinculada nos cards.
- Como desfazer: reverter `src/App.tsx` e `src/styles.css`.
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
- Contexto: Atividades ainda tinha fallback externo e atalhos antigos nos cards.
- Arquivos analisados: `src/App.tsx`, `src/styles.css`, `server/index.js`,
  `../dreamteam-log.md`, `dreamteam-log.md`.
- Decisoes: remover fallback `wa.me`/`mailto` da area de Atividades; enviar
  somente via API `sendWhatsappText`; exibir aviso quando nao houver modulo
  WhatsApp ou telefone.
- Arquivos alterados: `src/App.tsx`, `src/styles.css`,
  `../dreamteam-log.md`, `dreamteam-log.md`.
- O que mudou: botoes do formulario e cards de Atividades enviam pelo WhatsApp
  da sessao sem abrir outro aplicativo.
- Como desfazer: reverter `src/App.tsx` e `src/styles.css`.
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
- Contexto: Agenda ja enviava mensagens por WhatsApp, mas Atividades ainda nao
  tinha a mesma acao dentro do formulario.
- Arquivos analisados: `../dreamteam.md`, `src/App.tsx`,
  `../dreamteam-log.md`, `dreamteam-log.md`.
- Decisoes: adicionar no formulario de Atividades acoes de copiar mensagem e
  enviar por WhatsApp para cliente/responsaveis; usar Evolution API quando
  disponivel e permissao permitir, com fallback para `wa.me`.
- Arquivos alterados: `src/App.tsx`, `../dreamteam-log.md`,
  `dreamteam-log.md`.
- O que mudou: atividade agora gera mensagem operacional com status,
  prioridade, prazo, cliente, servico e responsaveis; botoes enviam para os
  telefones cadastrados.
- Como desfazer: reverter `src/App.tsx`.
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
- Contexto: eventos de agenda podiam ser vinculados manualmente a atividades,
  mas novos agendamentos nao geravam atividade.
- Arquivos analisados: `../dreamteam.md`, `AGENTS.md`, `server/index.js`,
  `src/App.tsx`, `../dreamteam-log.md`, `dreamteam-log.md`.
- Decisoes: criar atividade automaticamente no backend para novo evento com
  cliente e sem `activityId`; usar status `planned`; incluir data/hora, local e
  descricao da agenda no texto da atividade; manter edicoes sem duplicar.
- Arquivos alterados: `server/index.js`, `src/App.tsx`,
  `../dreamteam-log.md`, `dreamteam-log.md`.
- O que mudou: ao salvar novo agendamento com cliente, a API cria atividade
  planejada e grava o vinculo no evento; o formulario da agenda avisa sobre a
  criacao automatica.
- Como desfazer: reverter `server/index.js` e `src/App.tsx`; remover dados de
  teste criados automaticamente, se houver.
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
- Contexto: o relatorio personalizado ja existia, mas a evolucao ainda estava
  visualmente simples.
- Arquivos analisados: `src/App.tsx`, `src/styles.css`,
  `../dreamteam-log.md`, `dreamteam-log.md`.
- Decisoes: criar visual de grafico com barras mensais, legenda bruto/liquido,
  resumo executivo e destaque do mes selecionado/melhor mes; manter
  responsividade mobile-first.
- Arquivos alterados: `src/App.tsx`, `src/styles.css`,
  `../dreamteam-log.md`, `dreamteam-log.md`.
- O que mudou: area interna e portal do cliente agora apresentam o faturamento
  de vendas em grafico visual com comparativo bruto/liquido.
- Como desfazer: reverter `src/App.tsx` e `src/styles.css`.
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
- Contexto: o faturamento desejado e das vendas do cliente, nao dos pagamentos
  dos servicos do Ponto Controle.
- Arquivos analisados: `../AGENTS.md`, `../dreamteam.md`,
  `../DREAMTEAM_COUNCIL.md`, `../PROJECT_MEMORY.md`, `AGENTS.md`,
  `src/App.tsx`, `server/index.js`, `package.json`.
- Decisoes: adicionar modulo `customReports`; persistir dados em
  `salesRevenues`; liberar exibicao por cliente em
  `customReportAccess.salesRevenue`; usar permissoes existentes de modulo e
  acoes para criar, editar e excluir; mostrar no portal apenas os dados
  autorizados e filtrados pelo servidor.
- Arquivos alterados: `server/index.js`, `src/App.tsx`,
  `../dreamteam-log.md`, `dreamteam-log.md`.
- O que mudou: menu `Relatórios personalizados`, formulario de faturamento de
  vendas por cliente/competencia, metrica e tabela interna, checkbox de
  liberacao no cadastro do cliente e bloco do portal para faturamento de
  vendas.
- Como desfazer: reverter `server/index.js` e `src/App.tsx`; se houver dados
  de teste criados, limpar `salesRevenues` no store.
- Testes executados: `node --check server/index.js`; `npm run build`;
  `sudo ./scripts/deploy-docker-run.sh`;
  `curl -fsS https://adegaweb.com.br/api/health`;
  `curl -fsS https://www.adegaweb.com.br/api/health`; `sudo -n docker ps`.
- Resultados: sintaxe e build passaram; deploy em producao concluido; os dois
  dominios retornaram `{"ok":true,"app":"ponto-controle","store":"postgres"}`;
  container `ponto-controle-app` ficou healthy.
- Pendencias: validar fluxo em navegador com usuario interno e usuario cliente.

## 2026-06-11

- Pedido do usuario: verificar por que chamadas recebidas pelo WhatsApp eram
  recusadas com mensagem automatica do Ponto Controle.
- Data/hora: 2026-06-11 16:00 UTC.
- Contexto: o backend criava instancias Evolution com `rejectCall: true` e
  `msgCall: Este número atende mensagens do Ponto Controle.`, causando rejeicao
  automatica das chamadas.
- Arquivos analisados: `server/index.js`, `src/App.tsx`.
- Decisoes: criar novas instancias com `rejectCall: false`; adicionar
  configuracao server-side `/settings/set/{instance}` para tentar aplicar
  `rejectCall: false` tambem em instancias ja existentes; marcar a empresa com
  `whatsappCallsEnabled: true` apos tentativa de configuracao.
- Arquivos alterados: `server/index.js`, `../dreamteam-log.md`,
  `dreamteam-log.md`.
- O que mudou: novas conexoes nao rejeitam chamadas e a instancia existente
  tenta receber a configuracao ao abrir/conectar WhatsApp.
- Como desfazer: reverter `server/index.js`; reconstruir a imagem anterior.
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
- Arquivos analisados: `src/App.tsx`, `src/styles.css`.
- Decisoes: remover o formulario e os resultados de busca de contato da
  `whatsapp-sidebar`; inserir a busca em `whatsapp-chat`, abaixo do cabecalho
  da conversa; manter as mesmas acoes de usar contato/criar cliente/criar
  pessoa.
- Arquivos alterados: `src/App.tsx`, `src/styles.css`,
  `../dreamteam-log.md`, `dreamteam-log.md`.
- O que mudou: busca de contato e resultados agora aparecem no lado direito da
  tela; lista lateral manteve apenas status, busca de conversa, nova conversa e
  conversas.
- Como desfazer: reverter `src/App.tsx` e `src/styles.css`; reconstruir a
  imagem anterior.
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
- Arquivos analisados: `src/App.tsx`, `server/index.js`, `src/styles.css`.
- Decisoes: manter `Pessoa/equipe` e `Cliente` como tipos de sistema; adicionar
  tipos personalizados em `settings.userTypes`; expor `options.userTypes` no
  bootstrap; criar endpoints `POST/DELETE /api/settings/user-types`; ao remover
  um tipo personalizado, usuarios voltam para `Pessoa/equipe`.
- Arquivos alterados: `server/index.js`, `src/App.tsx`, `src/styles.css`,
  `../dreamteam-log.md`, `dreamteam-log.md`.
- O que mudou: tela Usuarios ganhou painel `Tipos de usuário`; o select de tipo
  usa a lista configurada; filtros e labels usam os tipos dinamicos.
- Como desfazer: reverter `server/index.js`, `src/App.tsx` e `src/styles.css`;
  remover tipos personalizados de `settings.userTypes` se necessario.
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
- Arquivos analisados: `src/App.tsx`, `server/index.js`, `src/styles.css`.
- Decisoes: permitir DELETE de agendamento para usuarios com modulo Agenda e
  acesso ao evento; adicionar botao Excluir no formulario de edicao com
  confirmacao; manter escopo por empresa/cliente via filtros existentes.
- Arquivos alterados: `server/index.js`, `src/App.tsx`, `src/styles.css`,
  `../dreamteam-log.md`, `dreamteam-log.md`.
- O que mudou: rota de exclusao da agenda nao exige mais permissao global
  `delete`; modal de evento salvo mostra botao `Excluir`; exclusao fecha o
  modal e atualiza os dados.
- Como desfazer: reverter `server/index.js`, `src/App.tsx` e
  `src/styles.css`; reconstruir a imagem anterior.
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
- Arquivos analisados: `src/App.tsx`, `server/index.js`.
- Decisoes: ignorar `targetLabel` de mensagens outbound vindas de provider
  (`webhook`/`sync`) na lista de conversas; no backend, nao salvar `targetLabel`
  de outbound individual recebido por webhook.
- Arquivos alterados: `src/App.tsx`, `server/index.js`,
  `../dreamteam-log.md`, `dreamteam-log.md`.
- O que mudou: labels antigos ruins deixam de aparecer na lista mesmo se ja
  estiverem salvos; mensagens futuras outbound do webhook individual nao salvam
  o nome do proprietario como contato.
- Como desfazer: reverter `src/App.tsx` e `server/index.js`; reconstruir a
  imagem anterior.
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
- Arquivos analisados: `server/index.js`, `src/App.tsx`, `src/styles.css`.
- Decisoes: reutilizar a classe visual `whatsapp-search`; ao criar cliente ou
  pessoa, trocar para a tela correspondente com o formulario aberto; permitir
  grupos em busca/sincronizacao/envio como JID `@g.us`; ocultar acoes de criar
  cliente/pessoa para grupos.
- Arquivos alterados: `server/index.js`, `src/App.tsx`, `src/styles.css`,
  `../dreamteam-log.md`, `dreamteam-log.md`.
- O que mudou: busca de contato usa o mesmo visual de busca de conversa; botoes
  de criar navegam para Clientes/Equipe; grupos podem aparecer e ser usados em
  conversa quando a Evolution retornar `@g.us`.
- Como desfazer: reverter `server/index.js`, `src/App.tsx` e
  `src/styles.css`; reconstruir a imagem anterior.
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
- Arquivos analisados: `src/App.tsx`, `src/styles.css`, `server/index.js`.
- Decisoes: resolver o nome da conversa por telefone usando cliente/equipe/
  contato conhecido; nao atualizar o label com a ultima mensagem; buscar
  contatos na Evolution por variacoes de telefone e tambem via `findChats`;
  deduplicar contatos por telefone; reduzir altura/largura visual dos campos.
- Arquivos alterados: `server/index.js`, `src/App.tsx`, `src/styles.css`,
  `../dreamteam-log.md`, `dreamteam-log.md`.
- O que mudou: lista de conversas usa nome estavel por telefone; busca de
  contato combina agenda e chats da Evolution; layout lateral ficou mais
  compacto; estado vazio informa quando a Evolution nao tem contato
  sincronizado.
- Como desfazer: reverter `server/index.js`, `src/App.tsx` e
  `src/styles.css`; reconstruir a imagem anterior.
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
- Arquivos analisados: `server/index.js`, `src/App.tsx`, `src/styles.css`,
  formularios de cliente/equipe e documentacao Evolution API v2 `Find Contacts`.
- Decisoes: criar rota server-side `/api/whatsapp/contacts`; manter a chave da
  Evolution somente no backend; normalizar formatos variados de contato; exibir
  resultados compactos na lateral do WhatsApp; permitir usar contato na nova
  conversa, criar cliente ou criar pessoa somente por clique explicito.
- Arquivos alterados: `server/index.js`, `src/App.tsx`, `src/styles.css`,
  `../PROJECT_MEMORY.md`, `../dreamteam-log.md`, `dreamteam-log.md`.
- O que mudou: backend consulta `POST /chat/findContacts/{instance}`; UI ganhou
  campo `Contato do celular`, lista de resultados e botoes por icone para
  conversar, criar cliente e criar pessoa.
- Como desfazer: reverter `server/index.js`, `src/App.tsx` e
  `src/styles.css`; reconstruir a imagem anterior.
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
- Arquivos analisados: `server/index.js`, `src/App.tsx`, `src/styles.css`,
  `../PROJECT_MEMORY.md`, `PROJECT_MEMORY.md`.
- Decisoes: implementar lixeira/restauracao local como comportamento padrao;
  guardar `providerMessageId`, `remoteJid` e `fromMe` para mensagens novas;
  editar mensagem outbound via Evolution quando houver chave; manter apagar
  conversa como acao reversivel no Ponto Controle; ativar `syncFullHistory`
  para novas instancias e adicionar sincronizacao via `findChats/findMessages`.
- Arquivos alterados: `server/index.js`, `src/App.tsx`, `src/styles.css`,
  `../PROJECT_MEMORY.md`, `../dreamteam-log.md`, `dreamteam-log.md`.
- O que mudou: API ganhou sincronizacao de historico, edicao de mensagem,
  lixeira/restauracao de mensagem e conversa; UI ganhou botoes compactos para
  sincronizar, abrir lixeira, apagar/restaurar conversa, editar/apagar/restaurar
  mensagem; novas instancias Evolution sao criadas com `syncFullHistory: true`.
- Como desfazer: reverter `server/index.js`, `src/App.tsx` e
  `src/styles.css`; reconstruir a imagem antes de publicar.
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

- Pedido do usuario: implementar melhorias 1 a 5 e descartar auditoria e
  normalizacao.
- Data/hora: 2026-06-10 UTC.
- Contexto: era preciso remover pisca no F5, persistir sessoes no PostgreSQL e
  ativar backup automatico sem usar storage local no navegador.
- Arquivos alterados: `server/index.js`, `src/App.tsx`, `src/styles.css`,
  `docker-compose.yml`, `dreamteam-log.md`.
- O que mudou: tabela `app_sessions`; `authChecking` antes de decidir login ou
  dashboard; backup diario por container `ponto-controle-backup`; compose
  atualizado com servico `backup`.
- Testes executados: `node --check`; `npm run lint`; `npm run build`;
  `docker build`; login/F5/restart com cookie; health; backup gerado.
- Resultados: sessao funciona apos F5 e restart; health retorna PostgreSQL;
  backup inicial criado.
- Pendencias: teste visual em iPhone real.

- Pedido do usuario: corrigir logoff ao dar F5 e confirmar Dream Team ativo.
- Data/hora: 2026-06-10 UTC.
- Contexto: com `localStorage` removido, o token de login ficava so no estado
  React e se perdia no refresh. Era necessario preservar sessao sem guardar
  dados de negocio no navegador.
- Arquivos analisados: `server/index.js`, `src/App.tsx`,
  `../DREAMTEAM_COUNCIL.md`.
- Decisoes: criar cookie HttpOnly `ponto_controle_session`, aceitar cookie em
  `requireAuth`, tentar bootstrap ao montar a app e limpar cookie em
  `DELETE /api/session`.
- Motivos: manter F5 autenticado sem voltar a usar `localStorage`.
- Arquivos alterados: `server/index.js`, `src/App.tsx`,
  `dreamteam-log.md`.
- O que mudou: sessao sobrevive a reload/F5; logout invalida sessao no servidor
  e limpa cookie; fluxo ainda nao armazena clientes/financeiro/agenda no
  navegador.
- Como desfazer: reverter `server/index.js` e `src/App.tsx`, rebuildar Docker e
  recriar container.
- Testes executados: `node --check`; `npm run lint`; `npm run build`;
  `docker build`; `curl` com cookie jar em login/bootstrap/logout.
- Resultados: bootstrap sem Authorization funcionou com cookie; apos logout,
  bootstrap retornou 401; app em producao healthy com PostgreSQL.
- Pendencias: sessoes nao persistem apos restart do processo.

- Pedido do usuario: deixar a aba WhatsApp simples, parecida com WhatsApp Web,
  e fazer o QR Code ficar parado por 1 minuto sem piscar.
- Data/hora: 2026-06-10 UTC.
- Contexto: a aba WhatsApp tinha painel tecnico e o QR podia sumir ao trocar
  para a aba ou ser substituido por nova chamada. A regra do projeto exige
  iPhone/mobile first.
- Arquivos analisados: `src/App.tsx`, `src/styles.css`, `server/index.js`.
- Decisoes: congelar o QR no frontend por 60 segundos, bloquear nova geracao
  enquanto estiver ativo, remover reset ao abrir a aba e simplificar o bloco de
  conexao com instrucoes no estilo WhatsApp Web.
- Motivos: evitar flicker/piscadas, reduzir complexidade visual e deixar o
  pareamento mais familiar.
- Arquivos alterados: `src/App.tsx`, `src/styles.css`.
- O que mudou: `whatsappQr` agora tem `expiresAt`; QR/codigo expiram depois de
  1 minuto; painel mostra cartao `Escaneie pelo celular`; QR tem tamanho estavel
  e responsivo; botao principal muda para `QR Code ativo` durante a validade.
- Como desfazer: reverter `src/App.tsx` e `src/styles.css`, rebuildar Docker e
  recriar o container da aplicacao.
- Testes executados: `npm run lint`; `npm run build`; busca por
  `localStorage/sessionStorage/IndexedDB`; `docker build`; recriacao de
  `ponto-controle-app`; `curl https://adegaweb.com.br/api/health`.
- Resultados: build/lint passaram; container `ponto-controle-app` esta
  `healthy`; health publico retorna `{"ok":true,"app":"ponto-controle","store":"postgres"}`.
- Pendencias: testar com QR real retornado pela Evolution API em iPhone.

- Pedido do usuario: usar o diretorio `base de dados`, subir a persistencia em
  SQL para ficar online/rapida, garantir que nada fique em localStorage e
  registrar foco permanente em iPhone.
- Data/hora: 2026-06-10 01:50 UTC.
- Contexto: havia um backup em
  `/home/sheila/codex/pontocontrole/base de dados/ponto-controle-db-backup-2026-06-10.json`.
  O volume novo tinha sido criado vazio. A aplicacao usava arquivo JSON no
  servidor e `localStorage` apenas para token de sessao.
- Arquivos analisados: `server/index.js`, `src/App.tsx`, `package.json`,
  `package-lock.json`, `docker-compose.yml`, `.env`, `.env.example`,
  `DEPLOY.md`, `AGENTS.md`, `PROJECT_MEMORY.md`, `dreamteam-log.md`.
- Decisoes: usar PostgreSQL 16 em Docker; guardar o estado da aplicacao na
  tabela SQL `app_store` em JSONB como migracao conservadora; manter fallback
  por arquivo somente quando `DATABASE_URL` nao estiver configurada; remover
  `localStorage` do frontend; registrar iPhone/mobile first no `AGENTS.md`.
- Motivos: atender persistencia online no servidor sem reescrever todos os
  fluxos em uma unica mudanca de alto risco; preservar compatibilidade dos
  modulos existentes; eliminar armazenamento persistente no navegador.
- Arquivos alterados: `server/index.js`, `src/App.tsx`, `package.json`,
  `package-lock.json`, `docker-compose.yml`, `.env`, `.env.example`,
  `DEPLOY.md`, `AGENTS.md`, `PROJECT_MEMORY.md`, `dreamteam-log.md`.
- O que mudou: API agora usa PostgreSQL quando `DATABASE_URL` existe;
  `/api/health` informa `store: "postgres"`; Docker ganhou servico/volume de
  Postgres; backup JSON foi importado para `app_store.data`; frontend nao usa
  `localStorage`, `sessionStorage` ou IndexedDB.
- Como desfazer: parar `ponto-controle-app`; subir imagem anterior ou remover
  `DATABASE_URL` para usar arquivo JSON; restaurar backup salvo em
  `base de dados/restore-backups/ponto-controle-before-restore-2026-06-10.json`
  se necessario. Nao remover o volume `adegaweb_ponto_controle_postgres` sem
  backup.
- Testes executados: validar JSON do backup; importar backup no Postgres;
  `node --check server/index.js`; `npm run lint`; `npm run build`; build Docker;
  `pg_isready`; consultas SQL de contagem; health HTTPS publico; login master
  por API; bootstrap por API; busca por uso de `localStorage/sessionStorage`.
- Resultados: Postgres ativo; `https://adegaweb.com.br/api/health` retorna
  `store: "postgres"`; banco tem 2 usuarios, 4 clientes e 96 financeiros;
  bootstrap master retorna master + `sheila@varinha.com.br` + `teste@teste.com`;
  nenhum uso de `localStorage`, `sessionStorage` ou IndexedDB permanece no
  codigo fonte.
- Pendencias: instalar/corrigir Docker Compose v2; criar rotina de backup
  `pg_dump`; futuramente normalizar JSONB em tabelas relacionais se houver
  necessidade real de consulta analitica pesada.

- Pedido do usuario: reler a solucao, adequar ao servidor atual
  `144.33.20.37`, configurar `adegaweb.com.br` e `www.adegaweb.com.br`, colocar
  a aplicacao atual em Docker, planejar e executar.
- Data/hora: 2026-06-10 01:33 UTC.
- Contexto: a memoria antiga descrevia uma vitrine Adegaweb, mas o codigo atual
  em `wine` e a aplicacao Ponto Controle. O deploy atual usa React/Vite,
  Express, Docker e Caddy. O Docker existe no servidor; o plugin
  `docker compose` nao existe e o `docker-compose` legado falha por falta de
  `distutils`.
- Arquivos analisados: `AGENTS.md`, `dreamteam.md`, `PROJECT_MEMORY.md`,
  `dreamteam-log.md`, `package.json`, `Dockerfile`, `docker-compose.yml`,
  `Caddyfile`, `nginx.conf`, `.env.example`, `.dockerignore`,
  `server/index.js`, `src/App.tsx`.
- Decisoes: tratar a aplicacao atual em disco como fonte da verdade; manter
  `adegaweb.com.br` como `SITE_URL`; aceitar tambem `www.adegaweb.com.br`;
  mover configuracoes sensiveis para variaveis de ambiente; manter Caddy como
  proxy/HTTPS; nomear explicitamente os volumes Docker; subir a stack
  manualmente com `docker run` porque Compose local nao esta funcional.
- Motivos: evitar restaurar produto antigo por engano, preservar a aplicacao
  atual, reduzir exposicao de segredos no compose e deixar o deploy
  reproduzivel.
- Arquivos alterados: `docker-compose.yml`, `Caddyfile`, `.env.example`,
  `DEPLOY.md`, `PROJECT_MEMORY.md`, `dreamteam-log.md`.
- O que mudou: compose passou a usar substituicao de variaveis e volumes
  nomeados `adegaweb_*`; Caddy passou a responder tambem ao HTTP por
  `144.33.20.37`; `.env.example` documenta variaveis de producao; `DEPLOY.md`
  documenta DNS, ambiente, comandos e persistencia; memoria/log foram
  atualizados para refletir Ponto Controle em producao.
- Como desfazer: reverter os arquivos alterados; parar containers com
  `sudo docker rm -f adegaweb ponto-controle-app`; nao remover volumes sem
  backup. Para apagar volumes depois de backup, remover
  `adegaweb_ponto_controle_data`, `adegaweb_caddy_data` e
  `adegaweb_caddy_config`.
- Testes executados: `node --check server/index.js`; `npm ci`; `npm run lint`;
  `npm run build`; parse YAML do `docker-compose.yml`; `caddy validate` em
  container; `sudo docker build -t adegaweb-ponto-controle:test .`; container
  temporario na porta `3007`; health interno na rede Docker; health por HTTP
  local; health por HTTPS com `adegaweb.com.br` e `www.adegaweb.com.br`; chamada
  publica direta aos dois dominios.
- Resultados: lint e build passaram; imagem Docker construiu; container app
  ficou `healthy`; Caddy emitiu certificados Let's Encrypt para os dois
  dominios; `https://adegaweb.com.br/api/health` e
  `https://www.adegaweb.com.br/api/health` retornaram
  `{"ok":true,"app":"ponto-controle"}`; home retornou HTTP/2 200.
- Pendencias: corrigir/instalar Docker Compose v2 no servidor para usar
  `docker-compose.yml` diretamente; revisar senha master real e chaves de
  integracao no `.env`; configurar backup do volume de dados.

## 2026-05-18

- Pedido do usuario: explicar por que a tela de importacao nao trazia imagens
  e garantir que apenas produtos ativos sejam puxados do ERP.
- Data/hora: 2026-05-17 22:54:10 UTC.
- Contexto: a API 2.0 `produtos.pesquisa.php` retorna a lista ativa, mas nao
  retorna imagens; imagens/anexos ficam em `produto.obter.php`. Uma tentativa
  de detalhar muitos produtos em sequencia gerou bloqueio temporario por muitas
  chamadas.
- Arquivos analisados: `server/index.js`, `src/App.tsx`, `src/styles.css`,
  `eslint.config.js`, `docker-compose.yml`, `PROJECT_MEMORY.md`,
  `dreamteam-log.md`.
- Fontes consultadas: documentacao oficial Tiny/Olist API 2.0 de pesquisar
  produtos, obter produto e obter estoque.
- Decisoes: manter `situacao=A`; paginar a tela de importacao em 24 itens;
  buscar detalhe de cada produto da pagina para exibir imagens; buscar estoque
  completo apenas ao publicar/sincronizar produtos selecionados; aceitar
  `anexos` como URL string ou objeto.
- Motivos: exibir imagens reais sem estourar o limite de chamadas da API e
  manter importacao somente de produtos ativos.
- Arquivos alterados: `server/index.js`, `src/App.tsx`, `src/styles.css`,
  `eslint.config.js`, `PROJECT_MEMORY.md`, `dreamteam-log.md`.
- O que mudou: `/api/olist/products` agora retorna uma pagina de produtos
  ativos com `pagination`; admin ganhou paginacao e selecao por pagina; imagens
  reais aparecem na lista de importacao quando o ERP tem anexo/imagem.
- Como desfazer: reverter os arquivos alterados e reconstruir com
  `docker compose up -d --build`.
- Testes executados: `node --check server/index.js`; `npm run lint`; `npm run
  build`; `docker compose up -d --build`; `curl` em `/api/health` e
  `/api/olist/products?page=1&perPage=24`; Playwright mobile no admin.
- Resultados: container healthy; primeira pagina retornou 24 produtos ativos,
  75 paginas estimadas e 23 imagens reais; painel mobile validado com imagens
  do ERP.
- Pendencias: testar publicacao de poucos produtos selecionados antes de usar
  importacao em massa.

- Pedido do usuario: confirmar se o Token API do ERP baixa os dados necessarios
  ou se seria preciso criar aplicativo.
- Data/hora: 2026-05-17 22:54:10 UTC.
- Contexto: usuario encontrou a tela `Token API` do ERP da Olist; a integracao
  intermediaria estava usando API v3 OAuth.
- Arquivos analisados: `server/index.js`, `src/App.tsx`, `docker-compose.yml`,
  `.env.example`, `.env`, `PROJECT_MEMORY.md`, `dreamteam-log.md`.
- Fontes consultadas: documentacao oficial Tiny/Olist API 2.0 de pesquisar
  produtos, obter produto e obter estoque.
- Decisoes: usar Token API via `https://api.tiny.com.br/api2`, sem criar
  aplicativo OAuth, enviando `token` e `formato=JSON` como parametros.
- Motivos: a tela informada pelo usuario pertence ao fluxo de Token API da API
  2.0, suficiente para leitura de produtos, detalhes, anexos/imagens e estoque.
- Arquivos alterados: `server/index.js`, `src/App.tsx`, `docker-compose.yml`,
  `.env.example`, `.env`, `PROJECT_MEMORY.md`, `dreamteam-log.md`.
- O que mudou: integracao deixou de usar Bearer/OAuth da API v3 e passou para
  endpoints API 2.0 (`produtos.pesquisa.php`, `produto.obter.php`,
  `produto.obter.estoque.php`).
- Como desfazer: voltar `OLIST_API_BASE_URL` e chamadas em `server/index.js`
  para API v3 ou outro conector.
- Testes executados: `node --check server/index.js`; `npm run lint`; `npm run
  build`; `docker compose config`; `docker compose up -d --build`; chamadas
  `curl` aos endpoints internos.
- Resultados: API 2.0 aceitou o Token API e retornou catalogo ativo; depois a
  listagem foi paginada para evitar bloqueio por chamadas em excesso.
- Pendencias: nenhuma sobre necessidade de aplicativo; aplicativo OAuth nao e
  necessario para este fluxo.

- Pedido do usuario: corrigir senha do painel da gerente para usuario `sheila`
  e senha `ADMINISTRADOR` em maiusculo.
- Data/hora: 2026-05-17 22:45:27 UTC.
- Contexto: Docker ainda usava a senha antiga `administradora`, causando falha
  no login esperado pelo usuario.
- Arquivos analisados: `docker-compose.yml`, `server/index.js`,
  `PROJECT_MEMORY.md`, `dreamteam-log.md`.
- Decisoes: alterar `ADMIN_PASSWORD` no Compose para `ADMINISTRADOR` e manter
  `ADMIN_USER` como `sheila`.
- Motivos: alinhar credencial operacional ao combinado com a gerente.
- Arquivos alterados: `docker-compose.yml`, `PROJECT_MEMORY.md`,
  `dreamteam-log.md`.
- O que mudou: senha ativa do painel passou a ser `ADMINISTRADOR`.
- Como desfazer: trocar `ADMIN_PASSWORD` no `docker-compose.yml` e recriar o
  container.
- Testes executados: `docker compose config`; `node --check server/index.js`;
  `docker compose up -d --build`; `curl` em `/api/health`; `curl` em
  `/api/session` com a senha nova e com a antiga; Playwright mobile no `/admin`.
- Resultados: login `sheila` / `ADMINISTRADOR` aprovado; senha antiga retornou
  401; container healthy.
- Pendencias: nenhuma para login.

- Pedido do usuario: esclarecer que nao existe loja na Olist e que o caminho
  correto e somente ERP da Olist.
- Data/hora: 2026-05-17 22:23:24 UTC.
- Contexto: integracao anterior usava a API Olist Ecommerce/VNDA, que exige
  dominio de loja (`X-Shop-Host`); usuario confirmou que usa apenas ERP.
- Arquivos analisados: `server/index.js`, `src/App.tsx`, `src/styles.css`,
  `docker-compose.yml`, `.env.example`, `.env`, `PROJECT_MEMORY.md`,
  `dreamteam-log.md`.
- Fontes consultadas: documentacao oficial Olist ERP API v3 para
  `GET /produtos`, `GET /produtos/{idProduto}` e `GET /estoque/{idProduto}`.
- Decisoes: trocar a base para `https://api.tiny.com.br/public-api/v3`,
  remover dependencia de dominio de loja, manter fluxo so ERP -> Adegaweb,
  buscar lista, detalhe, anexos, categorias, variacoes e estoque, e deixar o
  painel pedindo somente a chave OAuth do ERP.
- Motivos: o usuario nao tem Olist Ecommerce; ERP da Olist usa API propria e
  nao requer `X-Shop-Host`.
- Arquivos alterados: `server/index.js`, `src/App.tsx`, `docker-compose.yml`,
  `.env.example`, `.env`, `PROJECT_MEMORY.md`, `dreamteam-log.md`.
- O que mudou: `/api/olist/products` agora chama a API ERP/Tiny v3; produtos
  importados armazenam payload bruto do ERP em `product.olist.raw`; admin mostra
  "Puxar produtos do ERP" e nao pede endereco da loja.
- Como desfazer: reverter os arquivos alterados, remover `.env` local ou voltar
  `OLIST_API_BASE_URL` para a API desejada, e reconstruir com
  `docker compose up -d --build`.
- Testes executados: chamada direta a `api.tiny.com.br/public-api/v3/produtos`;
  `node --check server/index.js`; `npm run lint`; `npm run build`; `docker
  compose config`; `docker compose up -d --build`; `curl` em `/api/health`,
  `/api/olist/config`, `/api/olist/products`; Playwright mobile no `/admin`.
- Resultados: container healthy; admin mobile aprovado; API aponta para ERP da
  Olist; token carregado tem 40 caracteres, mas a API ERP retornou 401 e a tela
  mostra "A chave do ERP da Olist nao foi aceita".
- Pendencias: gerar ou colar no painel um token OAuth valido do ERP da Olist API
  v3; com token aceito, testar importacao real de poucos produtos.

## 2026-05-17

- Pedido do usuario: corrigir a experiencia da administracao porque nao estava
  claro onde clicar para puxar produtos da Olist e a tela dizia conexao nao
  configurada mesmo apos o usuario informar a chave.
- Data/hora: 2026-05-17 22:01:53 UTC.
- Contexto: a importacao Olist estava implementada, mas dependia de token e
  `X-Shop-Host`; o usuario informou a chave no chat, mas nao havia informado o
  endereco canonico da loja Olist.
- Arquivos analisados: `.dockerignore`, `.env.example`, `server/index.js`,
  `src/App.tsx`, `src/styles.css`, `docker-compose.yml`,
  `PROJECT_MEMORY.md`, `dreamteam-log.md`.
- Fontes consultadas: documentacao oficial Olist/VNDA, que exige
  `Authorization: Bearer ...` e cabecalho `X-Shop-Host` com o dominio da loja.
- Decisoes: carregar a chave recebida no ambiente local `.env` sem expor no
  codigo; manter `.env` fora do contexto Docker; criar configuracao de Olist no
  admin com campos de endereco da loja e chave; tornar o CTA principal
  "Puxar produtos da Olist"; mostrar estados separados para chave salva e
  endereco pendente.
- Motivos: resolver a confusao operacional da gerente, preservar seguranca do
  segredo e deixar explicito que a API nao funciona sem o dominio da loja.
- Arquivos alterados: `.dockerignore`, `.env` local, `server/index.js`,
  `src/App.tsx`, `src/styles.css`, `PROJECT_MEMORY.md`, `dreamteam-log.md`.
- O que mudou: API ganhou `/api/olist/config` para ler/salvar conexao sem
  retornar a chave; admin ganhou passo a passo Conectar Olist -> Puxar produtos
  -> Publicar na loja; mensagens agora dizem exatamente se falta chave ou
  endereco da loja.
- Como desfazer: remover `.env`, reverter os arquivos alterados e reconstruir
  com `docker compose up -d --build`.
- Testes executados: teste direto contra hosts provaveis da Olist; `node
  --check server/index.js`; `npm run lint`; `npm run build`; `docker compose
  config`; `docker compose up -d --build`; `curl` em `/api/health`,
  `/api/olist/config` e `/api/olist/products`; Playwright mobile no `/admin`
  validando chave salva, endereco pendente e botao "Puxar produtos da Olist".
- Resultados: token carregado no ambiente e reconhecido pela API interna;
  hosts testados retornaram `401 Unauthorized`; container healthy; painel em
  iPhone mostra "Chave da Olist salva" e "Endereço da loja pendente"; nenhum
  produto de teste ficou no catalogo.
- Pendencias: usuario precisa informar o dominio correto da loja Olist usado em
  `X-Shop-Host` ou gerar nova chave se a atual nao pertencer a API VNDA/Olist
  Ecommerce.

- Pedido do usuario: colocar na administracao a possibilidade de popular a
  Adegaweb com produtos vindos da Olist, em fluxo somente Olist -> Adegaweb,
  com publicacao individual ou em massa e sincronizacao de preco, estoque,
  categorias, fotos e demais campos possiveis.
- Data/hora: 2026-05-17 21:47:14 UTC.
- Contexto: loja e admin ja publicados em `https://adegaweb.com.br`; usuario
  ja havia informado token Olist em chat, entao a implementacao nao poderia
  hardcodar nem reutilizar segredo exposto.
- Arquivos analisados: `AGENTS.md`, `dreamteam.md`, `PROJECT_MEMORY.md`,
  `dreamteam-log.md`, `src/App.tsx`, `src/styles.css`, `server/index.js`,
  `docker-compose.yml`, `.env.example`, `eslint.config.js`.
- Fontes consultadas: documentacao oficial Olist/VNDA Products API 2.0,
  especialmente autenticacao por Token e `X-Shop-Host`, e endpoint
  `GET /api/v2/products`.
- Decisoes: implementar endpoints proprios `/api/olist/products`,
  `/api/olist/import` e `/api/olist/sync`; guardar o payload bruto em
  `product.olist.raw`; travar campos gerenciados pela Olist no editor; manter
  exclusao apenas como remocao da Adegaweb, sem chamada de escrita na Olist.
- Motivos: cumprir fonte unica de verdade para preco/estoque/fotos/categorias,
  reduzir risco de divergencia e manter a interface compreensivel para gerente.
- Arquivos alterados: `server/index.js`, `src/App.tsx`, `src/styles.css`,
  `docker-compose.yml`, `.env.example`, `eslint.config.js`,
  `PROJECT_MEMORY.md`, `dreamteam-log.md`.
- O que mudou: admin ganhou bloco "Produtos da Olist" com buscar, publicar
  selecionados, publicar todos e atualizar publicados; API passou a buscar
  produtos Olist com `include_images` e `include_inactive`, mapear variantes,
  estoque, preco, imagens, categorias, referencia e dados brutos; Docker ganhou
  placeholders `OLIST_API_BASE_URL`, `OLIST_SHOP_HOST`, `OLIST_API_TOKEN` e
  `OLIST_MAX_PAGES`.
- Como desfazer: reverter os arquivos alterados, reconstruir com
  `docker compose up -d --build` e remover produtos `source: "olist"` do
  arquivo persistido caso uma importacao real tenha sido feita.
- Testes executados: `npm run lint`; `npm run build`; `node --check
  server/index.js`; `docker compose config`; `docker compose up -d --build`;
  `curl` em `/api/health` e `/api/olist/products`; Playwright mobile 390x844
  no `/admin` validando login, estado Olist nao configurado e ausencia de
  produtos Olist falsos.
- Resultados: lint, build e checagem Node passaram; container ficou healthy;
  API Olist retornou `configured:false` sem credenciais; painel mostrou a
  mensagem de configuracao e zero itens importaveis; nenhum produto de teste
  ficou no catalogo.
- Pendencias: rotacionar o token Olist exposto no chat; configurar
  `OLIST_SHOP_HOST` e `OLIST_API_TOKEN` reais no ambiente; validar uma
  importacao real com poucos produtos antes de publicar tudo.

- Pedido do usuario: continuar a Adegaweb como loja de bebidas, melhorar UX/UI
  para iPhone, criar administracao simples para gerente adicionar, editar e
  excluir produtos, e depois responder se seria possivel popular produtos via
  API Olist/VNDA sem executar a integracao.
- Data/hora: 2026-05-17 21:30:21 UTC.
- Contexto: projeto React/Vite com backend Express, Docker Compose e Caddy em
  `/root/codex/wine`, publicado em `https://adegaweb.com.br`. Compra segue para
  Mercado Livre.
- Arquivos analisados: `AGENTS.md`, `dreamteam.md`,
  `DREAMTEAM_COUNCIL.md`, `PROJECT_MEMORY.md`, `dreamteam-log.md`,
  `src/App.tsx`, `src/styles.css`, `server/index.js`,
  `server/default-products.json`, `docker-compose.yml`, `Caddyfile`,
  `package.json`.
- Fontes consultadas: Google Search Central Ecommerce, W3C WCAG 2.2 Target Size,
  Mercado Livre por busca publica, documentacao Olist/VNDA API v2.
- Decisoes: tratar o site como vitrine propria e nao copia literal; priorizar
  mobile/iPhone; manter checkout externo no Mercado Livre; adicionar rotas
  internas de produto para SEO; manter painel com linguagem de gerente; nao usar
  o token Olist informado no chat e recomendar rotacao antes de qualquer uso.
- Motivos: reduzir risco legal/comercial de clone, melhorar conversao mobile,
  permitir manutencao operacional sem termo tecnico e preservar credenciais.
- Arquivos alterados: `src/App.tsx`, `src/styles.css`, `server/index.js`,
  `server/default-products.json`, `docker-compose.yml`, `PROJECT_MEMORY.md`,
  `dreamteam-log.md`.
- O que mudou: loja ganhou paginas `/produto/:id`, CTAs de detalhe e compra,
  SEO dinamico, sitemap e robots; admin ganhou adicionar, editar, copiar,
  excluir, upload de foto, busca, resumo, desfazer e botoes mais claros; Docker
  passou a declarar `SITE_URL` e credenciais padrao; catalogo persistido foi
  atualizado com copy mais fiel aos produtos usados.
- Como desfazer: restaurar os arquivos alterados, reconstruir com
  `docker compose up -d --build` e, se necessario, substituir
  `/data/products.json` no volume `adegaweb_data` pela versao desejada.
- Testes executados: `npm run lint`; `npm run build`; `docker compose up -d
  --build`; `curl` em `/api/health`, `/admin`, `/api/products`,
  `/robots.txt`, `/sitemap.xml` e pagina de produto; teste Playwright em iPhone
  para login, adicionar produto, editar campos, salvar, excluir e salvar de
  novo; screenshots de home e admin em viewport 390x844.
- Resultados: lint e build passaram; container `adegaweb-app` ficou healthy;
  HTTPS em `adegaweb.com.br` respondeu 200; admin validado ponta a ponta;
  nenhum produto de teste ficou no catalogo; sitemap e schema de produto foram
  gerados.
- Pendencias: rotacionar token Olist informado no chat antes de implementar
  importacao; confirmar dominio `X-Shop-Host`; decidir se a Olist sera fonte
  principal ou sincronizacao manual assistida.

## 2026-04-26

- Pedido do usuario: corrigir falha de comunicacao exemplificada por texto como
  `Dados isolados` em pagina principal.
- Data/hora: 2026-04-26 17:42:15 UTC.
- Contexto: a frase nao foi encontrada neste diretorio, mas o protocolo ainda
  precisava bloquear copy generica em paginas principais e fluxos de produto.
- Arquivos analisados: busca por `Dados isolados`, `isolados`, `pagina principal`
  e arquivos do kit atual.
- Decisoes: adicionar regra dura de comunicacao de produto e veto para texto
  generico, tecnico, decorativo ou sem beneficio verificavel.
- Motivos: UX Writing, Produto, Suporte e PO devem impedir que comunicacao vazia
  passe como valor de produto.
- Arquivos alterados: `dreamteam.md`, `AGENTS.md`, `dreamteam-log.md`.
- O que mudou: `dreamteam.md` ganhou a secao `Comunicacao de produto` com
  criterios de veto e formato minimo de substituicao; `AGENTS.md` passou a
  exigir revisao de copy em paginas principais, onboarding, CTAs e mensagens.
- Como desfazer: remover a secao `Comunicacao de produto` de `dreamteam.md` e o
  paragrafo correspondente de `AGENTS.md`.
- Testes executados: busca textual no diretorio atual.
- Resultados: `Dados isolados` nao existe neste kit; regra preventiva aplicada.
- Pendencias: aplicar a correcao no projeto real onde a pagina principal existe.

- Pedido do usuario: cada pessoa do Dream Team deve ser perfil de pessoa real em
  cargo real, baseado em dados factuais, para ser emulada corretamente.
- Data/hora: 2026-04-26 UTC.
- Contexto: o conselho expandido tinha cadeiras e temperamentos, mas ainda nao
  explicitava cargo real-base nem fonte factual por perfil.
- Arquivos analisados: `DREAMTEAM_COUNCIL.md`, `dreamteam.md`, `README.md`,
  `AGENTS.md`, `dreamteam-log.md`.
- Fontes consultadas: O*NET, Scrum.org, NIST NICE, W3C WAI/WCAG, OWASP, Google
  DORA, Google SRE, Atlassian Incident Management/Postmortems e ISO/IEC 25010.
- Decisoes: reformular o conselho como 95 perfis profissionais emulados; manter
  ausencia de nomes reais; exigir cargo real-base, fonte e comportamento
  profissional verificavel por cadeira.
- Motivos: melhorar fidelidade de emulacao sem inventar autoridade pessoal ou
  biografia privada.
- Arquivos alterados: `DREAMTEAM_COUNCIL.md`, `dreamteam.md`, `README.md`,
  `AGENTS.md`, `dreamteam-log.md`.
- O que mudou: cada perfil passou a ter `Perfil emulado`, `Cargo real-base`,
  `Base` e `Como deve pensar e agir`.
- Como desfazer: restaurar a versao anterior de `DREAMTEAM_COUNCIL.md` e remover
  as novas referencias de cargo real-base em `dreamteam.md`, `README.md` e
  `AGENTS.md`.
- Testes executados: contagem das 95 linhas de perfis, verificacao de ASCII,
  listagem de arquivos e revisao das chaves de fontes factuais.
- Resultados: conselho atualizado com cargo real-base, fonte factual e modo de
  emulacao por perfil.
- Pendencias: nenhuma funcional conhecida.

- Pedido do usuario: recuperar a camada anterior de profissionais,
  temperamentos e identidade do Dream Team sem perder a estrutura enxuta.
- Data/hora: 2026-04-26 17:19:07 UTC.
- Contexto: a consolidacao anterior manteve 6 papeis executivos, mas removeu a
  ideia de conselho expandido que dava contraditorio mais rico.
- Arquivos analisados: `README.md`, `AGENTS.md`, `dreamteam.md`,
  `PROJECT_MEMORY.md`, `dreamteam-log.md`.
- Decisoes: manter os 6 papeis como sintese executiva e restaurar o conselho
  expandido em um arquivo dedicado.
- Motivos: preservar o bootstrap pequeno e, ao mesmo tempo, manter as cadeiras
  profissionais, temperamentos e especialidades.
- Arquivos alterados: `README.md`, `AGENTS.md`, `dreamteam.md`,
  `dreamteam-log.md`.
- Arquivos criados: `DREAMTEAM_COUNCIL.md`.
- O que mudou: o kit passou a ter 95 cadeiras profissionais documentadas:
  84 de excelencia base, 5 POs votantes e 6 especialistas Mobile/Responsivo.
- Como desfazer: remover `DREAMTEAM_COUNCIL.md` e retirar suas referencias de
  `README.md`, `AGENTS.md` e `dreamteam.md`.
- Testes executados: `rg --files`; verificacao de caracteres nao ASCII;
  verificacao de referencias a `DREAMTEAM_COUNCIL.md`; conferencia da cadeira 95.
- Resultados: 6 arquivos copiaveis no kit; conselho expandido documentado com
  95 cadeiras; nenhuma ocorrencia nao ASCII nos arquivos Markdown principais.
- Pendencias: nenhuma funcional conhecida.

## 2026-05-18

- Pedido do usuario: aplicar a decisao aprovada de refazer a Adegaweb como a
  melhor loja possivel para vendas, usando referencia de UX de compra de grandes
  marketplaces e acabamento visual premium, com foco em iPhone.
- Data/hora: 2026-05-17 23:21:56 UTC.
- Contexto: a loja ja estava em producao, com admin e ERP da Olist funcionando;
  a primeira tela ainda parecia pagina promocional e o catalogo publicado tinha
  centenas de produtos, exigindo UX mais objetiva e carregamento progressivo.
- Arquivos analisados: `AGENTS.md`, `dreamteam.md`, `PROJECT_MEMORY.md`,
  `dreamteam-log.md`, `package.json`, `src/App.tsx`, `src/styles.css`.
- Decisoes: manter admin, modal 18+, Olist e links Mercado Livre intactos;
  transformar o topo em loja com busca, filtros, ordenacao, produto em destaque,
  buy box e grade de produtos; renderizar inicialmente 24 produtos e usar botao
  para ver mais.
- Motivos: reduzir friccao no iPhone, evitar tela longa com centenas de cards,
  priorizar acao de compra, melhorar leitura e manter reversibilidade.
- Arquivos alterados: `src/App.tsx`, `src/styles.css`, `PROJECT_MEMORY.md`,
  `dreamteam-log.md`.
- O que mudou: nova vitrine de compra no primeiro viewport; header claro;
  busca principal; seletor de ordenacao; categorias truncadas para nao estourar
  a tela; cards com preco, disponibilidade, detalhes e CTA; pagina de produto
  com buy box; carregamento progressivo; memoria do projeto atualizada.
- Como desfazer: reverter `src/App.tsx` e `src/styles.css` para a versao
  anterior ao redesenho e remover esta entrada do log/memoria se necessario.
- Testes executados: `npm run lint`; `npm run build`; `docker compose up -d
  --build`; `docker compose ps`; `curl -I https://adegaweb.com.br/`; `curl
  https://adegaweb.com.br/api/health`; Playwright em 390x844 e 1440x1000;
  Playwright em `/produto/...`; Playwright login admin.
- Resultados: lint e build passaram; Docker subiu healthy; HTTPS retornou 200;
  API health retornou `{"ok":true}`; storefront exibiu 24 de 494 produtos sem
  overflow detectado; pagina de produto mobile sem overflow; admin abriu com
  botoes de adicionar produto e puxar produtos do ERP.
- Pendencias: revisar o catalogo publicado no admin, porque ha produtos e
  categorias do ERP que nao parecem bebidas.

- Pedido do usuario: corrigir a loja porque a versao anterior continuou com
  letras enormes, menus quebrados e fotos grandes demais no iPhone.
- Data/hora: 2026-05-17 23:32:46 UTC.
- Contexto: a captura mobile mostrou cards grandes, categorias longas vindas do
  ERP prejudicando a navegacao e secoes secundarias com hierarquia exagerada.
- Arquivos analisados: `src/App.tsx`, `src/styles.css`, `PROJECT_MEMORY.md`,
  `dreamteam-log.md`.
- Fontes consultadas: Baymard sobre mobile ecommerce, filtros/listas de produto
  e pagina de produto; NN/g apareceu na pesquisa sobre filtros e busca.
- Decisoes: trocar chips de categoria por seletor compacto; reduzir tipografia;
  ocultar destaque no mobile; transformar cards mobile em lista densa; limitar
  altura das imagens; reduzir secoes secundarias; truncar categorias longas.
- Motivos: em iPhone, compra exige busca, filtro e lista escaneavel antes de
  composicao visual; categorias longas nao podem competir com produto e CTA.
- Arquivos alterados: `src/App.tsx`, `src/styles.css`, `PROJECT_MEMORY.md`,
  `dreamteam-log.md`.
- O que mudou: `getCategoryLabel`; seletor de categoria no topo; grids desktop
  mais densos; cards mobile horizontais com imagem contida; fotos da pagina de
  produto com altura controlada; headings e steps reduzidos.
- Como desfazer: reverter as alteracoes desta entrada em `src/App.tsx` e
  `src/styles.css`.
- Testes executados: `npm run lint`; `npm run build`; `docker compose up -d
  --build`; `docker compose ps`; `curl /api/health`; Playwright iPhone 390x844
  com screenshot e verificacao de overflow.
- Resultados: lint/build passaram; container ficou healthy; API OK; iPhone
  simulado exibiu 24 cards, dois seletores compactos, primeiro card 366x197,
  imagem 112x195 e zero overflow detectado.
- Pendencias: catalogo real ainda tem produtos do ERP fora do tema bebidas; isso
  deve ser revisado no admin ou filtrado por regra de negocio.

- Pedido do usuario: trocar as cores pasteis por uma paleta mais forte com
  roxo, laranja e preto.
- Data/hora: 2026-05-17 23:43:17 UTC.
- Contexto: a loja estava funcional no iPhone, mas visualmente ainda parecia
  clara demais e sem personalidade para uma adega online.
- Arquivos analisados: `src/styles.css`, `public/product-fallback.svg`,
  `public/og-cover.svg`, `public/favicon.svg`.
- Decisoes: usar preto no header, footer, areas de foto e secoes de apoio;
  laranja para preco, CTA secundario, icones e enfase; roxo para identidade,
  gradientes e bordas; manter cards brancos para leitura e compra rapida.
- Motivos: aumentar impacto visual sem sacrificar legibilidade, escaneabilidade
  e conversao em mobile.
- Arquivos alterados: `src/styles.css`, `public/product-fallback.svg`,
  `public/og-cover.svg`, `public/favicon.svg`, `PROJECT_MEMORY.md`,
  `dreamteam-log.md`.
- O que mudou: variaveis de cor, header, hero, busca, seletores, cards, preco,
  secoes de apoio, pagina de produto/admin com fundo roxo claro e SVGs da marca
  atualizados para roxo/laranja/preto.
- Como desfazer: reverter a paleta em `src/styles.css` e os tres SVGs publicos
  para a versao anterior.
- Testes executados: `npm run lint`; `npm run build`; `docker compose up -d
  --build`; `curl /api/health`; Playwright em 390x844 e 1440x1000 com screenshot
  e checagem de overflow.
- Resultados: lint/build passaram; Docker publicou healthy; API OK; screenshots
  mostram header preto, preco laranja e zero overflow nos dois viewports.
- Pendencias: nenhuma funcional desta alteracao.

- Pedido do usuario: adicionar um espaco para banners rotativos logo abaixo do
  titulo, catalogo, busca, categoria e ordenacao.
- Data/hora: 2026-05-18 01:08:48 UTC.
- Contexto: a primeira area da loja ja tinha busca e filtros; faltava uma faixa
  promocional rotativa antes da listagem de produtos.
- Arquivos analisados: `src/App.tsx`, `src/styles.css`,
  `PROJECT_MEMORY.md`, `dreamteam-log.md`.
- Decisoes: criar carousel automatico usando ate 4 produtos reais da vitrine;
  manter CTA de compra e link de detalhes; adicionar dots manuais; manter altura
  compacta no iPhone.
- Motivos: entregar o espaco de banners sem criar novo cadastro administrativo
  agora e sem prejudicar a lista de compra no mobile.
- Arquivos alterados: `src/App.tsx`, `src/styles.css`,
  `PROJECT_MEMORY.md`, `dreamteam-log.md`.
- O que mudou: estado `activeBanner`; rotacao por intervalo; bloco
  `promo-carousel` abaixo dos filtros; estilos desktop/mobile para banner com
  roxo, laranja e preto.
- Como desfazer: remover `activeBanner`, `bannerProducts`, os `useEffect` do
  banner, o bloco `promo-carousel` e seus estilos.
- Testes executados: `npm run lint`; `npm run build`; `docker compose up -d
  --build`; `curl /api/health`; Playwright em 390x844 e 1440x1000 com
  screenshot e verificacao de overflow.
- Resultados: lint/build passaram; API OK; banner apareceu abaixo dos filtros;
  mobile ficou 366x130, desktop 1312x229, 4 dots renderizados e zero overflow.
- Pendencias: se o dono quiser banners manuais de campanha, criar campos no
  painel da gerente em uma proxima etapa.

- Pedido do usuario: enxugar o kit Dream Team para ser copiado em outros projetos
  e deixar clara a regra de raiz operacional incluindo subpastas.
- Data/hora: 2026-04-26 UTC.
- Contexto: o diretorio continha varios templates e artefatos separados para
  descoberta, decisao, progresso, status, riscos e proximos passos.
- Arquivos analisados: `README.md`, `dreamteam.md`, `DECISION_SYSTEM.md`,
  `DISCOVERY_PROTOCOL.md`, `DECISION_DASH_TEMPLATE.md`,
  `PROJECT_BRIEF_TEMPLATE.md`, `MAPA_DO_PROJETO.md`,
  `MAPA_DO_PROJETO_TEMPLATE.md`, `MAPA_DE_FLUXOS.md`,
  `MAPA_DE_FLUXOS_TEMPLATE.md`, `FEATURE_STATUS.md`,
  `FEATURE_STATUS_TEMPLATE.md`, `KNOWN_ISSUES.md`,
  `KNOWN_ISSUES_TEMPLATE.md`, `NEXT_STEPS.md`, `NEXT_STEPS_TEMPLATE.md`,
  `PROGRESSO.md`, `score.md`.
- Decisoes: consolidar o kit em poucos arquivos; usar `AGENTS.md` como regra de
  escopo e arranque; consolidar memoria em `PROJECT_MEMORY.md`; substituir
  progresso/score por `dreamteam-log.md` e tabela de decisoes na memoria.
- Motivos: reduzir atrito ao copiar para novos projetos, evitar manutencao de
  muitos templates vazios e deixar explicito que a raiz contem todo o escopo
  abaixo dela.
- Arquivos alterados: `README.md`, `dreamteam.md`, `dreamteam-log.md`.
- Arquivos criados: `AGENTS.md`, `PROJECT_MEMORY.md`, `dreamteam-log.md`.
- Arquivos removidos: `DECISION_DASH_TEMPLATE.md`, `DECISION_SYSTEM.md`,
  `DISCOVERY_PROTOCOL.md`, `FEATURE_STATUS.md`,
  `FEATURE_STATUS_TEMPLATE.md`, `KNOWN_ISSUES.md`,
  `KNOWN_ISSUES_TEMPLATE.md`, `MAPA_DE_FLUXOS.md`,
  `MAPA_DE_FLUXOS_TEMPLATE.md`, `MAPA_DO_PROJETO.md`,
  `MAPA_DO_PROJETO_TEMPLATE.md`, `NEXT_STEPS.md`,
  `NEXT_STEPS_TEMPLATE.md`, `PROJECT_BRIEF_TEMPLATE.md`, `PROGRESSO.md`,
  `score.md`.
- O que mudou: estrutura documental foi reduzida para arquivos essenciais de
  instrucao, protocolo, memoria e auditoria; `README.md` tambem passou a avisar
  que `.codex`, se presente, nao faz parte do kit copiavel.
- Como desfazer: restaurar os arquivos removidos a partir de backup externo ou
  recriar os templates antigos com base no historico desta alteracao.
- Testes executados: validacao de estrutura por listagem de arquivos.
- Resultados: kit reduzido para `AGENTS.md`, `README.md`, `dreamteam.md`,
  `PROJECT_MEMORY.md` e `dreamteam-log.md`.
- Pendencias: `.codex` permanece como arquivo vazio externo ao kit; tentativa de
  remocao em 2026-04-26 17:15:35 UTC retornou `Device or resource busy`.

- Pedido do usuario: apontar todos os produtos do catalogo para o produto
  respectivo no Mercado Livre por nome ou SKU, usando a pagina principal da
  Varinha quando nao encontrar.
- Data/hora: 2026-05-18 18:11:47 UTC.
- Contexto: o catalogo persistido tinha 500 produtos e muitos ainda apontavam
  para uma URL antiga de listagem/categoria. A API publica/listagem completa do
  Mercado Livre retornou bloqueio/validacao para chamadas automatizadas no
  servidor, mas a pagina publica da Varinha renderizou parte dos produtos.
- Arquivos analisados: `AGENTS.md`, `PROJECT_MEMORY.md`,
  `dreamteam-log.md`, `docker-compose.yml`, volume
  `/var/lib/docker/volumes/wine_adegaweb_data/_data/products.json`,
  pagina publica `https://www.mercadolivre.com.br/pagina/varinha`.
- Decisoes: criar script operacional para atualizar links em massa; preservar
  links especificos existentes; cruzar produtos renderizados na pagina publica
  da Varinha por SKU/titulo; montar link direto para SKUs `MLB`; usar fallback
  `https://www.mercadolivre.com.br/pagina/varinha` quando nao houver match
  confiavel.
- Motivos: cumprir o pedido sem inventar links incertos; evitar travar em busca
  externa bloqueada; manter rollback simples via backup do JSON persistido.
- Arquivos criados: `scripts/link-mercadolivre-products.mjs`.
- Arquivos alterados: `eslint.config.js`, `PROJECT_MEMORY.md`,
  `dreamteam-log.md`, volume Docker
  `/var/lib/docker/volumes/wine_adegaweb_data/_data/products.json`.
- Artefatos gerados: `mercadolivre-link-report.json`; backup
  `/var/lib/docker/volumes/wine_adegaweb_data/_data/products.json.bak-20260518195921`.
- O que mudou: 500 produtos foram regravados; 2 links especificos existentes
  foram mantidos, 12 links vieram de SKU `MLB`, 5 vieram de match por titulo na
  pagina da Varinha e 481 ficaram no fallback da pagina principal.
- Como desfazer: restaurar o backup para
  `/var/lib/docker/volumes/wine_adegaweb_data/_data/products.json` ou rodar o
  script novamente apos ajustar as regras.
- Testes executados: `node --check scripts/link-mercadolivre-products.mjs`;
  dry-run com 30/40/140 produtos; execucao completa do script; verificacao do
  JSON persistido; `curl https://adegaweb.com.br/api/products`; `curl
  https://adegaweb.com.br/api/health`; `npm run lint`; `npm run build`.
- Resultados: script rodou em 500/500; nenhum produto ficou com a URL antiga de
  listagem; API em producao retornou 500 produtos com os novos links; health OK;
  lint e build passaram.
- Pendencias: para chegar a 100% de links especificos, precisa acesso autorizado
  aos anuncios/listagem do Mercado Livre ou exportacao de IDs dos anuncios,
  porque busca/listagem publica completa foi bloqueada no servidor.
- Pedido do usuario: registrar no init/protocolo que respostas devem ter no
  maximo 50 linhas e repetir a revisao Dreamteam de forma curta.
- Data/hora: 2026-06-10 05:46:42 UTC.
- Contexto: apos revisao geral do projeto, o usuario reforcou limite permanente
  de tamanho de resposta.
- Arquivos analisados: `AGENTS.md`, `PROJECT_MEMORY.md`, `dreamteam-log.md`.
- Decisoes: adicionar regra permanente de comunicacao concisa no protocolo e na
  memoria viva do projeto.
- Motivos: evitar respostas longas demais no ambiente do usuario e manter a
  regra carregada no inicio de trabalhos futuros.
- Arquivos alterados: `AGENTS.md`, `PROJECT_MEMORY.md`, `dreamteam-log.md`.
- O que mudou: limite de no maximo 50 linhas por mensagem registrado como regra
  operacional.
- Como desfazer: remover a regra adicionada em `AGENTS.md` e
  `PROJECT_MEMORY.md` e esta entrada do log.
- Testes executados: nao aplicavel; alteracao documental.
- Resultados: regra registrada.
- Pendencias: nenhuma.
- Pedido do usuario: criar plano para pendencias e executar o item 29
  imediatamente.
- Data/hora: 2026-06-10 05:57:27 UTC.
- Contexto: item 29 era corrigir Docker Compose v2 ou documentar alternativa
  oficial.
- Arquivos analisados: `DEPLOY.md`, `docker-compose.yml`, `PROJECT_MEMORY.md`,
  `scripts/`.
- Decisoes: como `docker compose` nao existe neste servidor, documentar Docker
  puro como caminho oficial e versionar script de deploy.
- Motivos: evitar dependencia de Compose inexistente e reduzir erro manual nos
  comandos de producao.
- Arquivos criados: `scripts/deploy-docker-run.sh`.
- Arquivos alterados: `DEPLOY.md`, `PROJECT_MEMORY.md`, `dreamteam-log.md`.
- O que mudou: deploy oficial neste servidor passou a ser
  `sudo ./scripts/deploy-docker-run.sh`; Compose v2 fica como opcao futura.
- Como desfazer: remover o script e reverter as secoes alteradas em
  `DEPLOY.md` e `PROJECT_MEMORY.md`.
- Testes executados: `docker compose version`; `sh -n scripts/deploy-docker-run.sh`.
- Resultados: `docker compose` indisponivel; script com sintaxe valida.
- Pendencias: instalar Docker Compose v2 se o usuario quiser trocar o caminho de
  deploy no futuro.
