# Dream Team Bootstrap

Kit minimo para iniciar trabalhos com analise critica, execucao segura e
rastreabilidade.

## Como usar

Copie estes arquivos para a raiz operacional do projeto:

- `AGENTS.md`
- `dreamteam.md`
- `DREAMTEAM_COUNCIL.md`
- `PROJECT_MEMORY.md`
- `dreamteam-log.md`
- `README.md`

Se um arquivo vazio `.codex` aparecer neste ambiente, ignore: ele nao faz parte
do kit copiavel.

Depois acione o agente dentro dessa raiz ou de qualquer subpasta dela.

Exemplos:

- arquivos em `/.../p1`: o escopo e `/.../p1` e tudo abaixo.
- arquivos em `/.../p2`: o escopo e `/.../p2` e tudo abaixo.
- arquivos em `/.../p3`: comandos feitos em `/.../p3/x` continuam dentro do
  escopo de `/.../p3`.

## Regra de escopo

A pasta onde estes arquivos forem colocados e a raiz operacional do projeto.
Tudo abaixo dela pertence ao projeto. Pastas acima dela ficam fora do escopo,
salvo pedido explicito do usuario.

## Arquivos

- `AGENTS.md`: instrucao de arranque e regra de escopo para agentes.
- `dreamteam.md`: protocolo do conselho, votos, vetos, decisao e execucao.
- `DREAMTEAM_COUNCIL.md`: 95 perfis profissionais emulados com cargo real-base,
  fonte factual e comportamento esperado.
- `PROJECT_MEMORY.md`: memoria viva do projeto atual.
- `dreamteam-log.md`: log obrigatorio de analises, decisoes, alteracoes e testes.
- `README.md`: guia humano para copiar e usar o kit.

## Primeiro uso em cada projeto

1. Ler a raiz operacional.
2. Identificar tipo de projeto, objetivo, estrutura, dependencias e riscos.
3. Emitir o `Veredito Inicial` em ate 80 linhas.
4. So alterar arquivos depois de entender impacto e registrar no log.

## Principio

Menos arquivos, mais disciplina: entender antes, alterar pouco, registrar tudo e
manter cada mudanca facil de revisar e desfazer.
