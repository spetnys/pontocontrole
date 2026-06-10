# Deploy Adegaweb

Aplicacao atual: Ponto Controle em React/Vite + Express, publicada em
`adegaweb.com.br` e `www.adegaweb.com.br` via Docker e Caddy.

## DNS

No provedor do dominio, configure:

```txt
adegaweb.com.br.      A      144.33.20.37
www.adegaweb.com.br.  A      144.33.20.37
```

Remova registros A/AAAA antigos desses dois hosts. O Caddy so consegue emitir
HTTPS depois que o DNS aponta para o servidor e as portas `80` e `443` estao
liberadas.

## Ambiente

Crie o arquivo `.env` no servidor a partir de `.env.example` e preencha os
segredos reais:

```bash
cp .env.example .env
```

Variaveis principais:

- `SITE_URL=https://adegaweb.com.br`
- `MASTER_USER`
- `MASTER_PASSWORD`
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `OLIST_ERP_API_TOKEN`, se a integracao Olist/Tiny for usada
- `EVOLUTION_GLOBAL_API_KEY`, se WhatsApp/Evolution API for usado

## Subir

### Caminho oficial neste servidor

Em 2026-06-10, este servidor nao tem Docker Compose v2 instalado
(`docker compose` retorna `unknown command`). Portanto, o caminho oficial de
deploy aqui e Docker puro, pelo script versionado:

```bash
sudo ./scripts/deploy-docker-run.sh
```

Validar depois:

```bash
curl -fsS https://adegaweb.com.br/api/health
curl -fsS https://www.adegaweb.com.br/api/health
```

### Quando Docker Compose v2 existir

Com Docker Compose v2:

```bash
sudo docker compose up -d --build
```

Se o servidor tiver somente o binario legado funcional:

```bash
sudo docker-compose up -d --build
```

Comandos equivalentes do script Docker puro:

```bash
sudo docker build -t adegaweb-ponto-controle:latest .
sudo docker network create adegaweb_net
sudo docker volume create adegaweb_ponto_controle_postgres
sudo docker volume create adegaweb_ponto_controle_data
sudo docker volume create adegaweb_caddy_data
sudo docker volume create adegaweb_caddy_config
sudo docker run -d --name ponto-controle-db --restart unless-stopped \
  --network adegaweb_net --network-alias db --env-file .env \
  -v adegaweb_ponto_controle_postgres:/var/lib/postgresql/data \
  postgres:16-alpine
sudo docker run -d --name ponto-controle-app --restart unless-stopped \
  --network adegaweb_net --network-alias app --env-file .env \
  -e DATA_DIR=/data -e PORT=3000 -e SITE_URL=https://adegaweb.com.br \
  -e DATABASE_URL=postgres://$POSTGRES_USER:$POSTGRES_PASSWORD@db:5432/$POSTGRES_DB \
  -v adegaweb_ponto_controle_data:/data \
  adegaweb-ponto-controle:latest
sudo docker run -d --name adegaweb --restart unless-stopped \
  --network adegaweb_net -p 80:80 -p 443:443 \
  -v "$PWD/Caddyfile:/etc/caddy/Caddyfile:ro" \
  -v adegaweb_caddy_data:/data \
  -v adegaweb_caddy_config:/config \
  caddy:2-alpine
```

Validacoes:

```bash
curl -I http://144.33.20.37/api/health
curl -I https://adegaweb.com.br/api/health
curl -I https://www.adegaweb.com.br/api/health
```

## Persistencia

Os dados principais da aplicacao ficam no PostgreSQL, volume Docker
`adegaweb_ponto_controle_postgres`, tabela `app_store`, coluna JSONB `data`.
O volume `adegaweb_ponto_controle_data` fica como legado/fallback do modo por
arquivo. Antes de trocar de servidor ou recriar volumes, faca backup do banco.
