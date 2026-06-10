# ENV_REFERENCE

Este arquivo documenta as variaveis de ambiente relevantes do `Gabinete360`.

Regra importante:

- nao replique valores reais de producao em documentacao
- o repositorio local pode conter `.env.production` com credenciais reais
- trate isso como dado sensivel

## 1. Visao geral

O projeto usa tres grupos de variaveis:

- runtime do servidor
- integracoes externas
- infraestrutura de proxy/deploy

## 2. Runtime do servidor

| Variavel | Obrigatoria | Default | Onde e usada | Efeito se faltar |
| --- | --- | --- | --- | --- |
| `NODE_ENV` | Nao | `development` quando ausente no runtime local | `package.json`, `src/server.js` | Controla modo dev/prod do Next e do servidor |
| `PORT` | Nao | `3000` | `src/server.js`, `docker-compose.yml` | Servidor sobe na porta 3000 |
| `GABINETE360_HOST` | Nao | `0.0.0.0` | `src/server.js`, `package.json`, `docker-compose.yml` | Sem isso continua ouvindo externamente pelo default atual |
| `GABINETE360_NO_LISTEN` | Nao | vazio | `src/server.js` | Quando `1`, o processo exporta o server sem chamar `listen` |
| `GABINETE360_BOOTSTRAP_ADMIN_PASSWORD_HASH` | Nao | hash interno de bootstrap | `src/db/database.js` | Define o hash da senha do master quando o banco nasce vazio |
| `SLOW_REQUEST_LOG_MS` | Nao | `900` | `src/server.js` | Define a partir de quantos ms o servidor registra `slow_request` |

Observacao:

- o projeto foi ajustado explicitamente para subir em `0.0.0.0`
- isso foi exigencia operacional do usuario

## 3. Google OAuth

| Variavel | Obrigatoria | Default | Onde e usada | Efeito se faltar |
| --- | --- | --- | --- | --- |
| `GOOGLE_OAUTH_CLIENT_ID` | Sim para OAuth | vazio | `src/server.js` | Login com Google fica desativado |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Sim para OAuth | vazio | `src/server.js` | Callback nao consegue trocar `code` por token |
| `GOOGLE_OAUTH_REDIRECT_URI` | Nao, mas recomendado | calculado por host da requisicao | `src/server.js` | Pode funcionar por inferencia, mas e melhor fixar em producao |

Observacoes:

- redirect oficial esperado:
  - `https://gabinete.guiapj.com.br/api/auth/google/callback`
- origem JavaScript autorizada no Google:
  - `https://gabinete.guiapj.com.br`

## 4. Evolution API

| Variavel | Obrigatoria | Default | Onde e usada | Efeito se faltar |
| --- | --- | --- | --- | --- |
| `EVOLUTION_BASE_URL` | Sim para Evolution | vazio | `src/server.js` | Conector cai para `wa.me` |
| `EVOLUTION_MANAGER_URL` | Nao | vazio | `src/server.js`, tela de configuracao | Apenas metadado de manager |
| `EVOLUTION_GLOBAL_API_KEY` | Sim para Evolution | vazio | `src/server.js` | Nao cria, conecta nem envia pela Evolution |

Observacoes:

- com essas variaveis ausentes, o sistema ainda funciona em fallback `wa.me`
- o usuario nao deve ver nem editar essas chaves na UI

## 5. Lookups, CEP, CNPJ e feriados

| Variavel | Obrigatoria | Default | Onde e usada | Efeito se faltar |
| --- | --- | --- | --- | --- |
| `INVERTEXTO_TOKEN` | Nao | vazio | `src/server.js` | Rotas `invertexto/*` ficam indisponiveis; feriados podem continuar pelo banco local |
| `RECEITAWS_TOKEN` | Nao | vazio | `src/server.js` | Fallback de CNPJ via ReceitaWS deixa de funcionar |
| `CONSULTARIO_TOKEN` | Nao | vazio | `src/server.js` | CPF, CEP e recursos profissionais do Consultar.IO ficam indisponiveis |
| `CNPJBIZ_TOKEN` | Nao | vazio | `src/server.js` | Status do provedor aparece como configurado, mas o app ainda nao mapeia endpoint oficial para uso pratico |

Observacoes:

- BrasilAPI, OpenCEP, AwesomeAPI, CNPJa e CNPJ.ws nao dependem de chave nas chamadas atualmente usadas
- o sistema expoe o estado configurado dos provedores, nao os segredos

## 6. E-mail de suporte e caixa postal

| Variavel | Obrigatoria | Default | Onde e usada | Efeito se faltar |
| --- | --- | --- | --- | --- |
| `SUPPORT_EMAIL_ADDRESS` | Recomendado | `suporte@guiapj.com.br` | `src/server.js`, UI publica | Define o e-mail oficial de suporte mostrado no produto |
| `EMAIL_SMTP_HOST` | Sim para envio SMTP | vazio | runtime de integracao futura | Sem isso nao ha envio autenticado |
| `EMAIL_SMTP_PORT` | Sim para envio SMTP | vazio | runtime de integracao futura | Porta de envio fica indefinida |
| `EMAIL_SMTP_SECURE` | Recomendado | `1` | runtime de integracao futura | Pode quebrar handshakes SSL/TLS esperados |
| `EMAIL_SMTP_USERNAME` | Sim para envio SMTP | vazio | runtime de integracao futura | Autenticacao SMTP falha |
| `EMAIL_SMTP_PASSWORD` | Sim para envio SMTP | vazio | runtime de integracao futura | Autenticacao SMTP falha |
| `EMAIL_POP_HOST` | Sim para leitura POP | vazio | runtime de integracao futura | Sem leitura da caixa |
| `EMAIL_POP_PORT` | Sim para leitura POP | vazio | runtime de integracao futura | Porta POP fica indefinida |
| `EMAIL_POP_SECURE` | Recomendado | `1` | runtime de integracao futura | Pode quebrar handshakes SSL esperados |
| `EMAIL_POP_USERNAME` | Sim para leitura POP | vazio | runtime de integracao futura | Autenticacao POP falha |
| `EMAIL_POP_PASSWORD` | Sim para leitura POP | vazio | runtime de integracao futura | Autenticacao POP falha |

Observacoes:

- nao documentar valores reais aqui
- para este projeto, SMTP e POP usam a mesma caixa de suporte
- a UI publica deve consumir apenas o endereco de suporte, nunca usuario ou senha

## 7. OpenAI e recursos de IA

| Variavel | Obrigatoria | Default | Onde e usada | Efeito se faltar |
| --- | --- | --- | --- | --- |
| `OPENAI_API_KEY` | Sim para botoes de IA | vazio | `src/server.js` | Botoes como `Resumir com IA` retornam IA indisponivel |
| `OPENAI_SUMMARY_MODEL` | Nao | `gpt-5` | `src/server.js` | Define o modelo usado para resumos curtos |

Observacoes:

- nao documentar a chave real em arquivos `.md`
- a chave deve ficar apenas no servidor, via `.env.production`
- o frontend nunca deve receber token da OpenAI

## 8. Infraestrutura de proxy e SSL

Estas variaveis aparecem no `docker-compose.yml` e sao importantes para o deploy por `nginx-proxy`.

| Variavel | Obrigatoria | Default | Onde e usada | Efeito se faltar |
| --- | --- | --- | --- | --- |
| `VIRTUAL_HOST` | Sim no cenario atual | vazio | `docker-compose.yml` | Proxy automatico nao descobre o host |
| `VIRTUAL_PORT` | Nao | `3000` no compose atual | `docker-compose.yml` | Proxy pode apontar para a porta errada |
| `LETSENCRYPT_HOST` | Sim no cenario atual | vazio | `docker-compose.yml` | Certificado automatico pode nao ser emitido |

## 9. Arquivos e Nextcloud

| Variavel | Obrigatoria | Default | Onde e usada | Efeito se faltar |
| --- | --- | --- | --- | --- |
| `GABINETE360_STORAGE_DEFAULT_QUOTA_BYTES` | Nao | `1073741824` | `src/server.js` | Gabinetes sem plano avancado ficam com 1 GB de cota interna |
| `GABINETE360_STORAGE_WEBDAV_TIMEOUT_MS` | Nao | `8000` | `src/server.js` | Define o tempo limite da consulta WebDAV |
| `GABINETE360_STORAGE_WEBDAV_PASSWORD_GABINETE_<ID>` | Sim para WebDAV do gabinete | vazio | `src/server.js`, tabela `gabinetes.storage_webdav_password_env` | Sem isso o gabinete mostra o plano, mas nao consulta a cota do Nextcloud |

Observacoes:

- use senha de aplicativo do Nextcloud, nao a senha principal da conta
- o frontend nunca recebe senha WebDAV
- gabinete sem WebDAV ve apenas contador de uso interno e botao para falar com suporte
| `LETSENCRYPT_EMAIL` | Recomendado | vazio | `docker-compose.yml` | Operacao de SSL perde contato administrativo |

## 9. Onde cada grupo aparece

Arquivos principais:

- `.env.production`
- `package.json`
- `docker-compose.yml`
- `src/server.js`

## 10. Regras de manuseio

Boas praticas recomendadas:

- nunca imprimir os valores em logs de app
- nunca colar segredos em documentacao, PR ou issue
- evitar respostas de suporte que revelem o arquivo `.env.production`
- sempre documentar se uma feature depende de provider opcional

## 11. O que nao existe como env hoje

Ausencias que podem surpreender:

- nao ha `DATABASE_URL`
- nao ha `NEXT_PUBLIC_*` relevantes
- nao ha `JWT_SECRET`; a sessao usa token persistido em tabela `sessions`
- nao ha `REDIS_URL`
- nao ha configuracao externa de caminho do SQLite no desenho atual

## 12. Checklist para outra IA antes de mexer em deploy

1. confirmar `GABINETE360_HOST=0.0.0.0`
2. confirmar `PORT=3000`
3. confirmar dominio oficial e proxy
4. confirmar se Google OAuth precisa continuar ativo
5. confirmar se Evolution deve ser modo oficial ou fallback
6. nunca reescrever `.env.production` expondo valores no chat

Leitura complementar:

- `OPERATIONS.md`
- `INTEGRATIONS.md`
- `KNOWN_ISSUES.md`
