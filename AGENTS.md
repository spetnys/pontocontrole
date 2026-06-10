# SUPER DREAM TEAM

Estas instrucoes valem para todo o projeto abaixo desta pasta.

## Raiz operacional

A pasta onde este `AGENTS.md` estiver e a raiz operacional do projeto.
Neste projeto, a raiz operacional e `/home/sheila/codex/pontocontrole`.
Tudo dentro dela pertence ao escopo, incluindo `wine`, `base de dados`, `wsp`,
`Imagens` e demais subpastas.

Nao assumir, ler ou alterar pastas acima da raiz operacional sem pedido
explicito do usuario. A excecao ja autorizada pelo usuario foi ler o kit base em
`/home/sheila/codex/dreamteam` para adaptar estas regras ao projeto atual.

## Protocolo

Antes de qualquer execucao:

1. ler a estrutura da raiz operacional;
2. identificar objetivo, tipo de projeto, arquivos criticos e dependencias;
3. avaliar riscos, ambiguidades e impacto;
4. consultar `dreamteam.md`;
5. emitir o `Veredito Inicial` em ate 80 linhas quando a tarefa envolver
   mudanca relevante, dados, producao, seguranca, arquitetura ou UI;
6. so alterar arquivos quando houver contexto suficiente e plano reversivel.

Em paginas principais, onboarding, CTAs, mensagens de sistema, estados vazios,
formularios e fluxos operacionais, revisar comunicacao como produto. Vetar texto
generico ou vazio antes de executar, especialmente rotulos como `Dados
isolados`, se nao explicarem beneficio concreto e verificavel.

Prioridade permanente de interface: projetar, revisar e testar sempre com foco
em iPhone/mobile first. Fluxos, textos, formularios, tabelas, modais, navegacao
e CTAs precisam funcionar primeiro em tela estreita antes de serem otimizados
para desktop.

Persistencia permanente: dados de negocio ficam online no servidor/banco, nunca
no navegador da pessoa. Nao usar `localStorage`, `sessionStorage`, IndexedDB ou
cookies para guardar clientes, usuarios, financeiro, agenda, permissoes,
atividades ou configuracoes de negocio. Sessao pode ser temporaria em memoria.

Se os arquivos ainda nao foram inspecionados, declarar:
`Arquivos ainda nao inspecionados.`

## Arquivos do Dream Team

- `dreamteam.md`: protocolo do conselho.
- `DREAMTEAM_COUNCIL.md`: perfis profissionais emulados, cargos reais-base e
  fontes factuais do conselho.
- `PROJECT_MEMORY.md`: memoria viva deste projeto.
- `dreamteam-log.md`: auditoria obrigatoria de analises e alteracoes.
- `README.md`: guia humano do kit.

## Projeto Atual

- Produto ativo: Ponto Controle publicado em `adegaweb.com.br`.
- Aplicacao principal: `wine`.
- Banco atual: PostgreSQL 16 em Docker, tabela `app_store`, coluna JSONB
  `data`.
- Proxy atual: Caddy em Docker com HTTPS para `adegaweb.com.br` e
  `www.adegaweb.com.br`.
- Backup restaurado: `base de dados/ponto-controle-db-backup-2026-06-10.json`.
- Pastas legadas/auxiliares: `wsp`, `Imagens`, `velascordeiro`.

## Log obrigatorio

Qualquer alteracao exige criar ou atualizar `dreamteam-log.md` na raiz. Se a
alteracao for especifica da aplicacao `wine`, tambem atualizar
`wine/dreamteam-log.md` quando fizer sentido.

O log deve registrar pedido, data/hora, contexto, arquivos analisados, decisoes,
motivos, arquivos alterados, o que mudou, como desfazer, testes executados,
resultados e pendencias.

## Regra pratica

Entender primeiro, mudar pouco, validar o suficiente e registrar tudo.
