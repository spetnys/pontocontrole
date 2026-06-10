# WSP - WhatsApp do Gabinete360

Pacote extraido de `/home/marcel/codex/gabinete360` em 2026-06-09T22:08:18.645Z.

Objetivo: entregar para outra maquina/outra IA a parte de WhatsApp do Gabinete360 com o mesmo comportamento que foi corrigido aqui.

## O que tem aqui

- `files/`: codigo real copiado do projeto.
- `docs/api-contract.md`: endpoints e comportamento esperado.
- `docs/server-whatsapp-map.md`: mapa dos trechos no servidor e no banco.
- `docs/schema-whatsapp.sql`: tabelas, colunas e indices minimos.
- `docs/env.example`: variaveis necessarias, sem segredo real.
- `docs/regression-checklist.md`: testes que nao podem quebrar.

## O que NAO foi copiado

- `.env`, token da Evolution, banco SQLite real, uploads/anexos e `node_modules`.
- Qualquer credencial deve ser configurada na maquina nova.

## Arquivos principais

- UI principal: `files/components/features/whatsapp/whatsapp-crm-screen.tsx`
- Rota Next: `files/app/(workspace)/whatsapp-crm/page.tsx`
- Redirect antigo: `files/app/(workspace)/whatsapp/page.tsx`
- Configuracoes/onboarding: `files/components/features/settings/settings-screen.tsx`
- Servidor/API/webhook: `files/src/server.js`
- Banco/schema/seeds/templates: `files/src/db/database.js`
- Helpers de telefone/busca: `files/lib/utils.ts` e `files/src/lib/helpers.js`

## Como portar sem perder comportamento

1. Levar as tabelas/colunas/indices de `docs/schema-whatsapp.sql`.
2. Levar os endpoints `/api/whatsapp*` e o webhook `/api/whatsapp/webhook/:instance`.
3. Manter o escopo por `gabinete_id` em toda consulta e escrita.
4. Manter a normalizacao de telefone, inclusive variantes com/sem `55` e nono digito.
5. Configurar `EVOLUTION_BASE_URL`, `EVOLUTION_GLOBAL_API_KEY` e `GABINETE360_PUBLIC_URL`.
6. Rodar o checklist em `docs/regression-checklist.md`.

## Regra importante

Nao use `localStorage` ou `sessionStorage` para estado do WhatsApp. O estado fica no banco por gabinete e usuario autenticado.
