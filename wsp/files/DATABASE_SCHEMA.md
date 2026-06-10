# Gabinete360 - Schema do Banco

Este arquivo documenta o schema atual do SQLite.

Fonte principal:

- [src/db/database.js](/home/marcel/codex/gabinete360/src/db/database.js)

Banco:

- [data/gabinete360.db](/home/marcel/codex/gabinete360/data/gabinete360.db)

## 1. Estrategia geral

O banco e local, em arquivo, e inicializado por:

- `initDatabase()`

O projeto nao usa ORM.

Migracoes incrementais sao feitas por:

- `schemaSql`
- `ensureColumn(...)`

## 2. Regras gerais de modelagem

- entidades operacionais usam `gabinete_id`
- quase todas as datas sao `TEXT` em ISO
- IDs sao `INTEGER PRIMARY KEY AUTOINCREMENT`
- muitos campos opcionais ficam vazios em vez de `NULL`
- o produto privilegia rapidez de evolucao sobre formalismo relacional extremo

## 3. Tabelas

### 3.1 `gabinetes`

Finalidade:

- cadastro do ambiente/mandato

Campos principais:

- `id`
- `slug`
- `name`
- `type`
- `parliamentarian_name`
- `party`
- `city`
- `city_ibge`
- `uf`
- `responsible_name`
- `phone`
- `email`
- `logo_url`
- `public_slug`
- `whatsapp_provider`
- `whatsapp_instance_name`
- `whatsapp_instance_token`
- `default_follow_up_days`
- `default_document_due_days`
- `default_birthday_notice_days`
- `team_label`
- `status`
- `onboarding_completed`
- `created_at`
- `updated_at`

Observacoes:

- `slug` e unico
- `public_slug` e usado no autocadastro publico
- `whatsapp_*` guarda a vinculacao do canal do gabinete

### 3.2 `users`

Finalidade:

- usuarios internos do sistema

Campos principais:

- `id`
- `gabinete_id`
- `username`
- `name`
- `email`
- `phone`
- `role`
- `password_hash`
- `avatar_url`
- `status`
- `must_change_password`
- `password_changed_at`
- `last_login_at`
- `last_login_ip`
- `last_login_provider`
- `created_at`
- `updated_at`

Observacoes:

- `email` e unico globalmente
- `username` tem indice unico parcial

### 3.3 `sessions`

Finalidade:

- sessoes persistidas por cookie

Campos:

- `id`
- `user_id`
- `token`
- `expires_at`
- `last_active_at`
- `created_at`

### 3.4 `categories`

Finalidade:

- categorias de demanda do gabinete

Campos:

- `id`
- `gabinete_id`
- `name`
- `color`
- `active`
- `created_at`
- `updated_at`

### 3.5 `status_custom`

Finalidade:

- status de atendimento

Campos:

- `id`
- `gabinete_id`
- `name`
- `color`
- `sort_order`
- `is_final`
- `active`
- `created_at`
- `updated_at`

### 3.6 `channels`

Finalidade:

- canais de entrada de atendimento

Campos:

- `id`
- `gabinete_id`
- `name`
- `active`
- `created_at`
- `updated_at`

### 3.7 `whatsapp_templates`

Finalidade:

- mensagens prontas do gabinete

Campos:

- `id`
- `gabinete_id`
- `title`
- `body`
- `kind`
- `active`
- `created_at`
- `updated_at`

### 3.8 `contacts`

Finalidade:

- base de municipes, liderancas, autoridades e empresas

Campos principais:

- `id`
- `gabinete_id`
- `name`
- `contact_type`
- `segment`
- `gender`
- `is_leader`
- `is_authority`
- `phone`
- `whatsapp`
- `cpf_rg_cns`
- `birth_date`
- `email`
- `photo_url`
- `profession`
- `referred_by`
- `company_legal_name`
- `foundation_date`
- `employee_count`
- `has_pet`
- `address`
- `number`
- `complement`
- `neighborhood`
- `zip_code`
- `city`
- `uf`
- `social_instagram`
- `social_facebook`
- `social_x`
- `social_youtube`
- `geo_lat`
- `geo_lng`
- `notes`
- `tags`
- `first_ticket_at`
- `last_ticket_at`
- `created_at`
- `updated_at`

Observacoes:

- suporta pessoa e empresa
- suporta classificacoes politicas e sociais

### 3.9 `tickets`

Finalidade:

- atendimentos/demandas

Campos principais:

- `id`
- `gabinete_id`
- `contact_id`
- `number`
- `opened_at`
- `channel`
- `status`
- `priority`
- `tags`
- `demand_title`
- `demand_category`
- `description`
- `current_guidance`
- `assigned_user_id`
- `department`
- `external_protocol`
- `internal_due_date`
- `dependency_note`
- `follow_up_days`
- `next_action`
- `next_action_date`
- `closed_at`
- `result`
- `closure_confirmed`
- `geo_lat`
- `geo_lng`
- `is_archived`
- `is_favorite`
- `created_at`
- `updated_at`

Observacoes:

- `number` e unico globalmente
- `follow_up_days` pode vir do padrao do gabinete

### 3.10 `ticket_history`

Finalidade:

- timeline do atendimento

Campos:

- `id`
- `gabinete_id`
- `ticket_id`
- `user_id`
- `action_type`
- `text`
- `previous_status`
- `new_status`
- `next_action`
- `next_action_date`
- `is_internal`
- `created_at`

### 3.11 `saved_filters`

Finalidade:

- filtros salvos por usuario

Campos:

- `id`
- `gabinete_id`
- `user_id`
- `context`
- `label`
- `payload_json`
- `created_at`
- `updated_at`

### 3.12 `lookup_preferences`

Finalidade:

- provedor de lookup preferido por usuario

Campos:

- `id`
- `gabinete_id`
- `user_id`
- `kind`
- `provider_key`
- `created_at`
- `updated_at`

### 3.13 `favorites`

Finalidade:

- favoritos do usuario

Campos:

- `id`
- `gabinete_id`
- `user_id`
- `entity_type`
- `entity_id`
- `created_at`

### 3.14 `documents`

Finalidade:

- oficios, indicacoes, requerimentos e afins

Campos principais:

- `id`
- `gabinete_id`
- `ticket_id`
- `template_id`
- `type`
- `internal_number`
- `chamber_number`
- `protocol_date`
- `department`
- `subject_line`
- `addressed_to`
- `routing_hint`
- `legal_due_date`
- `status`
- `demand`
- `summary_request`
- `summary_response`
- `generated_text`
- `progress_note`
- `result`
- `next_action`
- `next_action_date`
- `notes`
- `attachment_url`
- `signature_profile_id`
- `created_at`
- `updated_at`

### 3.15 `document_templates`

Finalidade:

- biblioteca de modelos institucionais

Campos:

- `id`
- `gabinete_id`
- `title`
- `type`
- `topic`
- `variant_name`
- `recommended_department`
- `target_authority`
- `via_strategy`
- `use_case`
- `subject_template`
- `body_template`
- `summary_template`
- `tags`
- `is_builtin`
- `active`
- `created_at`
- `updated_at`

### 3.16 `signature_profiles`

Finalidade:

- assinaturas prontas do gabinete

Campos:

- `id`
- `gabinete_id`
- `label`
- `signatory_name`
- `signatory_role`
- `closing_text`
- `footer_text`
- `file_url`
- `active`
- `created_at`
- `updated_at`

### 3.17 `ai_links`

Finalidade:

- links uteis e de IA

Campos:

- `id`
- `gabinete_id`
- `title`
- `url`
- `description`
- `active`
- `created_at`
- `updated_at`

### 3.18 `routing_rules`

Finalidade:

- regra de encaminhamento por assunto

Campos:

- `id`
- `gabinete_id`
- `topic`
- `keywords`
- `recommended_department`
- `target_authority`
- `via_strategy`
- `notes`
- `priority`
- `active`
- `created_at`
- `updated_at`

### 3.19 `projects`

Finalidade:

- proposituras e ideias legislativas

Campos:

- `id`
- `gabinete_id`
- `title`
- `description`
- `responsible_id`
- `status`
- `external_link`
- `category`
- `notes`
- `created_at`
- `updated_at`

### 3.20 `tasks`

Finalidade:

- tarefas internas

Campos:

- `id`
- `gabinete_id`
- `title`
- `description`
- `responsible_id`
- `ticket_id`
- `contact_id`
- `document_id`
- `project_id`
- `due_at`
- `priority`
- `status`
- `created_at`
- `updated_at`

### 3.21 `call_logs`

Finalidade:

- controle de ligacoes

Campos:

- `id`
- `gabinete_id`
- `contact_id`
- `phone`
- `subject`
- `notes`
- `outcome`
- `call_at`
- `created_by`
- `created_at`
- `updated_at`

### 3.22 `whatsapp_messages`

Finalidade:

- historico de mensagens enviadas pelo modulo de WhatsApp

Campos:

- `id`
- `gabinete_id`
- `contact_id`
- `ticket_id`
- `user_id`
- `template_id`
- `provider`
- `direction`
- `instance_name`
- `remote_phone`
- `remote_jid`
- `message_text`
- `provider_message_id`
- `provider_status`
- `provider_payload`
- `created_at`
- `updated_at`

Observacoes:

- criada na rodada da integracao Evolution
- guarda historico interno sem expor token ao usuario

### 3.23 `finance_entries`

Finalidade:

- entradas e saidas de controle financeiro simples

Campos:

- `id`
- `gabinete_id`
- `title`
- `description`
- `category`
- `entry_type`
- `status`
- `amount_cents`
- `entry_date`
- `created_by`
- `created_at`
- `updated_at`

### 3.24 `user_access_log`

Finalidade:

- log de acessos

Campos:

- `id`
- `user_id`
- `provider`
- `ip_address`
- `created_at`

### 3.25 `notifications`

Finalidade:

- central de notificacoes

Campos:

- `id`
- `gabinete_id`
- `user_id`
- `title`
- `message`
- `kind`
- `entity_type`
- `entity_id`
- `is_read`
- `created_at`
- `read_at`

### 3.26 `audit_log`

Finalidade:

- trilha de auditoria

Campos:

- `id`
- `gabinete_id`
- `user_id`
- `action`
- `entity_type`
- `entity_id`
- `previous_data`
- `new_data`
- `created_at`

### 3.27 `imports`

Finalidade:

- historico de importacoes

Campos:

- `id`
- `gabinete_id`
- `user_id`
- `source_name`
- `source_type`
- `status`
- `total_rows`
- `imported_contacts`
- `imported_tickets`
- `duplicates_count`
- `errors_count`
- `summary_json`
- `created_at`

### 3.28 `holidays`

Finalidade:

- catalogo local de feriados

Campos:

- `id`
- `scope`
- `kind`
- `date`
- `year`
- `name`
- `uf`
- `city_name`
- `city_ibge`
- `legal_basis`
- `source_name`
- `source_url`
- `validation_status`
- `notes`
- `dedupe_key`
- `created_at`
- `updated_at`

Observacoes:

- suporta `national`, `state` e `municipal`
- usa `dedupe_key` unico

## 4. Seeds padrao

Status padrao:

- Novo
- Em analise
- Aguardando retorno
- Aguardando servico
- Oficio encaminhado
- Indicacao / Requerimento
- Aguardando pagamento
- Finalizado
- Cancelado

Canais padrao:

- WhatsApp
- Presencial
- Telefone
- E-mail
- Rede social
- Oficio
- Outro

Categorias padrao:

- Saude
- Educacao
- Obras
- Iluminacao publica
- Poda de arvore
- Limpeza urbana
- Emprego
- Assistencia social
- Transporte
- Esporte
- Cultura
- Habitacao
- Seguranca
- Outros

Templates de WhatsApp:

- Primeiro contato
- Pedido de informacoes
- Atualizacao de andamento
- Oficio encaminhado
- Resposta recebida
- Finalizacao

## 5. Indices relevantes

Indices explicitamente criados:

- `idx_contacts_segment`
- `idx_tickets_status_dates`
- `idx_call_logs_phone`
- `idx_whatsapp_messages_lookup`
- `idx_finance_entries_date`
- `idx_users_username`
- `idx_holidays_lookup`

## 6. Observacoes importantes para outra IA

- o schema foi crescendo por `ensureColumn`, nao por migrations formais
- antes de mudar colunas de `gabinetes`, verificar seeds, backup/restore e payload de sessao
- antes de mudar colunas de `tickets`, verificar timeline, dashboard e importador
- antes de mudar colunas de `contacts`, verificar autocomplete, importador e CNPJ/CPF lookups
- antes de mudar `whatsapp_messages`, verificar modulo Evolution e fallback `wa.me`
