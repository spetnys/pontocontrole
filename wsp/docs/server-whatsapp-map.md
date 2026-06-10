# Mapa de codigo WhatsApp

## UI

- `components/features/whatsapp/whatsapp-crm-screen.tsx:51-52`: intervalos de QR/status.
- `components/features/whatsapp/whatsapp-crm-screen.tsx:124`: carrega `/api/whatsapp?limit=200`.
- `components/features/whatsapp/whatsapp-crm-screen.tsx:180-187`: contador de cooldown do QR.
- `components/features/whatsapp/whatsapp-crm-screen.tsx:369-390`: marca conversa como lida.
- `components/features/whatsapp/whatsapp-crm-screen.tsx:410-454`: salva/vincula conversa.
- `components/features/whatsapp/whatsapp-crm-screen.tsx:460-500`: cria atendimento a partir da conversa.
- `components/features/whatsapp/whatsapp-crm-screen.tsx:510-552`: envia texto/anexo.
- `components/features/whatsapp/whatsapp-crm-screen.tsx:559-590`: conecta e respeita cooldown.
- `components/features/whatsapp/whatsapp-crm-screen.tsx:601-607`: tenta gerar QR automaticamente quando precisa.
- `components/features/whatsapp/whatsapp-crm-screen.tsx:702-707`: polling de status do conector.
- `components/features/whatsapp/whatsapp-crm-screen.tsx:710-714`: renovacao automatica do QR.

## API e servidor

- `src/server.js:180-184`: env da Evolution e cooldown em memoria.
- `src/server.js:299-305`: anexos permitidos no WhatsApp.
- `src/server.js:3389-3422`: resumo do conector e trava de QR.
- `src/server.js:6121-6125`: webhook `POST /api/whatsapp/webhook/:instance`.
- `src/server.js:6340-6766`: endpoints `/api/whatsapp*`.
- `src/server.js:10557-10578`: nome seguro de instancia e link `wa.me`.
- `src/server.js:11874-12077`: Evolution API, criar, conectar, reiniciar, logout, enviar texto/media.
- `src/server.js:12077-12380`: estado do conector, notificacao de desconexao e confirmacao publica por WhatsApp.
- `src/server.js:12384-13064`: listagem, threads, logs, webhook, dedupe e criacao automatica de contato.

## Banco

- `src/db/database.js:58-86`: templates padrao de WhatsApp.
- `src/db/database.js:1074-1083`: migracoes/colunas incrementais.
- `src/db/database.js:1374-1376`: indices de mensagens/threads.
- `src/db/database.js:2622-2624`: colunas no `gabinetes`.
- `src/db/database.js:2748`: `whatsapp_templates`.
- `src/db/database.js:3224`: `whatsapp_messages`.
- `src/db/database.js:3248`: `whatsapp_threads`.
