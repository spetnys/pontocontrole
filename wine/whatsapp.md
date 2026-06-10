# WhatsApp - Evolution API

Este projeto usara a Evolution API para funcoes de WhatsApp no sistema AdegaWeb / Ponto Controle.

## Referencia

- Repositorio oficial: https://github.com/evolution-foundation/evolution-api

## Credencial informada

- Manager: https://evo.guiapj.com.br/manager
- BaseUrl: https://evo.guiapj.com.br
- Tipo: API key master
- API key: `9ec03bc16a157c27f72d6c831c5843d9`

## Objetivo no sistema

Implementar envio de mensagens pelo WhatsApp usando a Evolution API, inicialmente para:

- enviar convite de compromisso criado na Agenda;
- enviar lembrete de atividade para pessoas da equipe;
- enviar notificacao para cliente quando houver evento, atividade ou pendencia relevante;
- futuramente automatizar mensagens recorrentes.

## Uso previsto

A chave acima devera ser usada pelo backend do Ponto Controle para autenticar chamadas na Evolution API.

Quando a integracao for implementada, preferir carregar a chave via variavel de ambiente, por exemplo:

```env
EVOLUTION_BASE_URL=https://evo.guiapj.com.br
EVOLUTION_MANAGER_URL=https://evo.guiapj.com.br/manager
EVOLUTION_GLOBAL_API_KEY=9ec03bc16a157c27f72d6c831c5843d9
```

## Implementacao no Ponto Controle

- Modulo lateral: Whatsapp
- Backend:
  - `GET /api/whatsapp`
  - `PUT /api/whatsapp/config`
  - `POST /api/whatsapp/connect`
  - `POST /api/whatsapp/disconnect`
  - `POST /api/whatsapp/restart`
  - `POST /api/whatsapp/send`
- Cada empresa master possui uma instancia propria da Evolution API.
- A Administradora Geral pode acessar e configurar todas as empresas master.
- Usuarios sem permissao do modulo Whatsapp nao visualizam a aba e nao enviam mensagens por API.
- A Agenda usa `POST /api/whatsapp/send` para enviar convites por WhatsApp quando o usuario tem permissao.

O arquivo documenta a credencial informada e a integracao atual para facilitar as proximas etapas de automacao.
