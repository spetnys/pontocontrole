# Contrato da API de WhatsApp

Todas as rotas autenticadas usam o gabinete da sessao. Nao aceitar `gabinete_id` vindo do cliente.

## GET /api/whatsapp

Retorna:

- `connector`: modo, instancia, conectado, estado e metadados.
- `support`: contato de suporte.
- `lookups`: usuarios, contatos, atendimentos e templates.
- `threads`: conversas ordenadas pela ultima mensagem.
- `recent_messages`: ultimas mensagens.

## POST /api/whatsapp/connect

Cria/usa instancia Evolution, configura webhook publico e retorna QR/pairing code.

Regras:

- Precisa de permissao administrativa.
- Trava novo QR por 60 segundos por gabinete/instancia.
- Resposta 429 deve trazer `retry_after_seconds` e `qr_next_allowed_at`.
- Se nao houver Evolution configurada, retornar 503.

## POST /api/whatsapp/disconnect

Faz logout da instancia Evolution. Nao apaga historico local.

## POST /api/whatsapp/restart

Reinicia a instancia Evolution. Nao apaga historico local.

## POST /api/whatsapp/send

Aceita JSON para texto ou multipart para texto + 1 anexo.

Regras:

- Numero obrigatorio, normalizado no servidor.
- Se nao houver Evolution conectada, texto cai para `wa.me`.
- Anexo no modo `wa.me` deve ser bloqueado.
- Com Evolution, envia texto ou media, grava `whatsapp_messages`, atualiza `whatsapp_threads` e registra historico se tiver atendimento vinculado.
- Anexo: apenas PDF/JPG/PNG/WEBP, ate 10 MB, 1 arquivo por mensagem.

## POST /api/whatsapp/threads

Cria ou atualiza thread pelo telefone normalizado.

Regras:

- Unique por `gabinete_id + remote_phone`.
- Vinculos de contato/ticket/usuario sempre validados no gabinete.
- `unread_count` so incrementa quando webhook inbound pede incremento.

## POST /api/whatsapp/threads/read

Zera `unread_count` da conversa.

## POST /api/whatsapp/threads/ticket

Cria atendimento a partir da conversa e vincula a thread.

## POST /api/whatsapp/webhook/:instance

Webhook publico da Evolution.

Regras:

- Localiza gabinete por `whatsapp_instance_name`.
- Ignora grupos `@g.us`.
- Ignora mensagem sem telefone ou sem texto/anexo.
- Deduplica por `provider_message_id`.
- Cria contato automaticamente se o telefone ainda nao existir.
- Atualiza thread e incrementa nao-lidas so para inbound.
- Notifica usuario responsavel ou administradores/assessores ativos.
- Evento de desconexao cria notificacao de problema na linha.
