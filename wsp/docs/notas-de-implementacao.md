# Notas de implementacao

- O modo padrao e `evolution` quando `EVOLUTION_BASE_URL` e `EVOLUTION_GLOBAL_API_KEY` existem; caso contrario, cai para `wa_me`.
- O token da instancia fica em `gabinetes.whatsapp_instance_token`, nao no frontend.
- O frontend usa QRCode local para renderizar o payload retornado pelo servidor.
- `WHATSAPP_QR_COOLDOWNS` e memoria de processo; serve apenas para evitar spam de QR.
- Persistencia real: `whatsapp_messages`, `whatsapp_threads`, `whatsapp_templates` e colunas `whatsapp_*` em `gabinetes`.
- Historico de atendimento recebe uma entrada quando uma mensagem e enviada com ticket vinculado.
- `buildWhatsappLookups` limita contatos e atendimentos a 500 para autocomplete; conversas recentes vem das threads.
- A tela principal e `whatsapp-crm-screen.tsx`; `whatsapp-screen.tsx` e tela antiga/simples de conexao.
- Nao remover `provider_message_id`; ele e a trava principal contra duplicidade de webhook.
- Nao remover `remote_phone` normalizado; ele e a chave de thread.
