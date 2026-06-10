# Checklist de regressao

1. Sem Evolution configurada: `GET /api/whatsapp` mostra modo `wa_me`; enviar texto retorna URL `wa.me`; enviar anexo retorna erro.
2. Com Evolution configurada: `POST /api/whatsapp/connect` cria/usa instancia, retorna QR e grava `whatsapp_instance_name/token`.
3. Clicar varias vezes em conectar: a segunda tentativa em menos de 60s retorna 429 e a UI mostra cooldown.
4. Depois que o celular conecta, a UI limpa QR e mostra estado conectado sem precisar recarregar manualmente.
5. Envio de texto conectado: mensagem entra em `whatsapp_messages` com `direction='outbound'` e thread atualiza ultima mensagem.
6. Envio de anexo conectado: aceitar so PDF/JPG/PNG/WEBP, 1 arquivo, ate 10 MB.
7. Webhook inbound: cria contato se telefone nao existir, cria/atualiza thread, incrementa `unread_count`, notifica responsavel/admin.
8. Webhook duplicado com mesmo `provider_message_id`: nao duplica mensagem.
9. Grupo `@g.us`: ignorado.
10. Marcar conversa lida: `unread_count` zera no banco e na UI.
11. Criar atendimento pela conversa: cria contato se necessario, cria ticket, vincula thread e mantem telefone correto.
12. Telefone com/sem `55` e com/sem nono digito deve achar o mesmo contato sempre que possivel.
13. Trocar de gabinete: conversas, templates e instancia nao podem vazar entre gabinetes.
14. Reiniciar build/container: mensagens, threads e config continuam no banco; QR em cooldown pode resetar porque e memoria temporaria.
15. Webhook sem URL publica valida: nao configurar webhook para localhost/127.0.0.1.
