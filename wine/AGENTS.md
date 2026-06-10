# SUPER DREAM TEAM

Estas instrucoes valem para todo o projeto abaixo desta pasta.

## Raiz operacional

A pasta onde este `AGENTS.md` estiver e a raiz operacional do projeto.
Tudo dentro dela pertence ao escopo, incluindo subpastas e subprojetos.

Exemplos:

- se este arquivo estiver em `/.../p1`, o escopo e `/.../p1/**`;
- se estiver em `/.../p2`, o escopo e `/.../p2/**`;
- se estiver em `/.../p3` e o trabalho ocorrer em `/.../p3/x`, o escopo continua sendo `/.../p3/**`.

Nao assumir, ler ou alterar pastas acima da raiz operacional sem pedido explicito
do usuario.

## Protocolo

Antes de qualquer execucao:

1. ler a estrutura da raiz operacional;
2. identificar objetivo, tipo de projeto, arquivos criticos e dependencias;
3. avaliar riscos, ambiguidades e impacto;
4. consultar `dreamteam.md`;
5. emitir o `Veredito Inicial` em ate 80 linhas;
6. so alterar arquivos quando houver contexto suficiente e plano reversivel.

Regra permanente de comunicacao com o usuario: responder sempre de forma
concisa, com no maximo 50 linhas por mensagem. Quando houver muita informacao,
priorizar decisao, pendencias, validacao e proximo passo; nao despejar relatorio
longo.

Em paginas principais, landing pages, onboarding, CTAs e mensagens de sistema,
revisar comunicacao como produto. Vetar texto generico ou vazio antes de
executar, especialmente rotulos como `Dados isolados`, se nao explicarem
beneficio concreto e verificavel.

Prioridade permanente de interface: projetar, revisar e testar sempre com foco
em iPhone/mobile first. Fluxos, textos, formularios, tabelas, modais,
navegacao e CTAs precisam funcionar primeiro em tela estreita antes de serem
otimizados para desktop.

Se os arquivos ainda nao foram inspecionados, declarar:
`Arquivos ainda nao inspecionados.`

## Arquivos do Dream Team

- `dreamteam.md`: protocolo do conselho.
- `DREAMTEAM_COUNCIL.md`: perfis profissionais emulados, cargos reais-base e
  fontes factuais do conselho.
- `PROJECT_MEMORY.md`: memoria viva do projeto atual.
- `dreamteam-log.md`: auditoria obrigatoria de analises e alteracoes.
- `README.md`: guia de uso do kit.

## Log obrigatorio

Qualquer alteracao exige criar ou atualizar `dreamteam-log.md`.

O log deve registrar pedido, data/hora, contexto, arquivos analisados, decisoes,
motivos, arquivos alterados, o que mudou, como desfazer, testes executados,
resultados e pendencias.

## Regra pratica

Entender primeiro, mudar pouco, validar o suficiente e registrar tudo.
