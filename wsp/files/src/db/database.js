import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dirname, resolve } from "node:path";

import { hashPassword } from "../lib/auth.js";
import {
  inferBrazilianAreaCode,
  normalizePhone,
  nowIso,
  slugify,
  titleCase,
} from "../lib/helpers.js";

const DB_PATH = resolve(process.cwd(), "data", "gabinete360.db");
const BOOTSTRAP_ADMIN_PASSWORD_HASH =
  process.env.GABINETE360_BOOTSTRAP_ADMIN_PASSWORD_HASH ||
  "b1db6ae458f9045540ade62e7a011c54:6eb13e5035bb24660ccea3aa19bf02df5195dac164aea5a849f3c56dc04c9410f63b2a919222c8d80f66e72ac3c38a85c91fdc506ca2d91ee90725d90013eb42";

const DEFAULT_STATUSES = [
  { name: "Aberto", color: "#2563eb", sort_order: 1, is_final: 0 },
  { name: "Em analise", color: "#0f766e", sort_order: 2, is_final: 0 },
  { name: "Aguardando retorno", color: "#f59e0b", sort_order: 3, is_final: 0 },
  { name: "Aguardando servico", color: "#fb7185", sort_order: 4, is_final: 0 },
  { name: "Oficio encaminhado", color: "#8b5cf6", sort_order: 5, is_final: 0 },
  { name: "Indicacao / Requerimento", color: "#ec4899", sort_order: 6, is_final: 0 },
  { name: "Aguardando pagamento", color: "#f97316", sort_order: 7, is_final: 0 },
  { name: "Finalizado", color: "#16a34a", sort_order: 8, is_final: 1 },
  { name: "Cancelado", color: "#64748b", sort_order: 9, is_final: 1 },
];

const DEFAULT_CHANNELS = [
  "WhatsApp",
  "Presencial",
  "Telefone",
  "E-mail",
  "Rede social",
  "Oficio",
  "Outro",
];

const DEFAULT_CATEGORIES = [
  "Saude",
  "Educacao",
  "Obras",
  "Iluminacao publica",
  "Poda de arvore",
  "Limpeza urbana",
  "Emprego",
  "Assistencia social",
  "Transporte",
  "Esporte",
  "Cultura",
  "Habitacao",
  "Seguranca",
  "Outros",
];

const DEFAULT_WHATSAPP_TEMPLATES = [
  {
    title: "Primeiro contato",
    kind: "first_contact",
    body: "Ola, aqui e a assessoria do gabinete. Tudo bem? Estamos entrando em contato sobre sua solicitacao.",
  },
  {
    title: "Pedido de informacoes",
    kind: "more_info",
    body: "Ola. Precisamos de algumas informacoes complementares para seguir com seu atendimento. Pode nos responder por aqui?",
  },
  {
    title: "Atualizacao de andamento",
    kind: "update",
    body: "Ola. Estamos atualizando o andamento da sua solicitacao. Em breve retornaremos com mais detalhes.",
  },
  {
    title: "Oficio encaminhado",
    kind: "document_sent",
    body: "Ola. Informamos que o oficio relacionado a sua solicitacao ja foi encaminhado ao orgao responsavel.",
  },
  {
    title: "Resposta recebida",
    kind: "response_received",
    body: "Ola. Recebemos uma resposta sobre sua solicitacao e vamos compartilhar os proximos passos com voce.",
  },
  {
    title: "Finalizacao",
    kind: "closed",
    body: "Ola. Seu atendimento foi finalizado. Seguimos a disposicao para qualquer nova necessidade.",
  },
];

const textBlock = (...parts) => parts.join("\n\n");

const DEFAULT_ROUTING_RULES = [
  {
    topic: "Zeladoria",
    keywords: "zeladoria,limpeza,mato,entulho,capinacao,varricao,cacamba,cata bagulho",
    recommended_department: "Secretaria de Servicos Publicos / Zeladoria",
    target_authority: "Secretario(a) de Servicos Publicos",
    via_strategy:
      "Encaminhar direto para Servicos Publicos ou Zeladoria. Se houver reincidencia ou risco coletivo, copiar Gabinete do Prefeito.",
    notes:
      "Em municipios sem pasta propria, o pedido costuma ficar em Obras, Infraestrutura ou empresa terceirizada de limpeza urbana.",
    priority: 100,
  },
  {
    topic: "Iluminacao publica",
    keywords: "iluminacao,lampada,poste,escuro,led,braco de luz",
    recommended_department: "Secretaria de Servicos Publicos / Iluminacao Publica",
    target_authority: "Secretario(a) de Servicos Publicos",
    via_strategy:
      "Encaminhar para a equipe de iluminacao publica. Se envolver contrato ou concessionaria, citar o responsavel contratual.",
    notes:
      "Iluminacao e uma das demandas mais recorrentes de zeladoria e costuma exigir endereco preciso e ponto de referencia.",
    priority: 95,
  },
  {
    topic: "Poda de arvore",
    keywords: "poda,arvore,galhos,risco de queda,calcada obstruida",
    recommended_department: "Secretaria de Meio Ambiente / Servicos Publicos",
    target_authority: "Secretario(a) de Meio Ambiente",
    via_strategy:
      "Encaminhar para Meio Ambiente ou Manejo Florestal. Em caso de risco imediato, indicar tambem Defesa Civil.",
    notes:
      "Quando houver risco a pedestres, veiculos ou rede eletrica, registrar urgencia e anexar foto.",
    priority: 94,
  },
  {
    topic: "Tapa-buraco e recapeamento",
    keywords: "buraco,tapa buraco,asfalto,recapeamento,pavimentacao,valeta",
    recommended_department: "Secretaria de Obras / Infraestrutura",
    target_authority: "Secretario(a) de Obras",
    via_strategy:
      "Encaminhar para Obras ou Infraestrutura. Se envolver drenagem pluvial, copiar o setor tecnico responsavel.",
    notes:
      "Essas demandas costumam precisar de trecho exato, numero aproximado e referencia visual.",
    priority: 93,
  },
  {
    topic: "Mobilidade e transito",
    keywords: "sinalizacao,faixa,lombada,semaforo,transito,placa,faixa de pedestre,ponto de onibus,abrigo",
    recommended_department: "Secretaria de Mobilidade Urbana / Transito",
    target_authority: "Secretario(a) de Mobilidade Urbana",
    via_strategy:
      "Encaminhar para Mobilidade, Transito ou Sistema Viario. Havendo estudo tecnico, pedir vistoria e parecer formal.",
    notes:
      "Faixa, placa, semaforo, abrigo e redutor de velocidade normalmente passam por Mobilidade.",
    priority: 92,
  },
  {
    topic: "Agua e esgoto",
    keywords: "agua,esgoto,vazamento,falta dagua,saneamento,galeria,rede de agua,rede de esgoto",
    recommended_department: "Autarquia de Agua e Esgoto / SAAE / DAAE",
    target_authority: "Superintendente da Autarquia",
    via_strategy:
      "Encaminhar para a autarquia de agua e esgoto. Se envolver drenagem de via publica, avaliar copia para Obras.",
    notes:
      "Em muitas cidades isso nao fica na prefeitura direta, mas em autarquia ou concessionaria.",
    priority: 91,
  },
  {
    topic: "Saude",
    keywords: "saude,ubs,upa,consulta,exame,medicamento,especialidade,atendimento medico",
    recommended_department: "Secretaria / Fundacao Municipal de Saude",
    target_authority: "Secretario(a) de Saude",
    via_strategy:
      "Encaminhar para Secretaria ou Fundacao de Saude. Para cobranca institucional, usar requerimento ou oficio com prazo.",
    notes:
      "Pedidos individuais sensiveis exigem cuidado com dados pessoais e linguagem objetiva.",
    priority: 90,
  },
  {
    topic: "Educacao",
    keywords: "educacao,creche,escola,transporte escolar,merenda,professor,unidade escolar",
    recommended_department: "Secretaria de Educacao",
    target_authority: "Secretario(a) de Educacao",
    via_strategy:
      "Encaminhar para Educacao. Se envolver predio escolar, avaliar copia para Obras ou manutencao predial.",
    notes:
      "Creche, merenda, transporte e manutencao escolar aparecem com frequencia no gabinete.",
    priority: 88,
  },
  {
    topic: "Assistencia social",
    keywords: "cras,creas,assistencia social,cesta basica,beneficio,situacao de vulnerabilidade",
    recommended_department: "Secretaria de Desenvolvimento Social / Assistencia Social",
    target_authority: "Secretario(a) de Desenvolvimento Social",
    via_strategy:
      "Encaminhar para Desenvolvimento Social, CRAS, CREAS ou Fundo Social, conforme o pedido.",
    notes:
      "Demandas sociais costumam exigir acolhimento e registro claro da proxima acao.",
    priority: 87,
  },
  {
    topic: "Habitacao",
    keywords: "habitacao,casa popular,regularizacao fundiaria,cadastro habitacional,moradia",
    recommended_department: "Secretaria de Habitacao / Planejamento",
    target_authority: "Secretario(a) de Habitacao",
    via_strategy:
      "Encaminhar para Habitacao ou Planejamento. Havendo obra vinculada, copiar Obras.",
    notes:
      "Regularizacao, cadastro social e acompanhamento de loteamentos entram nessa trilha.",
    priority: 86,
  },
  {
    topic: "Seguranca e defesa civil",
    keywords: "seguranca,gcm,guarda,defesa civil,risco,alagamento,queda de muro,ocupacao irregular",
    recommended_department: "Secretaria de Seguranca / Defesa Civil",
    target_authority: "Secretario(a) de Seguranca",
    via_strategy:
      "Encaminhar para Seguranca, Guarda Civil ou Defesa Civil, conforme o risco relatado.",
    notes:
      "Quando houver risco iminente, orientar contato imediato com o canal emergencial do municipio.",
    priority: 85,
  },
  {
    topic: "Esporte e cultura",
    keywords: "esporte,cultura,quadra,praca esportiva,ginasio,evento,cultural",
    recommended_department: "Secretaria de Esportes / Cultura",
    target_authority: "Secretario(a) da pasta responsavel",
    via_strategy:
      "Encaminhar para a secretaria tematica correspondente e, se houver obra, copiar manutencao ou obras.",
    notes:
      "Pracas esportivas, campos, eventos e centros culturais costumam exigir articulacao com mais de uma pasta.",
    priority: 80,
  },
];

export const DEFAULT_AI_LINKS = [
  {
    title: "ChatGPT",
    url: "https://chatgpt.com",
    description: "Rascunhos, revisoes, planejamento, ideias de comunicacao e apoio geral.",
    kind: "principal",
    category: "Texto e estrategia",
    sort_order: 10,
  },
  {
    title: "Claude",
    url: "https://claude.ai",
    description: "Leitura longa, minutas, comparacao de textos e refinamento de documentos.",
    kind: "principal",
    category: "Texto e estrategia",
    sort_order: 20,
  },
  {
    title: "Google Gemini",
    url: "https://gemini.google.com",
    description: "Pesquisa, sintese, apoio com arquivos e integracao com o ecossistema Google.",
    kind: "principal",
    category: "Texto e estrategia",
    sort_order: 30,
  },
  {
    title: "Microsoft Copilot",
    url: "https://copilot.microsoft.com",
    description: "Apoio para rotina em navegador, Office, textos, planilhas e documentos.",
    kind: "principal",
    category: "Texto e estrategia",
    sort_order: 40,
  },
  {
    title: "Perplexity",
    url: "https://www.perplexity.ai",
    description: "Pesquisa com fontes para contexto, noticias, temas publicos e verificacao rapida.",
    kind: "principal",
    category: "Pesquisa",
    sort_order: 50,
  },
  {
    title: "NotebookLM",
    url: "https://notebooklm.google.com",
    description: "Organizacao de PDFs, leis, atas, relatorios e materiais enviados ao gabinete.",
    kind: "principal",
    category: "Pesquisa",
    sort_order: 60,
  },
  {
    title: "DeepSeek",
    url: "https://chat.deepseek.com",
    description: "Raciocinio, codigo, analise e alternativas de baixo custo para pesquisa e texto.",
    kind: "principal",
    category: "Texto e estrategia",
    sort_order: 70,
  },
  {
    title: "Qwen",
    url: "https://chat.qwen.ai",
    description: "Modelo da Alibaba para escrita, analise, codigo e tarefas multimodais.",
    kind: "principal",
    category: "Texto e estrategia",
    sort_order: 80,
  },
  {
    title: "Grok",
    url: "https://grok.com",
    description: "Pesquisa e leitura de temas em tempo real, especialmente ligados ao X.",
    kind: "principal",
    category: "Pesquisa",
    sort_order: 90,
  },
  {
    title: "Mistral Le Chat",
    url: "https://chat.mistral.ai/chat",
    description: "Chat de IA para escrita, analise e apoio geral com modelos Mistral.",
    kind: "principal",
    category: "Texto e estrategia",
    sort_order: 100,
  },
  {
    title: "Meta AI",
    url: "https://www.meta.ai",
    description: "Apoio geral e criativo conectado ao ecossistema Meta.",
    kind: "principal",
    category: "Texto e estrategia",
    sort_order: 110,
  },
  {
    title: "Elicit",
    url: "https://elicit.com",
    description: "Pesquisa assistida para encontrar, resumir e comparar estudos e referencias.",
    kind: "principal",
    category: "Pesquisa",
    sort_order: 120,
  },
  {
    title: "Consensus",
    url: "https://consensus.app",
    description: "Busca respostas em artigos cientificos e ajuda em temas tecnicos.",
    kind: "principal",
    category: "Pesquisa",
    sort_order: 130,
  },
  {
    title: "Scite",
    url: "https://scite.ai",
    description: "Verificacao de citacoes e apoio para avaliar qualidade de referencias.",
    kind: "principal",
    category: "Pesquisa",
    sort_order: 140,
  },
  {
    title: "Midjourney",
    url: "https://www.midjourney.com",
    description: "Geracao de imagens para campanhas, pecas, ideias visuais e conceitos.",
    kind: "principal",
    category: "Imagem",
    sort_order: 200,
  },
  {
    title: "Adobe Firefly",
    url: "https://www.adobe.com/products/firefly.html",
    description: "Imagem, video e design com modelos criativos dentro do ecossistema Adobe.",
    kind: "principal",
    category: "Imagem",
    sort_order: 210,
  },
  {
    title: "Canva AI",
    url: "https://www.canva.com/ai/",
    description: "Design, posts, apresentacoes, artes rapidas e materiais de comunicacao.",
    kind: "principal",
    category: "Imagem",
    sort_order: 220,
  },
  {
    title: "Ideogram",
    url: "https://ideogram.ai",
    description: "Imagens com boa composicao e tipografia para pecas visuais.",
    kind: "principal",
    category: "Imagem",
    sort_order: 230,
  },
  {
    title: "Leonardo AI",
    url: "https://leonardo.ai",
    description: "Geracao e edicao de imagens e videos para criacao visual.",
    kind: "principal",
    category: "Imagem",
    sort_order: 240,
  },
  {
    title: "Freepik AI",
    url: "https://www.freepik.com/ai",
    description: "Banco visual com ferramentas de IA para imagem, vetor e design.",
    kind: "principal",
    category: "Imagem",
    sort_order: 250,
  },
  {
    title: "Krea",
    url: "https://www.krea.ai",
    description: "Criacao e refinamento visual com IA para imagens e conceitos.",
    kind: "principal",
    category: "Imagem",
    sort_order: 260,
  },
  {
    title: "Sora",
    url: "https://openai.com/sora/",
    description: "Video por IA para ideias de roteiro, cenas e comunicacao visual.",
    kind: "principal",
    category: "Video",
    sort_order: 300,
  },
  {
    title: "Runway",
    url: "https://runwayml.com",
    description: "Geracao e edicao de video com IA para conteudo institucional e social.",
    kind: "principal",
    category: "Video",
    sort_order: 310,
  },
  {
    title: "Pika",
    url: "https://pika.art",
    description: "Criacao de videos curtos e cenas a partir de texto ou imagem.",
    kind: "principal",
    category: "Video",
    sort_order: 320,
  },
  {
    title: "Luma Dream Machine",
    url: "https://lumalabs.ai/dream-machine",
    description: "Video generativo para cenas, movimento e pecas criativas.",
    kind: "principal",
    category: "Video",
    sort_order: 330,
  },
  {
    title: "Kling AI",
    url: "https://klingai.com",
    description: "Geracao de video e imagem com IA para conteudo criativo.",
    kind: "principal",
    category: "Video",
    sort_order: 340,
  },
  {
    title: "HeyGen",
    url: "https://www.heygen.com",
    description: "Videos com avatar, dublagem e traducao para comunicacao e treinamento.",
    kind: "principal",
    category: "Video",
    sort_order: 350,
  },
  {
    title: "OpusClip",
    url: "https://www.opus.pro",
    description: "Recorta videos longos em cortes curtos para redes sociais.",
    kind: "principal",
    category: "Video",
    sort_order: 360,
  },
  {
    title: "ElevenLabs",
    url: "https://elevenlabs.io",
    description: "Voz, narracao, leitura e clonagem com autorizacao expressa.",
    kind: "principal",
    category: "Voz e audio",
    sort_order: 400,
  },
  {
    title: "Descript",
    url: "https://www.descript.com",
    description: "Edicao de audio e video por texto, transcricao e cortes rapidos.",
    kind: "principal",
    category: "Voz e audio",
    sort_order: 410,
  },
  {
    title: "Speechify",
    url: "https://speechify.com",
    description: "Leitura em voz alta, narracao e apoio para consumir documentos.",
    kind: "principal",
    category: "Voz e audio",
    sort_order: 420,
  },
  {
    title: "PlayHT",
    url: "https://play.ht",
    description: "Texto para voz e vozes de IA para narracoes e audios.",
    kind: "principal",
    category: "Voz e audio",
    sort_order: 430,
  },
  {
    title: "Gamma",
    url: "https://gamma.app",
    description: "Apresentacoes, documentos e paginas a partir de ideias ou texto.",
    kind: "principal",
    category: "Apresentacoes",
    sort_order: 500,
  },
  {
    title: "Napkin AI",
    url: "https://www.napkin.ai",
    description: "Transforma texto em diagramas, mapas mentais e visuais para explicar ideias.",
    kind: "principal",
    category: "Apresentacoes",
    sort_order: 510,
  },
  {
    title: "Beautiful.ai",
    url: "https://www.beautiful.ai/ai-presentations",
    description: "Criacao de slides e apresentacoes profissionais com apoio de IA.",
    kind: "principal",
    category: "Apresentacoes",
    sort_order: 520,
  },
];

const HOLIDAY_PROVIDER_SOURCE_URL = "https://api.invertexto.com/api-feriados";
const HOLIDAY_MGI_2026_SOURCE_URL =
  "https://www.gov.br/gestao/pt-br/assuntos/noticias/2025/dezembro/confira-o-calendario-oficial-de-feriados-nacionais-e-pontos-facultativos-em-2026";
const HOLIDAY_CONSCIENCIA_NEGRA_SOURCE_URL =
  "https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/l14759.htm";
const HOLIDAY_RIO_CLARO_LAW_SOURCE_URL =
  "https://www.feriados.com.br/docs/sp/rio_claro/rio_claro_sp_feriados_religiosos.pdf";
const HOLIDAY_RIO_CLARO_OPERATIONS_SOURCE_URL =
  "https://rioclaro.sp.gov.br/secretarias/secretaria-e-servicos-publicos/coleta-de-lixo-sera-normal-durante-corpus-christi-e-aniversario-de-rc/";
const HOLIDAY_RIO_CLARO_IBGE_SOURCE_URL =
  "https://www.ibge.gov.br/cidades-e-estados/sp/rio-claro.html";

const DEFAULT_NATIONAL_HOLIDAY_ROWS = [
  ["2026-01-01", "Confraternizacao Universal"],
  ["2026-04-03", "Sexta-feira Santa"],
  ["2026-04-21", "Tiradentes"],
  ["2026-05-01", "Dia do Trabalhador"],
  ["2026-09-07", "Independencia do Brasil"],
  ["2026-10-12", "Nossa Senhora Aparecida"],
  ["2026-11-02", "Finados"],
  ["2026-11-15", "Proclamacao da Republica"],
  ["2026-11-20", "Dia Nacional de Zumbi e da Consciencia Negra"],
  ["2026-12-25", "Natal"],
  ["2027-01-01", "Confraternizacao Universal"],
  ["2027-03-26", "Sexta-feira Santa"],
  ["2027-04-21", "Tiradentes"],
  ["2027-05-01", "Dia do Trabalhador"],
  ["2027-09-07", "Independencia do Brasil"],
  ["2027-10-12", "Nossa Senhora Aparecida"],
  ["2027-11-02", "Finados"],
  ["2027-11-15", "Proclamacao da Republica"],
  ["2027-11-20", "Dia Nacional de Zumbi e da Consciencia Negra"],
  ["2027-12-25", "Natal"],
];

const DEFAULT_STATE_HOLIDAY_ROWS = [
  ["2026-01-04", "RO", "Criacao do estado", "Lei estadual nº 2291/2010", "provider_law"],
  ["2026-01-23", "AC", "Dia do Evangelico", "Lei estadual nº 1.538/2004", "provider_law"],
  ["2026-02-17", "RJ", "Carnaval", "Lei nº 5.243/2008", "provider_law"],
  ["2026-03-06", "PE", "Revolucao Pernambucana de 1817", "Lei estadual nº 13.835/2009", "provider_law"],
  ["2026-03-08", "AC", "Dia Internacional da Mulher", "Lei estadual nº 1.411/2001", "provider_law"],
  ["2026-03-18", "TO", "Autonomia do Estado", "Lei estadual nº 960/1998", "provider_law"],
  ["2026-03-19", "CE", "Dia de Sao Jose", "Lei federal nº 9.093/1995", "provider_law"],
  ["2026-03-25", "CE", "Abolicao da escravidao no Ceara", "Art. 18, paragrafo unico da constituicao estadual", "provider_law"],
  ["2026-04-13", "ES", "Dia de Nossa Senhora da Penha", "Lei estadual nº 11.010/2019", "provider_law"],
  ["2026-04-21", "DF", "Aniversario de Brasilia", "", "provider_verified"],
  ["2026-04-23", "RJ", "Dia de Sao Jorge", "Lei nº 5.198/2008", "provider_law"],
  ["2026-06-15", "AC", "Aniversario do Acre", "Lei estadual nº 14/1964", "provider_law"],
  ["2026-06-18", "RO", "Dia do evangelico", "Lei estadual nº 1.026/2001", "provider_law"],
  ["2026-06-24", "AL", "Sao Joao", "Lei estadual nº 5.508/1993", "provider_law"],
  ["2026-06-24", "PE", "Festa de Sao Joao", "", "provider_verified"],
  ["2026-06-29", "AL", "Sao Pedro", "Lei estadual nº 5.509/1993", "provider_law"],
  ["2026-07-02", "BA", "Independencia da Bahia", "Art. 6º, § 3º da Constituicao estadual", "provider_law"],
  ["2026-07-08", "SE", "Emancipacao politica de Sergipe", "Art. 269 da Constituicao estadual", "provider_law"],
  ["2026-07-09", "SP", "Revolucao Constitucionalista", "Lei estadual nº 9.497/1997", "provider_law"],
  ["2026-07-26", "GO", "Fundacao da cidade de Goias", "Lei estadual nº 20.756/2020", "provider_law"],
  ["2026-07-28", "MA", "Adesao do Maranhao a independencia do Brasil", "Lei estadual nº 2.457/1964", "provider_law"],
  ["2026-08-05", "PB", "Fundacao do Estado", "Lei estadual nº 3.489/1967", "provider_law"],
  ["2026-08-07", "RN", "Dia do Rio Grande do Norte", "Lei Estadual nº 7.831, de 30 de maio de 2000", "provider_law"],
  ["2026-08-15", "CE", "Dia de Nossa Senhora da Assuncao", "Lei federal nº 9.093/1995", "provider_law"],
  ["2026-08-15", "PA", "Adesao do Para a independencia do Brasil", "Lei estadual nº 5.999/1996", "provider_law"],
  ["2026-09-05", "AC", "Dia da Amazonia", "Lei estadual nº 1.526/2004", "provider_law"],
  ["2026-09-05", "AM", "Elevacao do Amazonas a categoria de provincia", "Lei estadual nº 25/1977", "provider_law"],
  ["2026-09-08", "TO", "Padroeira do Estado", "Lei estadual nº 627/1993", "provider_law"],
  ["2026-09-13", "AP", "Criacao do Territorio Federal", "Art. 355 da Constituicao estadual", "provider_law"],
  ["2026-09-16", "AL", "Emancipacao politica", "Decreto Nº 68782 de 30 de dezembro de 2019", "provider_law"],
  ["2026-09-20", "RS", "Dia do Gaucho", "Art. 6, paragrafo unico da constituicao estadual", "provider_law"],
  ["2026-10-03", "RN", "Martires de Cunhau e Uruacu", "Lei estadual nº 8.913/2006", "provider_law"],
  ["2026-10-05", "RR", "Criacao do estado", "Art. 9 da Constituicao estadual", "provider_law"],
  ["2026-10-05", "TO", "Criacao do estado", "Lei estadual nº 98/1989", "provider_law"],
  ["2026-10-11", "MS", "Criacao do estado", "Lei estadual nº 10/1979", "provider_law"],
  ["2026-10-19", "PI", "Dia do Piaui", "Lei estadual nº 176/1937", "provider_law"],
  ["2026-10-24", "GO", "Pedra fundamental de Goiania", "Lei estadual nº 20.756/2020", "provider_law"],
  ["2026-11-17", "AC", "Assinatura do Tratado de Petropolis", "Lei estadual nº 57/1965", "provider_law"],
  ["2026-11-20", "AL", "Morte de Zumbi dos Palmares", "Lei estadual nº 5.724/1995", "provider_law"],
  ["2026-11-20", "AP", "Morte de Zumbi dos Palmares", "Lei estadual nº 667, de 16 de abril de 2002", "provider_law"],
  ["2026-11-30", "DF", "Dia do Evangelico", "Lei distrital nº 963/1995", "provider_law"],
  ["2026-12-08", "AM", "Nossa Senhora da Conceicao", "", "provider_verified"],
  ["2027-01-04", "RO", "Criacao do estado", "Lei estadual nº 2291/2010", "provider_law"],
  ["2027-01-23", "AC", "Dia do Evangelico", "Lei estadual nº 1.538/2004", "provider_law"],
  ["2027-02-09", "RJ", "Carnaval", "Lei nº 5.243/2008", "provider_law"],
  ["2027-03-06", "PE", "Revolucao Pernambucana de 1817", "Lei estadual nº 13.835/2009", "provider_law"],
  ["2027-03-08", "AC", "Dia Internacional da Mulher", "Lei estadual nº 1.411/2001", "provider_law"],
  ["2027-03-18", "TO", "Autonomia do Estado", "Lei estadual nº 960/1998", "provider_law"],
  ["2027-03-19", "CE", "Dia de Sao Jose", "Lei federal nº 9.093/1995", "provider_law"],
  ["2027-03-25", "CE", "Abolicao da escravidao no Ceara", "Art. 18, paragrafo unico da constituicao estadual", "provider_law"],
  ["2027-04-05", "ES", "Dia de Nossa Senhora da Penha", "Lei estadual nº 11.010/2019", "provider_law"],
  ["2027-04-21", "DF", "Aniversario de Brasilia", "", "provider_verified"],
  ["2027-04-23", "RJ", "Dia de Sao Jorge", "Lei nº 5.198/2008", "provider_law"],
  ["2027-06-15", "AC", "Aniversario do Acre", "Lei estadual nº 14/1964", "provider_law"],
  ["2027-06-18", "RO", "Dia do evangelico", "Lei estadual nº 1.026/2001", "provider_law"],
  ["2027-06-24", "AL", "Sao Joao", "Lei estadual nº 5.508/1993", "provider_law"],
  ["2027-06-24", "PE", "Festa de Sao Joao", "", "provider_verified"],
  ["2027-06-29", "AL", "Sao Pedro", "Lei estadual nº 5.509/1993", "provider_law"],
  ["2027-07-02", "BA", "Independencia da Bahia", "Art. 6º, § 3º da Constituicao estadual", "provider_law"],
  ["2027-07-08", "SE", "Emancipacao politica de Sergipe", "Art. 269 da Constituicao estadual", "provider_law"],
  ["2027-07-09", "SP", "Revolucao Constitucionalista", "Lei estadual nº 9.497/1997", "provider_law"],
  ["2027-07-26", "GO", "Fundacao da cidade de Goias", "Lei estadual nº 20.756/2020", "provider_law"],
  ["2027-07-28", "MA", "Adesao do Maranhao a independencia do Brasil", "Lei estadual nº 2.457/1964", "provider_law"],
  ["2027-08-05", "PB", "Fundacao do Estado", "Lei estadual nº 3.489/1967", "provider_law"],
  ["2027-08-07", "RN", "Dia do Rio Grande do Norte", "Lei Estadual nº 7.831, de 30 de maio de 2000", "provider_law"],
  ["2027-08-15", "CE", "Dia de Nossa Senhora da Assuncao", "Lei federal nº 9.093/1995", "provider_law"],
  ["2027-08-15", "PA", "Adesao do Para a independencia do Brasil", "Lei estadual nº 5.999/1996", "provider_law"],
  ["2027-09-05", "AC", "Dia da Amazonia", "Lei estadual nº 1.526/2004", "provider_law"],
  ["2027-09-05", "AM", "Elevacao do Amazonas a categoria de provincia", "Lei estadual nº 25/1977", "provider_law"],
  ["2027-09-08", "TO", "Padroeira do Estado", "Lei estadual nº 627/1993", "provider_law"],
  ["2027-09-13", "AP", "Criacao do Territorio Federal", "Art. 355 da Constituicao estadual", "provider_law"],
  ["2027-09-16", "AL", "Emancipacao politica", "Decreto Nº 68782 de 30 de dezembro de 2019", "provider_law"],
  ["2027-09-20", "RS", "Dia do Gaucho", "Art. 6, paragrafo unico da constituicao estadual", "provider_law"],
  ["2027-10-03", "RN", "Martires de Cunhau e Uruacu", "Lei estadual nº 8.913/2006", "provider_law"],
  ["2027-10-05", "RR", "Criacao do estado", "Art. 9 da Constituicao estadual", "provider_law"],
  ["2027-10-05", "TO", "Criacao do estado", "Lei estadual nº 98/1989", "provider_law"],
  ["2027-10-11", "MS", "Criacao do estado", "Lei estadual nº 10/1979", "provider_law"],
  ["2027-10-19", "PI", "Dia do Piaui", "Lei estadual nº 176/1937", "provider_law"],
  ["2027-10-24", "GO", "Pedra fundamental de Goiania", "Lei estadual nº 20.756/2020", "provider_law"],
  ["2027-11-17", "AC", "Assinatura do Tratado de Petropolis", "Lei estadual nº 57/1965", "provider_law"],
  ["2027-11-20", "AL", "Morte de Zumbi dos Palmares", "Lei estadual nº 5.724/1995", "provider_law"],
  ["2027-11-20", "AP", "Morte de Zumbi dos Palmares", "Lei estadual nº 667, de 16 de abril de 2002", "provider_law"],
  ["2027-11-30", "DF", "Dia do Evangelico", "Lei distrital nº 963/1995", "provider_law"],
  ["2027-12-08", "AM", "Nossa Senhora da Conceicao", "", "provider_verified"],
];

const DEFAULT_MUNICIPAL_HOLIDAY_ROWS = [
  [
    "2026-06-04",
    "SP",
    "Rio Claro",
    "3543907",
    "Corpus Christi",
    "Lei Municipal nº 1.158/1970, com redacao da Lei Municipal nº 3.797/2007",
    "municipal_law",
    "Feriado religioso municipal confirmado por legislacao local e por comunicacao operacional da prefeitura.",
  ],
  [
    "2026-06-24",
    "SP",
    "Rio Claro",
    "3543907",
    "Aniversario de Rio Claro",
    "Lei Municipal nº 1.158/1970, com redacao da Lei Municipal nº 3.797/2007",
    "municipal_law",
    "Data municipal mantida no sistema com suporte do cadastro oficial do municipio no IBGE e rotina anual da prefeitura.",
  ],
  [
    "2027-05-27",
    "SP",
    "Rio Claro",
    "3543907",
    "Corpus Christi",
    "Lei Municipal nº 1.158/1970, com redacao da Lei Municipal nº 3.797/2007",
    "municipal_law",
    "Feriado religioso municipal confirmado por legislacao local; data movel salva no sistema.",
  ],
  [
    "2027-06-24",
    "SP",
    "Rio Claro",
    "3543907",
    "Aniversario de Rio Claro",
    "Lei Municipal nº 1.158/1970, com redacao da Lei Municipal nº 3.797/2007",
    "municipal_law",
    "Data municipal mantida no sistema com suporte do cadastro oficial do municipio no IBGE e rotina anual da prefeitura.",
  ],
];

const DEFAULT_DOCUMENT_TEMPLATES = [
  {
    title: "Zeladoria urbana",
    type: "Oficio",
    topic: "Zeladoria",
    variant_name: "Objetivo",
    recommended_department: "Secretaria de Servicos Publicos / Zeladoria",
    target_authority: "Secretario(a) de Servicos Publicos",
    via_strategy:
      "Enviar direto para Servicos Publicos. Se houver historico sem resposta, copiar Gabinete do Prefeito.",
    use_case: "Limpeza, capinacao, retirada de entulho, cata-bagulho e manutencao rotineira.",
    subject_template: "Solicitacao de zeladoria em {{bairro}}",
    body_template: textBlock(
      "Encaminhamos o pedido apresentado por {{reclamante_nome}}, referente a {{demanda_titulo}}.",
      "O ponto informado fica em {{endereco_completo}}.",
      "Segundo o relato recebido pelo gabinete, {{descricao_demanda}}.",
      "Solicitamos vistoria e a adocao das providencias cabiveis, com retorno sobre o cronograma de execucao.",
    ),
    summary_template: "Solicitacao de limpeza e manutencao urbana.",
    tags: "zeladoria,limpeza,mato,entulho,capinacao",
  },
  {
    title: "Zeladoria urbana",
    type: "Oficio",
    topic: "Zeladoria",
    variant_name: "Comunitario",
    recommended_department: "Secretaria de Servicos Publicos / Zeladoria",
    target_authority: "Secretario(a) de Servicos Publicos",
    via_strategy:
      "Priorizar secretaria de servicos publicos e registrar queixa recorrente de moradores.",
    use_case: "Versao com tom mais comunitario para pedidos de bairro ou areas publicas.",
    subject_template: "Pedido de melhoria de zeladoria para {{bairro}}",
    body_template: textBlock(
      "Chegou ao gabinete a solicitacao de moradores de {{bairro}} acerca de {{demanda_titulo}}.",
      "O local mencionado e {{endereco_completo}}, onde foi relatado que {{descricao_demanda}}.",
      "Diante do impacto direto na rotina da comunidade, pedimos atencao da equipe tecnica para avaliacao e execucao dos servicos necessarios.",
      "Solicitamos, ainda, retorno formal para que possamos posicionar os moradores sobre o atendimento.",
    ),
    summary_template: "Pedido comunitario de zeladoria e manutencao.",
    tags: "zeladoria,bairro,comunidade,moradores",
  },
  {
    title: "Iluminacao publica",
    type: "Oficio",
    topic: "Iluminacao publica",
    variant_name: "Padrao",
    recommended_department: "Secretaria de Servicos Publicos / Iluminacao Publica",
    target_authority: "Secretario(a) de Servicos Publicos",
    via_strategy:
      "Encaminhar para iluminacao publica. Se houver concessionaria, citar o contrato de manutencao.",
    use_case: "Lampada apagada, ponto escuro, troca por LED ou manutencao de poste.",
    subject_template: "Solicitacao de manutencao de iluminacao em {{bairro}}",
    body_template: textBlock(
      "Encaminhamos solicitacao relacionada a {{demanda_titulo}}, registrada por {{reclamante_nome}}.",
      "O problema foi apontado em {{endereco_completo}}, no bairro {{bairro}}.",
      "Conforme o atendimento do gabinete, {{descricao_demanda}}.",
      "Solicitamos vistoria e providencias para restabelecimento da iluminacao ou melhoria do ponto indicado.",
    ),
    summary_template: "Pedido de manutencao de iluminacao publica.",
    tags: "iluminacao,poste,led,ponto escuro",
  },
  {
    title: "Iluminacao publica",
    type: "Requerimento",
    topic: "Iluminacao publica",
    variant_name: "Seguranca",
    recommended_department: "Secretaria de Servicos Publicos / Iluminacao Publica",
    target_authority: "Secretario(a) de Servicos Publicos",
    via_strategy:
      "Usar quando for necessario cobrar informacoes e prazo, com enfase em seguranca publica.",
    use_case: "Ponto escuro com relato de inseguranca, acidentes ou fluxo noturno intenso.",
    subject_template: "Informacoes sobre iluminacao e seguranca em {{bairro}}",
    body_template: textBlock(
      "Requeremos informacoes e providencias sobre {{demanda_titulo}}, no endereco {{endereco_completo}}.",
      "O pedido chegou ao gabinete por meio de {{reclamante_nome}}, com relato de que {{descricao_demanda}}.",
      "Considerando o impacto na seguranca de pedestres e moradores, solicitamos esclarecimento sobre o prazo de atendimento e as medidas previstas.",
    ),
    summary_template: "Pedido de informacoes e providencias sobre iluminacao publica.",
    tags: "iluminacao,seguranca,requerimento,prazo",
  },
  {
    title: "Poda de arvore",
    type: "Oficio",
    topic: "Poda de arvore",
    variant_name: "Risco imediato",
    recommended_department: "Secretaria de Meio Ambiente / Servicos Publicos",
    target_authority: "Secretario(a) de Meio Ambiente",
    via_strategy:
      "Encaminhar para Meio Ambiente e, se houver risco, copiar Defesa Civil.",
    use_case: "Galhos sobre a via, risco de queda, obstrucao de calcada ou fiação.",
    subject_template: "Solicitacao urgente de vistoria arborea em {{bairro}}",
    body_template: textBlock(
      "Encaminhamos pedido de vistoria e poda referente a {{demanda_titulo}}.",
      "O caso foi registrado por {{reclamante_nome}} no endereco {{endereco_completo}}.",
      "Segundo o relato recebido, {{descricao_demanda}}.",
      "Considerando o potencial risco a pedestres, veiculos ou rede eletrica, solicitamos avaliacao tecnica com a maior brevidade possivel.",
    ),
    summary_template: "Pedido de vistoria e poda com indicacao de risco.",
    tags: "poda,arvore,risco,meio ambiente",
  },
  {
    title: "Tapa-buraco e recapeamento",
    type: "Indicacao",
    topic: "Tapa-buraco e recapeamento",
    variant_name: "Trecho viario",
    recommended_department: "Secretaria de Obras / Infraestrutura",
    target_authority: "Secretario(a) de Obras",
    via_strategy:
      "Usar para sugerir manutencao de via, tapa-buraco ou recapeamento de trecho.",
    use_case: "Buraco, desgaste da malha asfaltica, valeta e necessidade de reparo.",
    subject_template: "Indicacao de manutencao viaria em {{bairro}}",
    body_template: textBlock(
      "Indicamos a necessidade de providencias quanto a {{demanda_titulo}}.",
      "O trecho informado fica em {{endereco_completo}}, no bairro {{bairro}}.",
      "De acordo com o atendimento realizado pelo gabinete, {{descricao_demanda}}.",
      "Diante disso, solicitamos estudo tecnico e a execucao do servico cabivel para restaurar as condicoes da via.",
    ),
    summary_template: "Indicacao para reparo asfaltico ou manutencao viaria.",
    tags: "buraco,asfalto,recapeamento,obras,valeta",
  },
  {
    title: "Sinalizacao viaria",
    type: "Oficio",
    topic: "Mobilidade e transito",
    variant_name: "Pintura e placas",
    recommended_department: "Secretaria de Mobilidade Urbana / Transito",
    target_authority: "Secretario(a) de Mobilidade Urbana",
    via_strategy:
      "Modelo inspirado em intervencoes viarias reais de gabinete, com pedido de pintura e sinalizacao.",
    use_case: "Faixa, placa, pintura de solo, estudo viario e organizacao do trafego.",
    subject_template: "Solicitacao de sinalizacao viaria em {{bairro}}",
    body_template: textBlock(
      "Encaminhamos solicitacao de intervencao viaria referente a {{demanda_titulo}}.",
      "O local apontado e {{endereco_completo}}, com impacto direto no fluxo de moradores e condutores.",
      "Conforme relatado no atendimento, {{descricao_demanda}}.",
      "Solicitamos vistoria tecnica para avaliar demarcacao de solo, instalacao de placas e demais medidas necessarias para maior seguranca viaria.",
    ),
    summary_template: "Pedido de sinalizacao e estudo tecnico viario.",
    tags: "transito,sinalizacao,placa,faixa,mobilidade",
  },
  {
    title: "Ponto de onibus",
    type: "Requerimento",
    topic: "Mobilidade e transito",
    variant_name: "Abrigo e cobertura",
    recommended_department: "Secretaria de Mobilidade Urbana / Transporte",
    target_authority: "Secretario(a) de Mobilidade Urbana",
    via_strategy:
      "Aplicar quando o gabinete precisar cobrar estudo, instalacao ou retorno oficial sobre parada de onibus.",
    use_case: "Abrigo, cobertura, deslocamento de ponto ou melhoria para usuarios do transporte.",
    subject_template: "Requerimento sobre ponto de onibus em {{bairro}}",
    body_template: textBlock(
      "Requeremos informacoes e providencias acerca de {{demanda_titulo}}.",
      "A situacao foi apresentada por {{reclamante_nome}}, referente ao ponto localizado em {{endereco_completo}}.",
      "Segundo o relato, {{descricao_demanda}}.",
      "Solicitamos esclarecer a viabilidade tecnica do pedido, bem como informar eventual cronograma de atendimento.",
    ),
    summary_template: "Pedido de informacoes sobre estrutura de ponto de onibus.",
    tags: "onibus,abrigo,cobertura,transporte",
  },
  {
    title: "Agua e esgoto",
    type: "Oficio",
    topic: "Agua e esgoto",
    variant_name: "Autarquia",
    recommended_department: "Autarquia de Agua e Esgoto / SAAE / DAAE",
    target_authority: "Superintendente da Autarquia",
    via_strategy:
      "Encaminhar para a autarquia de saneamento. Se houver reflexo viario, copiar Obras.",
    use_case: "Falta d'agua, vazamento, esgoto, drenagem ou pedido tecnico de saneamento.",
    subject_template: "Solicitacao de providencias sobre agua e esgoto em {{bairro}}",
    body_template: textBlock(
      "Encaminhamos pedido relacionado a {{demanda_titulo}}, registrado por {{reclamante_nome}}.",
      "O local indicado e {{endereco_completo}}.",
      "No atendimento realizado pelo gabinete, foi informado que {{descricao_demanda}}.",
      "Solicitamos vistoria tecnica e retorno sobre as providencias cabiveis no ambito do saneamento.",
    ),
    summary_template: "Solicitacao de providencias junto a autarquia de agua e esgoto.",
    tags: "agua,esgoto,daae,saae,saneamento",
  },
  {
    title: "Saude",
    type: "Requerimento",
    topic: "Saude",
    variant_name: "Informacoes e atendimento",
    recommended_department: "Secretaria / Fundacao Municipal de Saude",
    target_authority: "Secretario(a) de Saude",
    via_strategy:
      "Usar quando o gabinete precisar cobrar informacoes formais ou prazo de atendimento em saude.",
    use_case: "Fila, exame, especialidade, UBS, UPA, medicamento e fluxo assistencial.",
    subject_template: "Requerimento sobre pedido de saude de {{bairro}}",
    body_template: textBlock(
      "Requeremos informacoes e providencias acerca de {{demanda_titulo}}.",
      "O pedido foi apresentado por {{reclamante_nome}}, vinculado ao endereco {{endereco_completo}}.",
      "Segundo o atendimento realizado, {{descricao_demanda}}.",
      "Solicitamos informar as medidas ja adotadas, a unidade responsavel e o prazo estimado para retorno ao usuario.",
    ),
    summary_template: "Pedido de informacoes e providencias na area da saude.",
    tags: "saude,ubs,upa,medicamento,exame",
  },
  {
    title: "Assistencia social",
    type: "Oficio",
    topic: "Assistencia social",
    variant_name: "Encaminhamento humanizado",
    recommended_department: "Secretaria de Desenvolvimento Social / Assistencia Social",
    target_authority: "Secretario(a) de Desenvolvimento Social",
    via_strategy:
      "Encaminhar para Desenvolvimento Social, CRAS, CREAS ou Fundo Social conforme a situacao.",
    use_case: "Familias em vulnerabilidade, beneficios eventuais, acolhimento e orientacao social.",
    subject_template: "Encaminhamento social referente a {{demanda_titulo}}",
    body_template: textBlock(
      "Encaminhamos o pedido social apresentado por {{reclamante_nome}}.",
      "O atendimento do gabinete registrou a seguinte situacao: {{descricao_demanda}}.",
      "A referencia territorial informada e {{endereco_completo}}.",
      "Solicitamos avaliacao da rede socioassistencial competente e orientacao sobre o fluxo de atendimento cabivel.",
    ),
    summary_template: "Encaminhamento para avaliacao socioassistencial.",
    tags: "assistencia social,cras,creas,vulnerabilidade",
  },
  {
    title: "Mocao",
    type: "Mocao",
    topic: "Homenagens e reconhecimento",
    variant_name: "Congratulacao",
    recommended_department: "Camara Municipal",
    target_authority: "Presidencia da Camara",
    via_strategy:
      "Modelo para registrar reconhecimento publico a pessoa, entidade, igreja, escola ou projeto social.",
    use_case: "Mocao de aplausos, congratulacao ou reconhecimento institucional.",
    subject_template: "Mocao de congratulacao a {{reclamante_nome}}",
    body_template: textBlock(
      "Apresentamos a presente mocao para registrar publicamente o reconhecimento do gabinete a {{reclamante_nome}}.",
      "A homenagem se justifica em razao de {{descricao_demanda}}.",
      "Diante da relevancia social da atuacao descrita, propomos que a Camara Municipal registre votos de congratulacao.",
    ),
    summary_template: "Mocao de congratulacao e reconhecimento publico.",
    tags: "mocao,homenagem,congratulacao",
  },
  {
    title: "Titulo honorifico",
    type: "Projeto de Lei",
    topic: "Homenagens e reconhecimento",
    variant_name: "Autorizacao de homenagem",
    recommended_department: "Camara Municipal",
    target_authority: "Mesa Diretora / Presidencia",
    via_strategy:
      "Usar como base para projetos de decreto legislativo ou autorizacoes ligadas a homenagem.",
    use_case: "Autorizacao de homenageado e coleta de dados para titulo honorifico.",
    subject_template: "Autorizacao para homenagem de {{reclamante_nome}}",
    body_template: textBlock(
      "Declaro, para os fins cabiveis, que autorizo a utilizacao de meus dados para instrucao da homenagem vinculada a {{demanda_titulo}}.",
      "Dados do homenageado: nome {{reclamante_nome}}, documento {{cpf_rg_cns}}, telefone {{telefone_referencia}}.",
      "Fica registrado que a homenagem decorre de {{descricao_demanda}}.",
    ),
    summary_template: "Autorizacao para instrucao de homenagem ou titulo honorifico.",
    tags: "titulo,homenagem,decreto legislativo,autorizacao",
  },
  {
    title: "Emenda modificativa",
    type: "Emenda",
    topic: "Processo legislativo",
    variant_name: "Substituicao de artigo",
    recommended_department: "Camara Municipal",
    target_authority: "Mesa Diretora / Comissao",
    via_strategy:
      "Modelo base para alterar redacao de artigo, inciso ou paragrafo em projeto em tramitacao.",
    use_case: "Emenda modificativa com redacao substitutiva.",
    subject_template: "Emenda modificativa ao projeto {{demanda_titulo}}",
    body_template: textBlock(
      "Apresentamos emenda modificativa ao projeto {{demanda_titulo}}.",
      "Fica proposta a seguinte redacao substitutiva: {{descricao_demanda}}.",
      "A presente alteracao busca aperfeicoar o texto legal e adequa-lo ao interesse publico, conforme justificativa a ser anexada.",
    ),
    summary_template: "Emenda modificativa com redacao substitutiva.",
    tags: "emenda,projeto de lei,legislativo,redacao",
  },
  {
    title: "Projeto de lei",
    type: "Projeto de Lei",
    topic: "Processo legislativo",
    variant_name: "Denominacao de espaco publico",
    recommended_department: "Camara Municipal",
    target_authority: "Mesa Diretora / Presidencia",
    via_strategy:
      "Usar como base para projetos de denominacao de ruas, pracas ou equipamentos publicos.",
    use_case: "Nomeacao de praca, rua, centro comunitario ou outro bem publico.",
    subject_template: "Projeto de lei sobre denominacao de espaco publico",
    body_template: textBlock(
      "Fica denominado {{demanda_titulo}} o espaco publico localizado em {{endereco_completo}}.",
      "A homenagem e justificada por {{descricao_demanda}}.",
      "Este projeto segue para instrucao com biografia, documentos de apoio e demais anexos necessarios.",
    ),
    summary_template: "Projeto de lei para denominacao de espaco publico.",
    tags: "projeto de lei,denominacao,homenagem,logradouro",
  },
  {
    title: "Representacao em evento",
    type: "Representacao",
    topic: "Agenda institucional",
    variant_name: "Designacao de assessor",
    recommended_department: "Gabinete Parlamentar",
    target_authority: "Organizacao do evento",
    via_strategy:
      "Modelo para confirmar presenca, justificar ausencia ou indicar representante do gabinete.",
    use_case: "Eventos institucionais, cerimonias, cultos, encontros e inauguracoes.",
    subject_template: "Representacao do gabinete em compromisso institucional",
    body_template: textBlock(
      "Comunicamos que o gabinete sera representado por {{responsavel_gabinete}} no compromisso relacionado a {{demanda_titulo}}.",
      "A representacao ocorre em razao de agenda simultanea do parlamentar, mantendo-se o apreco institucional pelo convite recebido.",
      "Solicitamos o registro da representacao e permanecemos a disposicao para futuras interlocucoes.",
    ),
    summary_template: "Representacao institucional do gabinete em evento.",
    tags: "representacao,evento,agenda,assessoria",
  },
  {
    title: "Requisicao de veiculo",
    type: "Requisicao Administrativa",
    topic: "Administrativo",
    variant_name: "Agenda externa",
    recommended_department: "Setor Administrativo / Frota",
    target_authority: "Departamento Administrativo",
    via_strategy:
      "Usar para agendas externas, viagens oficiais, reunioes e cursos com deslocamento institucional.",
    use_case: "Requisicao de veiculo oficial ou apoio logistico.",
    subject_template: "Requisicao de veiculo para agenda oficial",
    body_template: textBlock(
      "Solicita-se a disponibilizacao de veiculo oficial para atendimento da agenda vinculada a {{demanda_titulo}}.",
      "Destino previsto: {{endereco_completo}}.",
      "Justificativa: {{descricao_demanda}}.",
      "Responsavel pela atividade: {{responsavel_gabinete}}.",
    ),
    summary_template: "Requisicao administrativa de veiculo para agenda externa.",
    tags: "veiculo,administrativo,agenda,deslocamento",
  },
  {
    title: "Relatorio de viagem",
    type: "Relatorio de Viagem",
    topic: "Administrativo",
    variant_name: "Prestacao de contas",
    recommended_department: "Gabinete Parlamentar / Administrativo",
    target_authority: "Controle interno do gabinete",
    via_strategy:
      "Modelo para registrar agenda, resultados e encaminhamentos apos deslocamento oficial.",
    use_case: "Prestacao de contas de viagem institucional, curso ou reuniao externa.",
    subject_template: "Relatorio de viagem referente a {{demanda_titulo}}",
    body_template: textBlock(
      "Relata-se a agenda institucional realizada em funcao de {{demanda_titulo}}.",
      "Local da atividade: {{endereco_completo}}.",
      "Resumo da agenda: {{descricao_demanda}}.",
      "Encaminhamentos posteriores: {{proxima_acao_documento}}.",
    ),
    summary_template: "Relatorio de viagem e resultados da agenda institucional.",
    tags: "relatorio de viagem,prestacao de contas,agenda",
  },
];

const ROLE_LABELS = {
  super_admin: "Administrador Geral",
  gabinete_admin: "Administrador do Gabinete",
  advisor: "Assessor / Atendente",
  viewer: "Visualizador",
};

export function initDatabase() {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(schemaSql);
  ensureColumn(db, "users", "username", "TEXT");
  ensureColumn(db, "users", "last_login_at", "TEXT");
  ensureColumn(db, "users", "last_login_ip", "TEXT");
  ensureColumn(db, "users", "last_login_provider", "TEXT");
  ensureColumn(db, "users", "ui_theme_mode", "TEXT NOT NULL DEFAULT 'light'");
  ensureColumn(db, "users", "ui_theme_palette", "TEXT NOT NULL DEFAULT 'azul'");
  ensureColumn(db, "users", "ui_sidebar_collapsed", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "users", "workspace_module_preferences", "TEXT");
  ensureColumn(db, "gabinetes", "city_ibge", "TEXT");
  ensureColumn(db, "gabinetes", "zip_code", "TEXT");
  ensureColumn(db, "gabinetes", "address", "TEXT");
  ensureColumn(db, "gabinetes", "address_number", "TEXT");
  ensureColumn(db, "gabinetes", "address_complement", "TEXT");
  ensureColumn(db, "gabinetes", "neighborhood", "TEXT");
  ensureColumn(db, "gabinetes", "public_slug", "TEXT");
  ensureColumn(db, "gabinetes", "public_self_register_intro", "TEXT");
  ensureColumn(db, "gabinetes", "public_self_register_config", "TEXT");
  ensureColumn(db, "gabinetes", "workspace_module_config", "TEXT");
  ensureColumn(db, "gabinetes", "ui_theme_mode", "TEXT NOT NULL DEFAULT 'light'");
  ensureColumn(db, "gabinetes", "ui_theme_palette", "TEXT NOT NULL DEFAULT 'azul'");
  ensureColumn(db, "gabinetes", "email_sender_name", "TEXT");
  ensureColumn(db, "gabinetes", "email_sender_address", "TEXT");
  ensureColumn(db, "gabinetes", "email_reply_to", "TEXT");
  ensureColumn(db, "gabinetes", "email_smtp_host", "TEXT");
  ensureColumn(db, "gabinetes", "email_smtp_port", "INTEGER");
  ensureColumn(db, "gabinetes", "email_smtp_security", "TEXT NOT NULL DEFAULT 'ssl_tls'");
  ensureColumn(db, "gabinetes", "email_smtp_username", "TEXT");
  ensureColumn(db, "gabinetes", "email_smtp_password", "TEXT");
  ensureColumn(db, "gabinetes", "email_smtp_verified_at", "TEXT");
  ensureColumn(db, "gabinetes", "whatsapp_provider", "TEXT NOT NULL DEFAULT 'evolution'");
  ensureColumn(db, "gabinetes", "whatsapp_instance_name", "TEXT");
  ensureColumn(db, "gabinetes", "whatsapp_instance_token", "TEXT");
  ensureColumn(db, "whatsapp_messages", "remote_name", "TEXT");
  ensureColumn(db, "whatsapp_messages", "message_type", "TEXT NOT NULL DEFAULT 'text'");
  ensureColumn(db, "whatsapp_messages", "attachment_url", "TEXT");
  ensureColumn(db, "whatsapp_messages", "mime_type", "TEXT");
  ensureColumn(db, "whatsapp_threads", "remote_name", "TEXT");
  ensureColumn(db, "whatsapp_threads", "last_message_text", "TEXT");
  ensureColumn(db, "whatsapp_threads", "unread_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "gabinetes", "default_follow_up_days", "INTEGER NOT NULL DEFAULT 3");
  ensureColumn(db, "gabinetes", "default_document_due_days", "INTEGER NOT NULL DEFAULT 30");
  ensureColumn(db, "gabinetes", "default_birthday_notice_days", "INTEGER NOT NULL DEFAULT 7");
  ensureColumn(db, "gabinetes", "default_area_code", "TEXT");
  ensureColumn(db, "gabinetes", "team_label", "TEXT NOT NULL DEFAULT 'Meu time'");
  ensureColumn(db, "gabinetes", "storage_provider", "TEXT NOT NULL DEFAULT 'local'");
  ensureColumn(db, "gabinetes", "storage_plan_label", "TEXT NOT NULL DEFAULT 'Básico'");
  ensureColumn(db, "gabinetes", "storage_quota_bytes", "INTEGER NOT NULL DEFAULT 1073741824");
  ensureColumn(db, "gabinetes", "storage_webdav_enabled", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "gabinetes", "storage_webdav_url", "TEXT");
  ensureColumn(db, "gabinetes", "storage_webdav_username", "TEXT");
  ensureColumn(db, "gabinetes", "storage_webdav_password_env", "TEXT");
  ensureColumn(db, "gabinetes", "storage_webdav_public_url", "TEXT");
  ensureColumn(db, "gabinetes", "storage_webdav_root_label", "TEXT");
  ensureColumn(db, "contacts", "nickname", "TEXT");
  ensureColumn(db, "contacts", "contact_type", "TEXT NOT NULL DEFAULT 'person'");
  ensureColumn(db, "contacts", "register_kind", "TEXT NOT NULL DEFAULT 'person'");
  ensureColumn(db, "contacts", "segment", "TEXT NOT NULL DEFAULT 'municipe'");
  ensureColumn(db, "contacts", "gender", "TEXT");
  ensureColumn(db, "contacts", "is_leader", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "contacts", "is_authority", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "contacts", "birth_month", "INTEGER");
  ensureColumn(db, "contacts", "birth_day", "INTEGER");
  ensureColumn(db, "contacts", "birth_year", "INTEGER");
  ensureColumn(db, "contacts", "birth_date_precision", "TEXT");
  ensureColumn(db, "contacts", "photo_url", "TEXT");
  ensureColumn(db, "contacts", "referred_by", "TEXT");
  ensureColumn(db, "contacts", "company_legal_name", "TEXT");
  ensureColumn(db, "contacts", "foundation_date", "TEXT");
  ensureColumn(db, "contacts", "employee_count", "INTEGER");
  ensureColumn(db, "contacts", "has_pet", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "contacts", "social_instagram", "TEXT");
  ensureColumn(db, "contacts", "social_facebook", "TEXT");
  ensureColumn(db, "contacts", "social_x", "TEXT");
  ensureColumn(db, "contacts", "social_youtube", "TEXT");
  ensureColumn(db, "contacts", "geo_lat", "TEXT");
  ensureColumn(db, "contacts", "geo_lng", "TEXT");
  ensureColumn(db, "contacts", "deleted_at", "TEXT");
  ensureColumn(db, "contacts", "deleted_by", "INTEGER");
  ensureColumn(db, "contacts", "delete_reason", "TEXT");
  ensureColumn(db, "contacts", "purge_after", "TEXT");
  ensureColumn(db, "contacts", "import_id", "INTEGER");
  ensureColumn(db, "contact_merge_suggestions", "updated_at", "TEXT");
  ensureColumn(db, "contact_merge_suggestions", "match_score", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "contact_merge_suggestions", "confidence", "TEXT NOT NULL DEFAULT 'medium'");
  ensureColumn(db, "contact_merge_suggestions", "reasons_json", "TEXT");
  ensureColumn(db, "tickets", "import_id", "INTEGER");
  ensureColumn(db, "tickets", "dependency_note", "TEXT");
  ensureColumn(db, "tickets", "follow_up_days", "INTEGER NOT NULL DEFAULT 3");
  ensureColumn(db, "tickets", "closure_confirmed", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "tickets", "support_link", "TEXT");
  ensureColumn(db, "tickets", "geo_lat", "TEXT");
  ensureColumn(db, "tickets", "geo_lng", "TEXT");
  ensureColumn(db, "tickets", "public_tracking_enabled", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "tickets", "public_tracking_code", "TEXT");
  ensureColumn(db, "tickets", "public_tracking_secret_hash", "TEXT");
  ensureColumn(db, "tickets", "public_tracking_secret_hint", "TEXT");
  ensureColumn(db, "tickets", "public_status", "TEXT");
  ensureColumn(db, "tickets", "public_last_update_at", "TEXT");
  ensureColumn(db, "tickets", "public_created_at", "TEXT");
  ensureColumn(db, "tickets", "public_updated_at", "TEXT");
  ensureColumn(db, "tickets", "public_tracking_link_generation_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "tickets", "public_tracking_secret_generation_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "tickets", "public_tracking_failed_attempts", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "tickets", "deleted_at", "TEXT");
  ensureColumn(db, "tickets", "deleted_by", "INTEGER");
  ensureColumn(db, "tickets", "delete_reason", "TEXT");
  ensureColumn(db, "tickets", "purge_after", "TEXT");
  ensureColumn(db, "ticket_history", "import_id", "INTEGER");
  ensureColumn(db, "ticket_history", "deleted_at", "TEXT");
  ensureColumn(db, "ticket_history", "deleted_by", "INTEGER");
  ensureColumn(db, "ticket_history", "delete_reason", "TEXT");
  ensureColumn(db, "ticket_history", "purge_after", "TEXT");
  ensureColumn(db, "ticket_history", "public_visible", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "ticket_history", "public_visible_at", "TEXT");
  ensureColumn(db, "ticket_history", "public_visible_by", "INTEGER");
  ensureColumn(db, "ticket_public_updates", "deleted_at", "TEXT");
  ensureColumn(db, "ticket_public_updates", "deleted_by", "INTEGER");
  ensureColumn(db, "ticket_public_updates", "delete_reason", "TEXT");
  ensureColumn(db, "ticket_public_updates", "purge_after", "TEXT");
  ensureColumn(db, "ticket_public_updates", "source_type", "TEXT");
  ensureColumn(db, "ticket_public_updates", "source_id", "INTEGER");
  ensureColumn(db, "contact_files", "public_visible", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "contact_files", "public_visible_at", "TEXT");
  ensureColumn(db, "contact_files", "public_visible_by", "INTEGER");
  ensureColumn(db, "finance_entries", "recurrence_group_id", "TEXT");
  ensureColumn(db, "finance_entries", "recurrence_index", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "finance_entries", "recurrence_total", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "finance_entries", "payment_status", "TEXT NOT NULL DEFAULT 'Pago'");
  ensureColumn(db, "finance_entries", "counterparty", "TEXT");
  ensureColumn(db, "finance_entries", "receipt_file_url", "TEXT");
  ensureColumn(db, "finance_entries", "receipt_file_name", "TEXT");
  ensureColumn(db, "finance_entries", "receipt_file_type", "TEXT");
  ensureColumn(db, "finance_entries", "receipt_file_size", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "finance_entries", "public_share_enabled", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "finance_entries", "public_share_code", "TEXT");
  ensureColumn(db, "finance_entries", "public_share_secret_hash", "TEXT");
  ensureColumn(db, "finance_entries", "public_share_secret_hint", "TEXT");
  ensureColumn(db, "finance_entries", "public_share_created_at", "TEXT");
  ensureColumn(db, "finance_entries", "public_share_updated_at", "TEXT");
  ensureColumn(db, "finance_entries", "public_share_mode", "TEXT NOT NULL DEFAULT 'normal'");
  ensureColumn(db, "finance_entries", "public_share_view_seconds", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "finance_entries", "public_share_one_time", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "finance_entries", "public_share_expires_at", "TEXT");
  ensureColumn(db, "finance_entries", "public_share_opened_at", "TEXT");
  ensureColumn(db, "finance_entries", "public_share_consumed_at", "TEXT");
  ensureColumn(db, "finance_entries", "public_share_access_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "finance_entries", "public_share_link_generation_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "finance_entries", "public_share_secret_generation_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "finance_entries", "public_share_failed_attempts", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "finance_entries", "deleted_at", "TEXT");
  ensureColumn(db, "finance_entries", "deleted_by", "INTEGER");
  ensureColumn(db, "finance_entries", "delete_reason", "TEXT");
  ensureColumn(db, "finance_entries", "purge_after", "TEXT");
  db.exec(`
    UPDATE finance_entries
    SET counterparty = status
    WHERE COALESCE(counterparty, '') = ''
      AND COALESCE(status, '') <> ''
      AND status NOT IN ('Previsto', 'Pago', 'Cancelado', 'Registrado')
  `);
  db.exec(`
    UPDATE finance_entries
    SET payment_status = CASE
      WHEN status IN ('Previsto', 'Pago', 'Cancelado') THEN status
      WHEN COALESCE(payment_status, '') IN ('Previsto', 'Pago', 'Cancelado') THEN payment_status
      ELSE 'Pago'
    END
  `);
  db.exec(`
    UPDATE finance_entries
    SET status = payment_status
    WHERE status NOT IN ('Previsto', 'Pago', 'Cancelado')
  `);
  ensureColumn(db, "notes", "is_pinned", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "notes", "is_archived", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "notes", "color", "TEXT NOT NULL DEFAULT 'yellow'");
  ensureColumn(db, "notes", "tags", "TEXT");
  ensureColumn(db, "notes", "task_id", "INTEGER REFERENCES tasks(id) ON DELETE SET NULL");
  ensureColumn(db, "notes", "deleted_at", "TEXT");
  ensureColumn(db, "notes", "deleted_by", "INTEGER");
  ensureColumn(db, "notes", "delete_reason", "TEXT");
  ensureColumn(db, "notes", "purge_after", "TEXT");
  ensureColumn(db, "tasks", "note_id", "INTEGER REFERENCES notes(id) ON DELETE SET NULL");
  ensureColumn(db, "tasks", "tags", "TEXT");
  ensureColumn(db, "tasks", "deleted_at", "TEXT");
  ensureColumn(db, "tasks", "deleted_by", "INTEGER");
  ensureColumn(db, "tasks", "delete_reason", "TEXT");
  ensureColumn(db, "tasks", "purge_after", "TEXT");
  ensureColumn(db, "public_entity_shares", "link_generation_count", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "public_entity_shares", "secret_generation_count", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "public_entity_shares", "failed_access_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "documents", "template_id", "INTEGER");
  ensureColumn(db, "documents", "subject_line", "TEXT");
  ensureColumn(db, "documents", "addressed_to", "TEXT");
  ensureColumn(db, "documents", "routing_hint", "TEXT");
  ensureColumn(db, "documents", "generated_text", "TEXT");
  ensureColumn(db, "documents", "response_received_at", "TEXT");
  ensureColumn(db, "documents", "signature_profile_id", "INTEGER");
  ensureColumn(db, "documents", "deleted_at", "TEXT");
  ensureColumn(db, "documents", "deleted_by", "INTEGER");
  ensureColumn(db, "documents", "delete_reason", "TEXT");
  ensureColumn(db, "documents", "purge_after", "TEXT");
  ensureColumn(db, "projects", "source_connector_id", "INTEGER");
  ensureColumn(db, "projects", "source_provider", "TEXT");
  ensureColumn(db, "projects", "source_external_id", "TEXT");
  ensureColumn(db, "projects", "source_key", "TEXT");
  ensureColumn(db, "projects", "source_number", "TEXT");
  ensureColumn(db, "projects", "source_year", "TEXT");
  ensureColumn(db, "projects", "source_date", "TEXT");
  ensureColumn(db, "projects", "source_protocol", "TEXT");
  ensureColumn(db, "projects", "source_author", "TEXT");
  ensureColumn(db, "projects", "source_subject", "TEXT");
  ensureColumn(db, "projects", "source_status", "TEXT");
  ensureColumn(db, "projects", "source_stage", "TEXT");
  ensureColumn(db, "projects", "source_response", "TEXT");
  ensureColumn(db, "projects", "source_response_url", "TEXT");
  ensureColumn(db, "projects", "source_attachment_url", "TEXT");
  ensureColumn(db, "projects", "source_tracking", "TEXT");
  ensureColumn(db, "projects", "source_url", "TEXT");
  ensureColumn(db, "projects", "source_raw_json", "TEXT");
  ensureColumn(db, "projects", "generated_document_id", "INTEGER");
  ensureColumn(db, "projects", "source_detail_synced_at", "TEXT");
  ensureColumn(db, "projects", "last_synced_at", "TEXT");
  ensureColumn(db, "projects", "deleted_at", "TEXT");
  ensureColumn(db, "projects", "deleted_by", "INTEGER");
  ensureColumn(db, "projects", "delete_reason", "TEXT");
  ensureColumn(db, "projects", "purge_after", "TEXT");
  ensureColumn(db, "legislative_connectors", "deleted_at", "TEXT");
  ensureColumn(db, "legislative_connectors", "deleted_by", "INTEGER");
  ensureColumn(db, "legislative_connectors", "delete_reason", "TEXT");
  ensureColumn(db, "legislative_connectors", "purge_after", "TEXT");
  ensureColumn(db, "imports", "confirmed_at", "TEXT");
  ensureColumn(db, "imports", "undo_status", "TEXT NOT NULL DEFAULT 'not_available'");
  ensureColumn(db, "imports", "undo_reason", "TEXT");
  ensureColumn(db, "imports", "undone_at", "TEXT");
  ensureColumn(db, "imports", "undone_by", "INTEGER");
  ensureColumn(db, "imports", "undo_summary_json", "TEXT");
  ensureColumn(db, "call_logs", "ticket_id", "INTEGER REFERENCES tickets(id) ON DELETE SET NULL");
  ensureColumn(db, "call_logs", "deleted_at", "TEXT");
  ensureColumn(db, "call_logs", "deleted_by", "INTEGER");
  ensureColumn(db, "call_logs", "delete_reason", "TEXT");
  ensureColumn(db, "call_logs", "purge_after", "TEXT");
  ensureColumn(db, "ai_links", "kind", "TEXT NOT NULL DEFAULT 'principal'");
  ensureColumn(db, "ai_links", "category", "TEXT");
  ensureColumn(db, "ai_links", "visibility", "TEXT NOT NULL DEFAULT 'private'");
  ensureColumn(db, "ai_links", "is_builtin", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "ai_links", "sort_order", "INTEGER NOT NULL DEFAULT 999");
  ensureColumn(db, "ai_links", "moderation_status", "TEXT NOT NULL DEFAULT 'published'");
  ensureColumn(db, "ai_links", "moderation_reason", "TEXT");
  ensureColumn(db, "ai_links", "moderated_at", "TEXT");
  ensureColumn(db, "ai_links", "report_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "ai_links", "deleted_at", "TEXT");
  ensureColumn(db, "ai_links", "deleted_by", "INTEGER");
  ensureColumn(db, "ai_links", "delete_reason", "TEXT");
  ensureColumn(db, "ai_links", "purge_after", "TEXT");
  const trashRetentionTables = [
    "contacts",
    "tickets",
    "ticket_history",
    "ticket_public_updates",
    "finance_entries",
    "notes",
    "tasks",
    "documents",
    "projects",
    "legislative_connectors",
    "call_logs",
    "ai_links",
  ];
  trashRetentionTables.forEach((tableName) => {
    ensureColumn(db, tableName, "trash_hidden_at", "TEXT");
    ensureColumn(db, tableName, "trash_hidden_by", "INTEGER");
  });
  trashRetentionTables.forEach((tableName) => {
    db.prepare(
      `
        UPDATE ${tableName}
        SET purge_after = strftime('%Y-%m-%dT%H:%M:%fZ', deleted_at, '+365 days')
        WHERE COALESCE(deleted_at, '') <> ''
          AND (
            COALESCE(purge_after, '') = ''
            OR julianday(purge_after) < julianday(deleted_at, '+365 days')
          )
      `,
    ).run();
  });
  db.prepare("UPDATE ai_links SET visibility = 'builtin' WHERE is_builtin = 1 AND visibility != 'builtin'").run();
  db.prepare(
    `
      UPDATE contacts
      SET register_kind = CASE
        WHEN lower(contact_type) = 'company' AND is_authority = 1 THEN 'public_agency'
        WHEN is_leader = 1 THEN 'leadership'
        WHEN lower(contact_type) = 'company' THEN 'entity'
        ELSE 'person'
      END
      WHERE register_kind IS NULL OR register_kind = '' OR register_kind = 'person'
    `,
  ).run();
  db.exec("CREATE INDEX IF NOT EXISTS idx_contacts_segment ON contacts(gabinete_id, segment, contact_type);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_contacts_register_kind ON contacts(gabinete_id, register_kind, updated_at);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_contacts_trash ON contacts(gabinete_id, deleted_at, updated_at);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_contacts_import ON contacts(gabinete_id, import_id);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_contact_merge_suggestions_status ON contact_merge_suggestions(gabinete_id, status, created_at);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_contact_merge_suggestions_confidence ON contact_merge_suggestions(gabinete_id, status, confidence, match_score);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_tickets_status_dates ON tickets(gabinete_id, status, next_action_date, closed_at);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_tickets_trash ON tickets(gabinete_id, deleted_at, updated_at);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_tickets_import ON tickets(gabinete_id, import_id);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_ticket_history_import ON ticket_history(gabinete_id, import_id);");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_public_tracking_code ON tickets(public_tracking_code) WHERE public_tracking_code IS NOT NULL AND public_tracking_code <> '';");
  db.exec("CREATE INDEX IF NOT EXISTS idx_ticket_public_updates ON ticket_public_updates(gabinete_id, ticket_id, created_at);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_ticket_history_trash ON ticket_history(gabinete_id, deleted_at, created_at);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_ticket_public_updates_trash ON ticket_public_updates(gabinete_id, deleted_at, created_at);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_ticket_public_access_logs ON ticket_public_access_logs(gabinete_id, ticket_id, created_at);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_public_entity_shares_entity ON public_entity_shares(gabinete_id, entity_type, entity_id, enabled);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_public_entity_shares_code ON public_entity_shares(share_code, enabled);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_notes_lookup ON notes(gabinete_id, is_archived, is_pinned, updated_at);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_notes_links ON notes(gabinete_id, contact_id, ticket_id, document_id, project_id);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_notes_trash ON notes(gabinete_id, deleted_at, updated_at);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_projects_source ON projects(gabinete_id, source_provider, source_external_id);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_projects_source_key ON projects(gabinete_id, source_key);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_projects_trash ON projects(gabinete_id, deleted_at, updated_at);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_legislative_connectors ON legislative_connectors(gabinete_id, provider, active, updated_at);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_legislative_connectors_trash ON legislative_connectors(gabinete_id, deleted_at, updated_at);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_tasks_note ON tasks(gabinete_id, note_id);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_tasks_trash ON tasks(gabinete_id, deleted_at, updated_at);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_call_logs_phone ON call_logs(gabinete_id, phone, call_at);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_call_logs_ticket ON call_logs(gabinete_id, ticket_id, call_at);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_call_logs_trash ON call_logs(gabinete_id, deleted_at, updated_at);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_lookup ON whatsapp_messages(gabinete_id, created_at, remote_phone);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_provider_id ON whatsapp_messages(gabinete_id, instance_name, provider_message_id);");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_threads_phone ON whatsapp_threads(gabinete_id, remote_phone);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_email_messages_lookup ON email_messages(gabinete_id, created_at, remote_email);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_finance_entries_date ON finance_entries(gabinete_id, entry_date, entry_type);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_finance_entries_payment_status ON finance_entries(gabinete_id, payment_status, entry_date);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_finance_entries_recurrence ON finance_entries(gabinete_id, recurrence_group_id, recurrence_index);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_finance_entries_trash ON finance_entries(gabinete_id, deleted_at, updated_at);");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_entries_public_share_code ON finance_entries(public_share_code) WHERE public_share_code IS NOT NULL AND public_share_code <> '';");
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_password_reset_request_attempts_email_created ON password_reset_request_attempts(email, created_at);",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_password_reset_request_attempts_ip_created ON password_reset_request_attempts(ip_address, created_at);",
  );
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE username IS NOT NULL;");
  db.exec("CREATE INDEX IF NOT EXISTS idx_user_module_permissions_user ON user_module_permissions(gabinete_id, user_id);");
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_holidays_lookup ON holidays(kind, date, scope, uf, city_ibge, city_name);",
  );
  db.exec("CREATE INDEX IF NOT EXISTS idx_ai_links_shared_prompts ON ai_links(kind, visibility, moderation_status, active, sort_order);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_ai_links_trash ON ai_links(gabinete_id, deleted_at, updated_at);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_documents_trash ON documents(gabinete_id, deleted_at, updated_at);");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_prompt_ratings_user ON ai_prompt_ratings(ai_link_id, user_id);");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_prompt_reports_user ON ai_prompt_reports(ai_link_id, user_id);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_ai_prompt_reports_review ON ai_prompt_reports(status, created_at);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_import_contact_snapshots_import ON import_contact_snapshots(gabinete_id, import_id);");
  backfillDefaultAreaCodes(db);
  ensureOpenTicketStatusNaming(db);
  ensureSeed(db);
  ensureGabineteCityCodes(db);
  ensureSupplementalSeed(db);
  ensureHolidayCatalog(db);
  return db;
}

function buildHolidayDedupeKey(row) {
  return [
    row.scope || "",
    row.kind || "holiday",
    row.date || "",
    row.uf || "",
    row.city_ibge || "",
    row.city_name || "",
    row.name || "",
  ].join("|");
}

function backfillDefaultAreaCodes(db) {
  const gabinetes = db.prepare("SELECT id, phone, default_area_code FROM gabinetes").all();
  gabinetes.forEach((gabinete) => {
    if (String(gabinete.default_area_code || "").trim()) return;
    const areaCode = inferBrazilianAreaCode(gabinete.phone || "");
    if (!areaCode) return;
    db.prepare(
      "UPDATE gabinetes SET default_area_code = :default_area_code WHERE id = :id",
    ).run({
      id: gabinete.id,
      default_area_code: areaCode,
    });
  });
}

function ensureOpenTicketStatusNaming(db) {
  const timestamp = nowIso();
  const gabinetes = db.prepare("SELECT id FROM gabinetes").all();
  gabinetes.forEach((gabinete) => {
    const novoStatus = db
      .prepare("SELECT id FROM status_custom WHERE gabinete_id = :gabinete_id AND lower(name) = 'novo' LIMIT 1")
      .get({ gabinete_id: gabinete.id });
    const abertoStatus = db
      .prepare("SELECT id FROM status_custom WHERE gabinete_id = :gabinete_id AND lower(name) = 'aberto' LIMIT 1")
      .get({ gabinete_id: gabinete.id });

    if (novoStatus && !abertoStatus) {
      db.prepare(
        `
          UPDATE status_custom
          SET name = 'Aberto',
              updated_at = :updated_at
          WHERE gabinete_id = :gabinete_id AND id = :id
        `,
      ).run({
        gabinete_id: gabinete.id,
        id: novoStatus.id,
        updated_at: timestamp,
      });
    } else if (novoStatus && abertoStatus) {
      db.prepare(
        `
          UPDATE status_custom
          SET active = 0,
              updated_at = :updated_at
          WHERE gabinete_id = :gabinete_id AND id = :id
        `,
      ).run({
        gabinete_id: gabinete.id,
        id: novoStatus.id,
        updated_at: timestamp,
      });
    }

    db.prepare(
      `
        UPDATE tickets
        SET status = 'Aberto',
            updated_at = :updated_at
        WHERE gabinete_id = :gabinete_id
          AND lower(status) = 'novo'
      `,
    ).run({
      gabinete_id: gabinete.id,
      updated_at: timestamp,
    });
    db.prepare(
      `
        UPDATE ticket_history
        SET previous_status = CASE WHEN lower(previous_status) = 'novo' THEN 'Aberto' ELSE previous_status END,
            new_status = CASE WHEN lower(new_status) = 'novo' THEN 'Aberto' ELSE new_status END
        WHERE gabinete_id = :gabinete_id
          AND (lower(previous_status) = 'novo' OR lower(new_status) = 'novo')
      `,
    ).run({ gabinete_id: gabinete.id });
  });
}

function buildNationalHolidaySeedRows() {
  return DEFAULT_NATIONAL_HOLIDAY_ROWS.map(([date, name]) => {
    const isConscienciaNegra = name === "Dia Nacional de Zumbi e da Consciencia Negra";
    const isGoodFriday = name === "Sexta-feira Santa";
    const isOfficial2026 = date.startsWith("2026-");

    return {
      scope: "national",
      kind: "holiday",
      date,
      year: Number(date.slice(0, 4)),
      name,
      uf: "",
      city_name: "",
      city_ibge: "",
      legal_basis: isConscienciaNegra
        ? "Lei nº 14.759/2023"
        : isGoodFriday && isOfficial2026
          ? "Portaria MGI nº 11.460/2025"
          : "",
      source_name: isConscienciaNegra
        ? "Presidencia da Republica"
        : isOfficial2026
          ? "Ministerio da Gestao"
          : "Invertexto API",
      source_url: isConscienciaNegra
        ? HOLIDAY_CONSCIENCIA_NEGRA_SOURCE_URL
        : isOfficial2026
          ? HOLIDAY_MGI_2026_SOURCE_URL
          : HOLIDAY_PROVIDER_SOURCE_URL,
      validation_status: isConscienciaNegra || isOfficial2026 ? "official" : "provider_verified",
      notes:
        isGoodFriday && !isOfficial2026
          ? "Data movel mantida no sistema a partir de provedor externo validado."
          : "",
    };
  });
}

function buildStateHolidaySeedRows() {
  return DEFAULT_STATE_HOLIDAY_ROWS.map(([date, uf, name, legalBasis, validationStatus]) => ({
    scope: "state",
    kind: "holiday",
    date,
    year: Number(date.slice(0, 4)),
    name,
    uf,
    city_name: "",
    city_ibge: "",
    legal_basis: legalBasis,
    source_name: "Invertexto API",
    source_url: HOLIDAY_PROVIDER_SOURCE_URL,
    validation_status: validationStatus,
    notes: legalBasis
      ? "Catalogo estadual salvo no sistema com referencia de base legal do provedor."
      : "Catalogo estadual salvo no sistema com confirmacao do provedor.",
  }));
}

function buildMunicipalHolidaySeedRows() {
  return DEFAULT_MUNICIPAL_HOLIDAY_ROWS.map(
    ([date, uf, cityName, cityIbge, name, legalBasis, validationStatus, notes]) => ({
      scope: "municipal",
      kind: "holiday",
      date,
      year: Number(date.slice(0, 4)),
      name,
      uf,
      city_name: cityName,
      city_ibge: cityIbge,
      legal_basis: legalBasis,
      source_name: "Catalogo municipal curado",
      source_url: HOLIDAY_RIO_CLARO_LAW_SOURCE_URL,
      validation_status: validationStatus,
      notes,
    }),
  );
}

function buildHolidaySeedRows() {
  return [
    ...buildNationalHolidaySeedRows(),
    ...buildStateHolidaySeedRows(),
    ...buildMunicipalHolidaySeedRows(),
  ].map((row) => ({
    ...row,
    dedupe_key: buildHolidayDedupeKey(row),
  }));
}

function ensureHolidayCatalog(db) {
  const insert = db.prepare(
    `
      INSERT INTO holidays (
        scope, kind, date, year, name, uf, city_name, city_ibge, legal_basis,
        source_name, source_url, validation_status, notes, dedupe_key, created_at, updated_at
      ) VALUES (
        :scope, :kind, :date, :year, :name, :uf, :city_name, :city_ibge, :legal_basis,
        :source_name, :source_url, :validation_status, :notes, :dedupe_key, :created_at, :updated_at
      )
      ON CONFLICT(dedupe_key) DO UPDATE SET
        year = excluded.year,
        legal_basis = excluded.legal_basis,
        source_name = excluded.source_name,
        source_url = excluded.source_url,
        validation_status = excluded.validation_status,
        notes = excluded.notes,
        updated_at = excluded.updated_at
    `,
  );
  const now = nowIso();

  db.exec("BEGIN");
  try {
    buildHolidaySeedRows().forEach((row) => {
      insert.run({
        ...row,
        created_at: now,
        updated_at: now,
      });
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function ensureGabineteCityCodes(db) {
  db.prepare(
    `
      UPDATE gabinetes
      SET city_ibge = '3543907',
          updated_at = :updated_at
      WHERE uf = 'SP'
        AND lower(city) = lower('Rio Claro')
        AND (city_ibge IS NULL OR city_ibge = '')
    `,
  ).run({
    updated_at: nowIso(),
  });
}

function ensureSeed(db) {
  const userCount = db.prepare("SELECT COUNT(*) AS total FROM users").get().total;
  if (userCount > 0) {
    return;
  }

  const now = nowIso();

  db.exec("BEGIN");

  try {
    db.prepare(
      `
        INSERT INTO users (
          gabinete_id, username, name, email, phone, role, password_hash, status,
          must_change_password, created_at, updated_at
        ) VALUES (
          NULL, :username, :name, :email, :phone, :role, :password_hash, 'active',
          1, :created_at, :updated_at
        )
      `,
    ).run({
      username: "admin",
      name: "Administrador Geral",
      email: "admin@gabinete360.com",
      phone: normalizePhone("19999999999"),
      role: "super_admin",
      password_hash: BOOTSTRAP_ADMIN_PASSWORD_HASH,
      created_at: now,
      updated_at: now,
    });

    const gabineteId = createGabinete(db, {
      name: "Gabinete Modelo Rio Claro",
      type: "Vereador",
      parliamentarian_name: "Marina Carvalho",
      party: "Partido Social Municipal",
      city: "Rio Claro",
      city_ibge: "3543907",
      uf: "SP",
      responsible_name: "Leandro Martins",
      email: "contato@modelo.gabinete360.com",
      phone: "(19) 99888-0001",
      onboarding_completed: 1,
    });

    const gabineteAdminId = db.prepare(
      `
        INSERT INTO users (
          gabinete_id, username, name, email, phone, role, password_hash, status,
          must_change_password, created_at, updated_at
        ) VALUES (
          :gabinete_id, :username, :name, :email, :phone, :role, :password_hash, 'active',
          0, :created_at, :updated_at
        )
      `,
    ).run({
      gabinete_id: gabineteId,
      username: "leandro",
      name: "Leandro Martins",
      email: "leandro@modelo.gabinete360.com",
      phone: normalizePhone("(19) 99888-0001"),
      role: "gabinete_admin",
      password_hash: hashPassword("123321"),
      created_at: now,
      updated_at: now,
    }).lastInsertRowid;

    const advisorId = db.prepare(
      `
        INSERT INTO users (
          gabinete_id, username, name, email, phone, role, password_hash, status,
          must_change_password, created_at, updated_at
        ) VALUES (
          :gabinete_id, :username, :name, :email, :phone, :role, :password_hash, 'active',
          0, :created_at, :updated_at
        )
      `,
    ).run({
      gabinete_id: gabineteId,
      username: "paula",
      name: "Paula Teixeira",
      email: "paula@modelo.gabinete360.com",
      phone: normalizePhone("(19) 99911-2200"),
      role: "advisor",
      password_hash: hashPassword("123321"),
      created_at: now,
      updated_at: now,
    }).lastInsertRowid;

    createDemoData(db, gabineteId, Number(gabineteAdminId), Number(advisorId));
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function ensureSupplementalSeed(db) {
  const gabinetes = db.prepare("SELECT id, name FROM gabinetes").all();

  gabinetes.forEach((gabinete) => {
    ensureGabineteOperationalDefaults(db, gabinete.id);

    const documentsCount = db
      .prepare("SELECT COUNT(*) AS total FROM documents WHERE gabinete_id = :gabinete_id")
      .get({ gabinete_id: gabinete.id }).total;
    const projectsCount = db
      .prepare("SELECT COUNT(*) AS total FROM projects WHERE gabinete_id = :gabinete_id")
      .get({ gabinete_id: gabinete.id }).total;
    const tasksCount = db
      .prepare("SELECT COUNT(*) AS total FROM tasks WHERE gabinete_id = :gabinete_id")
      .get({ gabinete_id: gabinete.id }).total;

    if (documentsCount === 0 || projectsCount === 0 || tasksCount === 0) {
      seedOperationalDemoData(db, gabinete.id);
    }
  });
}

export function createGabinete(db, payload) {
  const now = nowIso();
  const slugBase = slugify(payload.name);
  let slug = slugBase;
  let suffix = 2;

  while (
    db.prepare("SELECT id FROM gabinetes WHERE lower(slug) = lower(:slug) OR lower(public_slug) = lower(:slug)").get({ slug })
  ) {
    slug = `${slugBase}-${suffix}`;
    suffix += 1;
  }

  const insertResult = db.prepare(
    `
      INSERT INTO gabinetes (
        slug, public_slug, name, type, parliamentarian_name, party, city, city_ibge, uf, responsible_name,
        phone, email, logo_url, default_area_code, status, onboarding_completed, created_at, updated_at
      ) VALUES (
        :slug, :public_slug, :name, :type, :parliamentarian_name, :party, :city, :city_ibge, :uf, :responsible_name,
        :phone, :email, :logo_url, :default_area_code, :status, :onboarding_completed, :created_at, :updated_at
      )
    `,
  ).run({
    slug,
    public_slug: slug,
    name: payload.name,
    type: payload.type ?? "Outro",
    parliamentarian_name: payload.parliamentarian_name ?? "",
    party: payload.party ?? "",
    city: payload.city ?? "",
    city_ibge: payload.city_ibge ?? "",
    uf: payload.uf ?? "",
    responsible_name: payload.responsible_name ?? "",
    phone: normalizePhone(payload.phone ?? ""),
    email: payload.email ?? "",
    logo_url: payload.logo_url ?? "",
    default_area_code: inferBrazilianAreaCode(payload.default_area_code || payload.phone || ""),
    status: payload.status ?? "active",
    onboarding_completed: payload.onboarding_completed ? 1 : 0,
    created_at: now,
    updated_at: now,
  });

  const gabineteId = Number(insertResult.lastInsertRowid);
  seedGabineteDefaults(db, gabineteId);
  return gabineteId;
}

export function seedGabineteDefaults(db, gabineteId) {
  DEFAULT_STATUSES.forEach((status) => {
    db.prepare(
      `
        INSERT INTO status_custom (
          gabinete_id, name, color, sort_order, is_final, active, created_at, updated_at
        ) VALUES (
          :gabinete_id, :name, :color, :sort_order, :is_final, 1, :created_at, :updated_at
        )
      `,
    ).run({
      gabinete_id: gabineteId,
      name: status.name,
      color: status.color,
      sort_order: status.sort_order,
      is_final: status.is_final,
      created_at: nowIso(),
      updated_at: nowIso(),
    });
  });

  DEFAULT_CHANNELS.forEach((channel) => {
    db.prepare(
      `
        INSERT INTO channels (gabinete_id, name, active, created_at, updated_at)
        VALUES (:gabinete_id, :name, 1, :created_at, :updated_at)
      `,
    ).run({
      gabinete_id: gabineteId,
      name: channel,
      created_at: nowIso(),
      updated_at: nowIso(),
    });
  });

  DEFAULT_CATEGORIES.forEach((category) => {
    db.prepare(
      `
        INSERT INTO categories (gabinete_id, name, color, active, created_at, updated_at)
        VALUES (:gabinete_id, :name, :color, 1, :created_at, :updated_at)
      `,
    ).run({
      gabinete_id: gabineteId,
      name: category,
      color: categoryColor(category),
      created_at: nowIso(),
      updated_at: nowIso(),
    });
  });

  DEFAULT_WHATSAPP_TEMPLATES.forEach((template) => {
    db.prepare(
      `
        INSERT INTO whatsapp_templates (
          gabinete_id, title, body, kind, active, created_at, updated_at
        ) VALUES (
          :gabinete_id, :title, :body, :kind, 1, :created_at, :updated_at
        )
      `,
    ).run({
      gabinete_id: gabineteId,
      title: template.title,
      body: template.body,
      kind: template.kind,
      created_at: nowIso(),
        updated_at: nowIso(),
      });
  });

  ensureGabineteOperationalDefaults(db, gabineteId);
}

function ensureGabineteOperationalDefaults(db, gabineteId) {
  const gabinete = db
    .prepare(
      `
        SELECT id, name, type, parliamentarian_name, responsible_name, city, uf
        FROM gabinetes
        WHERE id = :id
      `,
    )
    .get({ id: gabineteId });

  if (!gabinete) return;

  const templatesCount = db
    .prepare("SELECT COUNT(*) AS total FROM document_templates WHERE gabinete_id = :gabinete_id")
    .get({ gabinete_id: gabineteId }).total;
  if (templatesCount === 0) {
    seedDocumentTemplates(db, gabineteId);
  }

  const signaturesCount = db
    .prepare("SELECT COUNT(*) AS total FROM signature_profiles WHERE gabinete_id = :gabinete_id")
    .get({ gabinete_id: gabineteId }).total;
  if (signaturesCount === 0) {
    seedSignatureProfiles(db, gabinete);
  }

  const aiLinksCount = db
    .prepare("SELECT COUNT(*) AS total FROM ai_links WHERE gabinete_id = :gabinete_id")
    .get({ gabinete_id: gabineteId }).total;
  if (aiLinksCount === 0) {
    seedAiLinks(db, gabineteId);
  }

  const routingCount = db
    .prepare("SELECT COUNT(*) AS total FROM routing_rules WHERE gabinete_id = :gabinete_id")
    .get({ gabinete_id: gabineteId }).total;
  if (routingCount === 0) {
    seedRoutingRules(db, gabineteId);
  }
}

function seedDocumentTemplates(db, gabineteId) {
  DEFAULT_DOCUMENT_TEMPLATES.forEach((template) => {
    db.prepare(
      `
        INSERT INTO document_templates (
          gabinete_id, title, type, topic, variant_name, recommended_department,
          target_authority, via_strategy, use_case, subject_template, body_template,
          summary_template, tags, is_builtin, active, created_at, updated_at
        ) VALUES (
          :gabinete_id, :title, :type, :topic, :variant_name, :recommended_department,
          :target_authority, :via_strategy, :use_case, :subject_template, :body_template,
          :summary_template, :tags, 1, 1, :created_at, :updated_at
        )
      `,
    ).run({
      gabinete_id: gabineteId,
      title: template.title,
      type: template.type,
      topic: template.topic,
      variant_name: template.variant_name,
      recommended_department: template.recommended_department,
      target_authority: template.target_authority,
      via_strategy: template.via_strategy,
      use_case: template.use_case,
      subject_template: template.subject_template,
      body_template: template.body_template,
      summary_template: template.summary_template,
      tags: template.tags,
      created_at: nowIso(),
      updated_at: nowIso(),
    });
  });
}

function seedSignatureProfiles(db, gabinete) {
  const signatures = defaultSignatureProfilesForGabinete(gabinete);
  signatures.forEach((signature) => {
    db.prepare(
      `
        INSERT INTO signature_profiles (
          gabinete_id, label, signatory_name, signatory_role, closing_text,
          footer_text, file_url, active, created_at, updated_at
        ) VALUES (
          :gabinete_id, :label, :signatory_name, :signatory_role, :closing_text,
          :footer_text, :file_url, 1, :created_at, :updated_at
        )
      `,
    ).run({
      gabinete_id: gabinete.id,
      label: signature.label,
      signatory_name: signature.signatory_name,
      signatory_role: signature.signatory_role,
      closing_text: signature.closing_text,
      footer_text: signature.footer_text,
      file_url: signature.file_url,
      created_at: nowIso(),
      updated_at: nowIso(),
    });
  });
}

function seedAiLinks(db, gabineteId) {
  DEFAULT_AI_LINKS.forEach((item) => {
    db.prepare(
      `
        INSERT INTO ai_links (
          gabinete_id, title, url, description, kind, category, visibility, is_builtin, sort_order, active, created_at, updated_at
        ) VALUES (
          :gabinete_id, :title, :url, :description, :kind, :category, 'builtin', 1, :sort_order, 1, :created_at, :updated_at
        )
      `,
    ).run({
      gabinete_id: gabineteId,
      title: item.title,
      url: item.url,
      description: item.description,
      kind: item.kind || "principal",
      category: item.category || "",
      sort_order: item.sort_order || 999,
      created_at: nowIso(),
      updated_at: nowIso(),
    });
  });
}

function seedRoutingRules(db, gabineteId) {
  DEFAULT_ROUTING_RULES.forEach((rule) => {
    db.prepare(
      `
        INSERT INTO routing_rules (
          gabinete_id, topic, keywords, recommended_department, target_authority,
          via_strategy, notes, priority, active, created_at, updated_at
        ) VALUES (
          :gabinete_id, :topic, :keywords, :recommended_department, :target_authority,
          :via_strategy, :notes, :priority, 1, :created_at, :updated_at
        )
      `,
    ).run({
      gabinete_id: gabineteId,
      topic: rule.topic,
      keywords: rule.keywords,
      recommended_department: rule.recommended_department,
      target_authority: rule.target_authority,
      via_strategy: rule.via_strategy,
      notes: rule.notes,
      priority: rule.priority,
      created_at: nowIso(),
      updated_at: nowIso(),
    });
  });
}

function defaultSignatureProfilesForGabinete(gabinete) {
  const parlamentar = gabinete.parliamentarian_name || gabinete.name;
  const gabineteLabel = gabinete.type || "Gabinete";
  const cidadeLinha = [gabinete.city, gabinete.uf].filter(Boolean).join(" / ");

  return [
    {
      label: "Assinatura parlamentar",
      signatory_name: parlamentar,
      signatory_role: gabineteLabel,
      closing_text: "Sem mais para o momento, renovamos protestos de estima e consideracao.",
      footer_text: cidadeLinha ? `${cidadeLinha} • Gabinete parlamentar` : "Gabinete parlamentar",
      file_url: "",
    },
    {
      label: "Assinatura assessoria",
      signatory_name: gabinete.responsible_name || "Assessoria do gabinete",
      signatory_role: "Assessoria parlamentar",
      closing_text: "Permanecemos a disposicao para acompanhar o caso e prestar novos esclarecimentos.",
      footer_text: cidadeLinha ? `${cidadeLinha} • Atendimento do gabinete` : "Atendimento do gabinete",
      file_url: "",
    },
    {
      label: "Uso administrativo",
      signatory_name: gabinete.responsible_name || parlamentar,
      signatory_role: "Responsavel administrativo",
      closing_text: "Registro emitido para fins de controle interno do gabinete.",
      footer_text: cidadeLinha ? `${cidadeLinha} • Controle interno` : "Controle interno",
      file_url: "",
    },
  ];
}

function createDemoData(db, gabineteId, gabineteAdminId, advisorId) {
  const contacts = [
    {
      name: "Andreia Souza",
      phone: "19999918398",
      whatsapp: "19999918398",
      cpf_rg_cns: "",
      profession: "Autonoma",
      address: "Rua 14",
      number: "84",
      neighborhood: "Jardim Santa Maria",
      zip_code: "13500-000",
      city: "Rio Claro",
      uf: "SP",
      notes: "Contato frequente do bairro.",
    },
    {
      name: "Waguinho Ferreira",
      phone: "19996814144",
      whatsapp: "19996814144",
      cpf_rg_cns: "",
      profession: "Comerciante",
      address: "Rua 30",
      number: "209",
      neighborhood: "Jardim Paulista",
      zip_code: "13501-210",
      city: "Rio Claro",
      uf: "SP",
      notes: "Atua na igreja do bairro.",
    },
    {
      name: "Velo Clube",
      phone: "",
      whatsapp: "",
      cpf_rg_cns: "",
      profession: "Associacao esportiva",
      address: "Estadio Benito Agnelo Castellano",
      number: "",
      neighborhood: "Jardim Claret",
      zip_code: "13503-120",
      city: "Rio Claro",
      uf: "SP",
      notes: "Demandas ligadas aos jogos.",
    },
  ];

  const insertedContacts = contacts.map((contact) =>
    Number(
      db
        .prepare(
          `
            INSERT INTO contacts (
              gabinete_id, name, phone, whatsapp, cpf_rg_cns, birth_date, email,
              profession, address, number, complement, neighborhood, zip_code,
              city, uf, notes, tags, first_ticket_at, last_ticket_at, created_at, updated_at
            ) VALUES (
              :gabinete_id, :name, :phone, :whatsapp, :cpf_rg_cns, '', '',
              :profession, :address, :number, '', :neighborhood, :zip_code,
              :city, :uf, :notes, :tags, :first_ticket_at, :last_ticket_at, :created_at, :updated_at
            )
          `,
        )
        .run({
          gabinete_id: gabineteId,
          name: contact.name,
          phone: normalizePhone(contact.phone),
          whatsapp: normalizePhone(contact.whatsapp),
          cpf_rg_cns: contact.cpf_rg_cns,
          profession: contact.profession,
          address: contact.address,
          number: contact.number,
          neighborhood: contact.neighborhood,
          zip_code: contact.zip_code,
          city: contact.city,
          uf: contact.uf,
          notes: contact.notes,
          tags: "demo,importado",
          first_ticket_at: "2026-01-24",
          last_ticket_at: "2026-04-10",
          created_at: nowIso(),
          updated_at: nowIso(),
        }).lastInsertRowid,
    ),
  );

  const tickets = [
    {
      contactId: insertedContacts[0],
      opened_at: "2026-02-06",
      channel: "WhatsApp",
      status: "Oficio encaminhado",
      priority: "Alta",
      demand_title: "Poda de arvore em area de risco",
      demand_category: "Poda de arvore",
      description:
        "Solicitacao de poda de arvore seca com risco de queda na Rua 14 com a Avenida 84.",
      guidance:
        "Oficio protocolado junto a secretaria competente; aguardar retorno tecnico.",
      assigned_user_id: advisorId,
      department: "Secretaria de Meio Ambiente",
      external_protocol: "OF.G.V. 04/2026",
      internal_due_date: "2026-04-30",
      next_action: "Cobrar vistoria da equipe tecnica",
      next_action_date: "2026-04-22",
      result: "",
      is_favorite: 1,
    },
    {
      contactId: insertedContacts[1],
      opened_at: "2026-02-08",
      channel: "WhatsApp",
      status: "Aguardando servico",
      priority: "Normal",
      demand_title: "Reparo asfaltico em valeta",
      demand_category: "Obras",
      description:
        "Pedido de reparo asfaltico para buraco aberto em valeta na Rua 30, proximo ao numero 209.",
      guidance:
        "Contato realizado com a secretaria e abertura de protocolo interno do gabinete.",
      assigned_user_id: advisorId,
      department: "Secretaria de Obras",
      external_protocol: "RC-OBR-2026-231",
      internal_due_date: "2026-04-25",
      next_action: "Confirmar cronograma de execucao",
      next_action_date: "2026-04-21",
      result: "",
      is_favorite: 0,
    },
    {
      contactId: insertedContacts[2],
      opened_at: "2026-01-24",
      channel: "Oficio",
      status: "Finalizado",
      priority: "Urgente",
      demand_title: "Banheiros quimicos para jogos da Serie A",
      demand_category: "Esporte",
      description:
        "Solicitacao de instalacao de banheiros quimicos para os jogos realizados no estadio do Velo Clube.",
      guidance:
        "Oficio protocolado no gabinete do prefeito e retorno positivo recebido.",
      assigned_user_id: gabineteAdminId,
      department: "Gabinete do Prefeito",
      external_protocol: "OF.G.V. 02/2026",
      internal_due_date: "2026-02-10",
      next_action: "Comunicar deferimento ao solicitante",
      next_action_date: "2026-02-05",
      closed_at: "2026-02-06",
      result: "Atendimento concluido com deferimento",
      is_favorite: 1,
    },
  ];

  tickets.forEach((ticket, index) => {
    const ticketId = Number(
      db
        .prepare(
          `
            INSERT INTO tickets (
              gabinete_id, contact_id, number, opened_at, channel, status,
              priority, tags, demand_title, demand_category, description,
              current_guidance, assigned_user_id, department, external_protocol,
              internal_due_date, next_action, next_action_date, closed_at, result,
              is_archived, is_favorite, created_at, updated_at
            ) VALUES (
              :gabinete_id, :contact_id, :number, :opened_at, :channel, :status,
              :priority, :tags, :demand_title, :demand_category, :description,
              :current_guidance, :assigned_user_id, :department, :external_protocol,
              :internal_due_date, :next_action, :next_action_date, :closed_at, :result,
              0, :is_favorite, :created_at, :updated_at
            )
          `,
        )
        .run({
          gabinete_id: gabineteId,
          contact_id: ticket.contactId,
          number: generateTicketCode(gabineteId, index + 1),
          opened_at: ticket.opened_at,
          channel: ticket.channel,
          status: ticket.status,
          priority: ticket.priority,
          tags: index === 0 ? "risco,arvore" : index === 1 ? "obras,rua30" : "esporte,oficio",
          demand_title: ticket.demand_title,
          demand_category: ticket.demand_category,
          description: ticket.description,
          current_guidance: ticket.guidance,
          assigned_user_id: ticket.assigned_user_id,
          department: ticket.department,
          external_protocol: ticket.external_protocol,
          internal_due_date: ticket.internal_due_date,
          next_action: ticket.next_action,
          next_action_date: ticket.next_action_date,
          closed_at: ticket.closed_at ?? "",
          result: ticket.result,
          is_favorite: ticket.is_favorite,
          created_at: nowIso(),
          updated_at: nowIso(),
        }).lastInsertRowid,
    );

    db.prepare(
      `
        INSERT INTO ticket_history (
          gabinete_id, ticket_id, user_id, action_type, text, previous_status,
          new_status, next_action, next_action_date, is_internal, created_at
        ) VALUES (
          :gabinete_id, :ticket_id, :user_id, :action_type, :text, '',
          :new_status, :next_action, :next_action_date, 0, :created_at
        )
      `,
    ).run({
      gabinete_id: gabineteId,
      ticket_id: ticketId,
      user_id: ticket.assigned_user_id,
      action_type: "Criacao",
      text: ticket.guidance,
      new_status: ticket.status,
      next_action: ticket.next_action,
      next_action_date: ticket.next_action_date,
      created_at: nowIso(),
    });
  });
}

export function createUserWithPassword(db, payload) {
  const now = nowIso();
  const result = db.prepare(
    `
      INSERT INTO users (
        gabinete_id, username, name, email, phone, role, password_hash, avatar_url, status,
        must_change_password, created_at, updated_at
      ) VALUES (
        :gabinete_id, :username, :name, :email, :phone, :role, :password_hash, '',
        :status, :must_change_password, :created_at, :updated_at
      )
    `,
  ).run({
    gabinete_id: payload.gabinete_id ?? null,
    username: payload.username?.trim() || null,
    name: payload.name,
    email: payload.email.toLowerCase().trim(),
    phone: normalizePhone(payload.phone ?? ""),
    role: payload.role,
    password_hash: hashPassword(payload.password),
    status: payload.status ?? "active",
    must_change_password: payload.must_change_password ? 1 : 0,
    created_at: now,
    updated_at: now,
  });

  return Number(result.lastInsertRowid);
}

export function createDefaultSetupForGabinete(db, gabineteData, adminData) {
  db.exec("BEGIN");

  try {
    const gabineteId = createGabinete(db, gabineteData);
    const userId = createUserWithPassword(db, {
      gabinete_id: gabineteId,
      username: adminData.username,
      name: adminData.name,
      email: adminData.email,
      phone: adminData.phone,
      role: "gabinete_admin",
      password: adminData.password,
      must_change_password: 0,
    });

    db.exec("COMMIT");
    return { gabineteId, userId };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function getRoleLabel(role) {
  return ROLE_LABELS[role] ?? titleCase(role.replaceAll("_", " "));
}

export function generateTicketCode(gabineteId, sequence) {
  const year = new Date().getUTCFullYear();
  return `ATD-${year}-${String(gabineteId).padStart(2, "0")}-${String(
    sequence,
  ).padStart(5, "0")}`;
}

export function generateDocumentCode(gabineteId, sequence) {
  const year = new Date().getUTCFullYear();
  return `DOC-${year}-${String(gabineteId).padStart(2, "0")}-${String(
    sequence,
  ).padStart(4, "0")}`;
}

function categoryColor(category) {
  const palette = {
    Saude: "#0f766e",
    Educacao: "#2563eb",
    Obras: "#ea580c",
    "Iluminacao publica": "#eab308",
    "Poda de arvore": "#16a34a",
    "Limpeza urbana": "#06b6d4",
    Emprego: "#8b5cf6",
    "Assistencia social": "#ec4899",
    Transporte: "#f97316",
    Esporte: "#14b8a6",
    Cultura: "#7c3aed",
    Habitacao: "#0891b2",
    Seguranca: "#dc2626",
    Outros: "#64748b",
  };

  return palette[category] ?? "#2563eb";
}

function ensureColumn(db, tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  const exists = columns.some((column) => column.name === columnName);
  if (!exists) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

function seedOperationalDemoData(db, gabineteId) {
  const firstTicket = db
    .prepare(
      `
        SELECT t.*, c.name AS contact_name
        FROM tickets t
        JOIN contacts c ON c.id = t.contact_id
        WHERE t.gabinete_id = :gabinete_id
        ORDER BY t.created_at
        LIMIT 1
      `,
    )
    .get({ gabinete_id: gabineteId });
  const firstUser = db
    .prepare(
      "SELECT id, name FROM users WHERE gabinete_id = :gabinete_id ORDER BY created_at LIMIT 1",
    )
    .get({ gabinete_id: gabineteId });
  const secondUser = db
    .prepare(
      "SELECT id, name FROM users WHERE gabinete_id = :gabinete_id ORDER BY created_at LIMIT 1 OFFSET 1",
    )
    .get({ gabinete_id: gabineteId });

  if (!firstUser) {
    return;
  }

  const now = nowIso();

  const documentsCount = db
    .prepare("SELECT COUNT(*) AS total FROM documents WHERE gabinete_id = :gabinete_id")
    .get({ gabinete_id: gabineteId }).total;
  if (documentsCount === 0 && firstTicket) {
    db.prepare(
      `
        INSERT INTO documents (
          gabinete_id, ticket_id, type, internal_number, chamber_number, protocol_date,
          department, legal_due_date, status, demand, summary_request, summary_response,
          progress_note, result, next_action, next_action_date, notes, attachment_url,
          created_by, created_at, updated_at
        ) VALUES (
          :gabinete_id, :ticket_id, :type, :internal_number, :chamber_number, :protocol_date,
          :department, :legal_due_date, :status, :demand, :summary_request, :summary_response,
          :progress_note, :result, :next_action, :next_action_date, :notes, :attachment_url,
          :created_by, :created_at, :updated_at
        )
      `,
    ).run({
      gabinete_id: gabineteId,
      ticket_id: firstTicket.id,
      type: "Oficio",
      internal_number: generateDocumentCode(gabineteId, 1),
      chamber_number: "1563/2026",
      protocol_date: firstTicket.opened_at,
      department: firstTicket.department || "Secretaria competente",
      legal_due_date: firstTicket.internal_due_date || "",
      status: "Aguardando resposta",
      demand: firstTicket.demand_title,
      summary_request: `Solicitacao referente a ${firstTicket.demand_title}.`,
      summary_response: "",
      progress_note: "Documento protocolado e aguardando resposta do orgao.",
      result: "",
      next_action: "Cobrar retorno formal",
      next_action_date: firstTicket.next_action_date || "",
      notes: "Documento demo gerado automaticamente.",
      attachment_url: "",
      created_by: firstUser.id,
      created_at: now,
      updated_at: now,
    });
  }

  const projectsCount = db
    .prepare("SELECT COUNT(*) AS total FROM projects WHERE gabinete_id = :gabinete_id")
    .get({ gabinete_id: gabineteId }).total;
  if (projectsCount === 0) {
    db.prepare(
      `
        INSERT INTO projects (
          gabinete_id, title, description, responsible_id, status, external_link,
          category, notes, created_at, updated_at
        ) VALUES (
          :gabinete_id, :title, :description, :responsible_id, :status, :external_link,
          :category, :notes, :created_at, :updated_at
        )
      `,
    ).run({
      gabinete_id: gabineteId,
      title: "Plano de iluminacao para bairros com mais chamados",
      description:
        "Projeto de levantamento de pontos criticos, consolidacao de oficios e proposta legislativa para manutencao preventiva.",
      responsible_id: secondUser?.id ?? firstUser.id,
      status: "Pesquisa",
      external_link: "https://exemplo.local/projeto-iluminacao",
      category: "Iluminacao publica",
      notes: "Projeto inicial de demonstracao do modulo.",
      created_at: now,
      updated_at: now,
    });
  }

  const firstDocument = db
    .prepare(
      "SELECT id FROM documents WHERE gabinete_id = :gabinete_id ORDER BY created_at LIMIT 1",
    )
    .get({ gabinete_id: gabineteId });
  const firstProject = db
    .prepare(
      "SELECT id FROM projects WHERE gabinete_id = :gabinete_id ORDER BY created_at LIMIT 1",
    )
    .get({ gabinete_id: gabineteId });
  const tasksCount = db
    .prepare("SELECT COUNT(*) AS total FROM tasks WHERE gabinete_id = :gabinete_id")
    .get({ gabinete_id: gabineteId }).total;
  if (tasksCount === 0) {
    const taskRows = [
      {
        title: "Retornar municipe sobre andamento do caso",
        description: "Confirmar se houve retorno do orgao e atualizar o atendimento.",
        responsible_id: secondUser?.id ?? firstUser.id,
        ticket_id: firstTicket?.id ?? null,
        contact_id: firstTicket?.contact_id ?? null,
        document_id: firstDocument?.id ?? null,
        project_id: null,
        due_at: firstTicket?.next_action_date
          ? `${firstTicket.next_action_date}T14:00:00Z`
          : `${new Date().toISOString().slice(0, 10)}T14:00:00Z`,
        priority: "Alta",
        status: "Pendente",
      },
      {
        title: "Consolidar pesquisa para proposta legislativa",
        description: "Reunir referencias, links uteis e minutas.",
        responsible_id: firstUser.id,
        ticket_id: null,
        contact_id: null,
        document_id: null,
        project_id: firstProject?.id ?? null,
        due_at: `${new Date().toISOString().slice(0, 10)}T17:30:00Z`,
        priority: "Normal",
        status: "Em andamento",
      },
    ];

    taskRows.forEach((task) => {
      db.prepare(
        `
          INSERT INTO tasks (
            gabinete_id, title, description, responsible_id, ticket_id, contact_id,
            document_id, project_id, due_at, priority, status, created_at, updated_at
          ) VALUES (
            :gabinete_id, :title, :description, :responsible_id, :ticket_id, :contact_id,
            :document_id, :project_id, :due_at, :priority, :status, :created_at, :updated_at
          )
        `,
      ).run({
        gabinete_id: gabineteId,
        ...task,
        created_at: now,
        updated_at: now,
      });
    });
  }

  const notificationsCount = db
    .prepare("SELECT COUNT(*) AS total FROM notifications WHERE gabinete_id = :gabinete_id")
    .get({ gabinete_id: gabineteId }).total;
  if (notificationsCount === 0) {
    const ticketAssignee = secondUser?.id ?? firstUser.id;
    db.prepare(
      `
        INSERT INTO notifications (
          gabinete_id, user_id, title, message, kind, entity_type, entity_id, is_read, created_at
        ) VALUES (
          :gabinete_id, :user_id, :title, :message, :kind, :entity_type, :entity_id, 0, :created_at
        )
      `,
    ).run({
      gabinete_id: gabineteId,
      user_id: ticketAssignee,
      title: "Atendimento atribuido",
      message: firstTicket
        ? `Voce esta acompanhando o atendimento ${firstTicket.number}.`
        : "Voce recebeu um novo item para acompanhamento.",
      kind: "assignment",
      entity_type: "ticket",
      entity_id: firstTicket?.id ?? null,
      created_at: now,
    });
  }
}

const schemaSql = `
  CREATE TABLE IF NOT EXISTS gabinetes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    parliamentarian_name TEXT,
    party TEXT,
    city TEXT,
    city_ibge TEXT,
    uf TEXT,
    zip_code TEXT,
    address TEXT,
    address_number TEXT,
    address_complement TEXT,
    neighborhood TEXT,
    responsible_name TEXT,
    phone TEXT,
    email TEXT,
    logo_url TEXT,
    public_slug TEXT,
    public_self_register_intro TEXT,
    public_self_register_config TEXT,
    workspace_module_config TEXT,
    ui_theme_mode TEXT NOT NULL DEFAULT 'light',
    ui_theme_palette TEXT NOT NULL DEFAULT 'azul',
    email_sender_name TEXT,
    email_sender_address TEXT,
    email_reply_to TEXT,
    email_smtp_host TEXT,
    email_smtp_port INTEGER,
    email_smtp_security TEXT NOT NULL DEFAULT 'ssl_tls',
    email_smtp_username TEXT,
    email_smtp_password TEXT,
    email_smtp_verified_at TEXT,
    whatsapp_provider TEXT NOT NULL DEFAULT 'evolution',
    whatsapp_instance_name TEXT,
    whatsapp_instance_token TEXT,
    default_follow_up_days INTEGER NOT NULL DEFAULT 3,
    default_document_due_days INTEGER NOT NULL DEFAULT 30,
    default_birthday_notice_days INTEGER NOT NULL DEFAULT 7,
    default_area_code TEXT,
    team_label TEXT NOT NULL DEFAULT 'Meu time',
    storage_provider TEXT NOT NULL DEFAULT 'local',
    storage_plan_label TEXT NOT NULL DEFAULT 'Básico',
    storage_quota_bytes INTEGER NOT NULL DEFAULT 1073741824,
    storage_webdav_enabled INTEGER NOT NULL DEFAULT 0,
    storage_webdav_url TEXT,
    storage_webdav_username TEXT,
    storage_webdav_password_env TEXT,
    storage_webdav_public_url TEXT,
    storage_webdav_root_label TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    onboarding_completed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gabinete_id INTEGER REFERENCES gabinetes(id) ON DELETE CASCADE,
    username TEXT UNIQUE,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    role TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    avatar_url TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    must_change_password INTEGER NOT NULL DEFAULT 0,
    password_changed_at TEXT,
    last_login_at TEXT,
    last_login_ip TEXT,
    last_login_provider TEXT,
    ui_theme_mode TEXT NOT NULL DEFAULT 'light',
    ui_theme_palette TEXT NOT NULL DEFAULT 'azul',
    ui_sidebar_collapsed INTEGER NOT NULL DEFAULT 0,
    workspace_module_preferences TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_module_permissions (
    gabinete_id INTEGER NOT NULL REFERENCES gabinetes(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    module_key TEXT NOT NULL,
    can_view INTEGER NOT NULL DEFAULT 0,
    can_create INTEGER NOT NULL DEFAULT 0,
    can_edit INTEGER NOT NULL DEFAULT 0,
    can_delete INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (gabinete_id, user_id, module_key)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    last_active_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    gabinete_id INTEGER REFERENCES gabinetes(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS password_reset_request_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    ip_address TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gabinete_id INTEGER NOT NULL REFERENCES gabinetes(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS status_custom (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gabinete_id INTEGER NOT NULL REFERENCES gabinetes(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_final INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gabinete_id INTEGER NOT NULL REFERENCES gabinetes(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS whatsapp_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gabinete_id INTEGER NOT NULL REFERENCES gabinetes(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    kind TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gabinete_id INTEGER NOT NULL REFERENCES gabinetes(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    nickname TEXT,
    contact_type TEXT NOT NULL DEFAULT 'person',
    register_kind TEXT NOT NULL DEFAULT 'person',
    segment TEXT NOT NULL DEFAULT 'municipe',
    gender TEXT,
    is_leader INTEGER NOT NULL DEFAULT 0,
    is_authority INTEGER NOT NULL DEFAULT 0,
    phone TEXT,
    whatsapp TEXT,
    cpf_rg_cns TEXT,
    birth_date TEXT,
    birth_month INTEGER,
    birth_day INTEGER,
    birth_year INTEGER,
    birth_date_precision TEXT,
    email TEXT,
    photo_url TEXT,
    profession TEXT,
    referred_by TEXT,
    company_legal_name TEXT,
    foundation_date TEXT,
    employee_count INTEGER,
    has_pet INTEGER NOT NULL DEFAULT 0,
    address TEXT,
    number TEXT,
    complement TEXT,
    neighborhood TEXT,
    zip_code TEXT,
    city TEXT,
    uf TEXT,
    social_instagram TEXT,
    social_facebook TEXT,
    social_x TEXT,
    social_youtube TEXT,
    geo_lat TEXT,
    geo_lng TEXT,
    notes TEXT,
    tags TEXT,
    first_ticket_at TEXT,
    last_ticket_at TEXT,
    deleted_at TEXT,
    deleted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    import_id INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS contact_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gabinete_id INTEGER NOT NULL REFERENCES gabinetes(id) ON DELETE CASCADE,
    contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'manual',
    public_visible INTEGER NOT NULL DEFAULT 0,
    public_visible_at TEXT,
    public_visible_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS contact_merge_suggestions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gabinete_id INTEGER NOT NULL REFERENCES gabinetes(id) ON DELETE CASCADE,
    import_id INTEGER REFERENCES imports(id) ON DELETE SET NULL,
    existing_contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    imported_contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    match_kind TEXT NOT NULL,
    match_value TEXT,
    existing_name TEXT,
    imported_name TEXT,
    match_score INTEGER NOT NULL DEFAULT 0,
    confidence TEXT NOT NULL DEFAULT 'medium',
    reasons_json TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    updated_at TEXT,
    resolved_at TEXT,
    resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gabinete_id INTEGER NOT NULL REFERENCES gabinetes(id) ON DELETE CASCADE,
    contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    number TEXT NOT NULL UNIQUE,
    opened_at TEXT NOT NULL,
    channel TEXT NOT NULL,
    status TEXT NOT NULL,
    priority TEXT NOT NULL,
    tags TEXT,
    demand_title TEXT NOT NULL,
    demand_category TEXT,
    description TEXT,
    current_guidance TEXT,
    assigned_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    department TEXT,
    external_protocol TEXT,
    internal_due_date TEXT,
    dependency_note TEXT,
    follow_up_days INTEGER NOT NULL DEFAULT 3,
    next_action TEXT,
    next_action_date TEXT,
    closed_at TEXT,
    result TEXT,
    closure_confirmed INTEGER NOT NULL DEFAULT 0,
    support_link TEXT,
    geo_lat TEXT,
    geo_lng TEXT,
    public_tracking_enabled INTEGER NOT NULL DEFAULT 0,
    public_tracking_code TEXT,
    public_tracking_secret_hash TEXT,
    public_tracking_secret_hint TEXT,
    public_status TEXT,
    public_last_update_at TEXT,
    public_created_at TEXT,
    public_updated_at TEXT,
    public_tracking_link_generation_count INTEGER NOT NULL DEFAULT 0,
    public_tracking_secret_generation_count INTEGER NOT NULL DEFAULT 0,
    public_tracking_failed_attempts INTEGER NOT NULL DEFAULT 0,
    import_id INTEGER,
    is_archived INTEGER NOT NULL DEFAULT 0,
    is_favorite INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ticket_public_updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gabinete_id INTEGER NOT NULL REFERENCES gabinetes(id) ON DELETE CASCADE,
    ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    public_status TEXT,
    message TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'portal',
    source_type TEXT,
    source_id INTEGER,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ticket_public_access_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gabinete_id INTEGER NOT NULL REFERENCES gabinetes(id) ON DELETE CASCADE,
    ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
    public_tracking_code TEXT NOT NULL,
    success INTEGER NOT NULL DEFAULT 0,
    ip_address TEXT,
    user_agent TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ticket_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gabinete_id INTEGER NOT NULL REFERENCES gabinetes(id) ON DELETE CASCADE,
    ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action_type TEXT NOT NULL,
    text TEXT,
    previous_status TEXT,
    new_status TEXT,
    next_action TEXT,
    next_action_date TEXT,
    is_internal INTEGER NOT NULL DEFAULT 0,
    import_id INTEGER,
    public_visible INTEGER NOT NULL DEFAULT 0,
    public_visible_at TEXT,
    public_visible_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS saved_filters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gabinete_id INTEGER NOT NULL REFERENCES gabinetes(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scope TEXT NOT NULL,
    name TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS lookup_preferences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gabinete_id INTEGER NOT NULL REFERENCES gabinetes(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lookup_kind TEXT NOT NULL,
    preferred_provider TEXT NOT NULL DEFAULT 'auto',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(gabinete_id, user_id, lookup_kind)
  );

  CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gabinete_id INTEGER NOT NULL REFERENCES gabinetes(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS public_entity_shares (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gabinete_id INTEGER NOT NULL REFERENCES gabinetes(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    share_code TEXT NOT NULL UNIQUE,
    secret_hash TEXT NOT NULL,
    secret_hint TEXT,
    access_level TEXT NOT NULL DEFAULT 'view',
    share_mode TEXT NOT NULL DEFAULT 'normal',
    view_seconds INTEGER NOT NULL DEFAULT 0,
    one_time INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT,
    opened_at TEXT,
    consumed_at TEXT,
    access_count INTEGER NOT NULL DEFAULT 0,
    link_generation_count INTEGER NOT NULL DEFAULT 1,
    secret_generation_count INTEGER NOT NULL DEFAULT 1,
    failed_access_count INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gabinete_id INTEGER NOT NULL REFERENCES gabinetes(id) ON DELETE CASCADE,
    ticket_id INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
    template_id INTEGER,
    type TEXT NOT NULL,
    internal_number TEXT NOT NULL,
    chamber_number TEXT,
    protocol_date TEXT,
    department TEXT,
    subject_line TEXT,
    addressed_to TEXT,
    routing_hint TEXT,
    legal_due_date TEXT,
    status TEXT NOT NULL,
    demand TEXT,
    summary_request TEXT,
    summary_response TEXT,
    response_received_at TEXT,
    generated_text TEXT,
    progress_note TEXT,
    result TEXT,
    next_action TEXT,
    next_action_date TEXT,
    notes TEXT,
    attachment_url TEXT,
    signature_profile_id INTEGER,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS document_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gabinete_id INTEGER NOT NULL REFERENCES gabinetes(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    type TEXT NOT NULL,
    topic TEXT NOT NULL,
    variant_name TEXT NOT NULL,
    recommended_department TEXT,
    target_authority TEXT,
    via_strategy TEXT,
    use_case TEXT,
    subject_template TEXT,
    body_template TEXT NOT NULL,
    summary_template TEXT,
    tags TEXT,
    is_builtin INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS signature_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gabinete_id INTEGER NOT NULL REFERENCES gabinetes(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    signatory_name TEXT NOT NULL,
    signatory_role TEXT NOT NULL,
    closing_text TEXT,
    footer_text TEXT,
    file_url TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ai_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gabinete_id INTEGER NOT NULL REFERENCES gabinetes(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    description TEXT,
    kind TEXT NOT NULL DEFAULT 'principal',
    category TEXT,
    visibility TEXT NOT NULL DEFAULT 'private',
    is_builtin INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 999,
    moderation_status TEXT NOT NULL DEFAULT 'published',
    moderation_reason TEXT,
    moderated_at TEXT,
    report_count INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ai_prompt_ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ai_link_id INTEGER NOT NULL REFERENCES ai_links(id) ON DELETE CASCADE,
    gabinete_id INTEGER NOT NULL REFERENCES gabinetes(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ai_prompt_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ai_link_id INTEGER NOT NULL REFERENCES ai_links(id) ON DELETE CASCADE,
    gabinete_id INTEGER NOT NULL REFERENCES gabinetes(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    details TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    reviewed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS routing_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gabinete_id INTEGER NOT NULL REFERENCES gabinetes(id) ON DELETE CASCADE,
    topic TEXT NOT NULL,
    keywords TEXT,
    recommended_department TEXT NOT NULL,
    target_authority TEXT,
    via_strategy TEXT,
    notes TEXT,
    priority INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gabinete_id INTEGER NOT NULL REFERENCES gabinetes(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    responsible_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    status TEXT NOT NULL,
    external_link TEXT,
    category TEXT,
    notes TEXT,
    source_connector_id INTEGER,
    source_provider TEXT,
    source_external_id TEXT,
    source_key TEXT,
    source_number TEXT,
    source_year TEXT,
    source_date TEXT,
    source_protocol TEXT,
    source_author TEXT,
    source_subject TEXT,
    source_status TEXT,
    source_stage TEXT,
    source_response TEXT,
    source_response_url TEXT,
    source_attachment_url TEXT,
    source_tracking TEXT,
    source_url TEXT,
    source_raw_json TEXT,
    generated_document_id INTEGER,
    source_detail_synced_at TEXT,
    last_synced_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS legislative_connectors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gabinete_id INTEGER NOT NULL REFERENCES gabinetes(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    name TEXT NOT NULL,
    source_url TEXT NOT NULL,
    profile_url TEXT,
    base_url TEXT,
    external_ref TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    last_sync_at TEXT,
    last_error TEXT,
    item_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gabinete_id INTEGER NOT NULL REFERENCES gabinetes(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    body TEXT,
    tags TEXT,
    color TEXT NOT NULL DEFAULT 'yellow',
    is_pinned INTEGER NOT NULL DEFAULT 0,
    is_archived INTEGER NOT NULL DEFAULT 0,
    contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
    ticket_id INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
    document_id INTEGER REFERENCES documents(id) ON DELETE SET NULL,
    project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    finance_entry_id INTEGER REFERENCES finance_entries(id) ON DELETE SET NULL,
    task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    archived_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gabinete_id INTEGER NOT NULL REFERENCES gabinetes(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    responsible_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ticket_id INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
    contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
    document_id INTEGER REFERENCES documents(id) ON DELETE SET NULL,
    project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    note_id INTEGER REFERENCES notes(id) ON DELETE SET NULL,
    tags TEXT,
    due_at TEXT,
    priority TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS call_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gabinete_id INTEGER NOT NULL REFERENCES gabinetes(id) ON DELETE CASCADE,
    contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
    ticket_id INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
    phone TEXT NOT NULL,
    subject TEXT NOT NULL,
    notes TEXT,
    outcome TEXT,
    call_at TEXT NOT NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS whatsapp_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gabinete_id INTEGER NOT NULL REFERENCES gabinetes(id) ON DELETE CASCADE,
    contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
    ticket_id INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    template_id INTEGER REFERENCES whatsapp_templates(id) ON DELETE SET NULL,
    provider TEXT NOT NULL DEFAULT 'evolution',
    direction TEXT NOT NULL DEFAULT 'outbound',
    instance_name TEXT,
    remote_phone TEXT NOT NULL,
    remote_name TEXT,
    remote_jid TEXT,
    message_type TEXT NOT NULL DEFAULT 'text',
    message_text TEXT NOT NULL,
    attachment_url TEXT,
    mime_type TEXT,
    provider_message_id TEXT,
    provider_status TEXT,
    provider_payload TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS whatsapp_threads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gabinete_id INTEGER NOT NULL REFERENCES gabinetes(id) ON DELETE CASCADE,
    remote_phone TEXT NOT NULL,
    remote_name TEXT,
    contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
    ticket_id INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
    assigned_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    is_monitored INTEGER NOT NULL DEFAULT 1,
    last_message_at TEXT,
    last_message_text TEXT,
    unread_count INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS email_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gabinete_id INTEGER NOT NULL REFERENCES gabinetes(id) ON DELETE CASCADE,
    contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
    ticket_id INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    provider TEXT NOT NULL DEFAULT 'smtp',
    direction TEXT NOT NULL DEFAULT 'outbound',
    remote_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    message_text TEXT NOT NULL,
    provider_status TEXT,
    provider_payload TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS finance_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gabinete_id INTEGER NOT NULL REFERENCES gabinetes(id) ON DELETE CASCADE,
    entry_type TEXT NOT NULL,
    title TEXT NOT NULL,
    category TEXT,
    description TEXT,
    amount_cents INTEGER NOT NULL DEFAULT 0,
    entry_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Registrado',
    payment_status TEXT NOT NULL DEFAULT 'Pago',
    counterparty TEXT,
    notes TEXT,
    recurrence_group_id TEXT,
    recurrence_index INTEGER NOT NULL DEFAULT 1,
    recurrence_total INTEGER NOT NULL DEFAULT 1,
    receipt_file_url TEXT,
    receipt_file_name TEXT,
    receipt_file_type TEXT,
    receipt_file_size INTEGER NOT NULL DEFAULT 0,
    public_share_enabled INTEGER NOT NULL DEFAULT 0,
    public_share_code TEXT,
    public_share_secret_hash TEXT,
    public_share_secret_hint TEXT,
    public_share_created_at TEXT,
    public_share_updated_at TEXT,
    public_share_mode TEXT NOT NULL DEFAULT 'normal',
    public_share_view_seconds INTEGER NOT NULL DEFAULT 0,
    public_share_one_time INTEGER NOT NULL DEFAULT 0,
    public_share_expires_at TEXT,
    public_share_opened_at TEXT,
    public_share_consumed_at TEXT,
    public_share_access_count INTEGER NOT NULL DEFAULT 0,
    public_share_link_generation_count INTEGER NOT NULL DEFAULT 0,
    public_share_secret_generation_count INTEGER NOT NULL DEFAULT 0,
    public_share_failed_attempts INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_access_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gabinete_id INTEGER REFERENCES gabinetes(id) ON DELETE SET NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gabinete_id INTEGER REFERENCES gabinetes(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    kind TEXT NOT NULL,
    entity_type TEXT,
    entity_id INTEGER,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    read_at TEXT
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gabinete_id INTEGER REFERENCES gabinetes(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id INTEGER,
    previous_data TEXT,
    new_data TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gabinete_id INTEGER NOT NULL REFERENCES gabinetes(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    source_name TEXT NOT NULL,
    source_type TEXT NOT NULL,
    status TEXT NOT NULL,
    total_rows INTEGER NOT NULL DEFAULT 0,
    imported_contacts INTEGER NOT NULL DEFAULT 0,
    imported_tickets INTEGER NOT NULL DEFAULT 0,
    duplicates_count INTEGER NOT NULL DEFAULT 0,
    errors_count INTEGER NOT NULL DEFAULT 0,
    summary_json TEXT,
    confirmed_at TEXT,
    undo_status TEXT NOT NULL DEFAULT 'not_available',
    undo_reason TEXT,
    undone_at TEXT,
    undone_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    undo_summary_json TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS import_contact_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gabinete_id INTEGER NOT NULL REFERENCES gabinetes(id) ON DELETE CASCADE,
    import_id INTEGER NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
    contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    snapshot_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(gabinete_id, import_id, contact_id)
  );

  CREATE TABLE IF NOT EXISTS holidays (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scope TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'holiday',
    date TEXT NOT NULL,
    year INTEGER NOT NULL,
    name TEXT NOT NULL,
    uf TEXT,
    city_name TEXT,
    city_ibge TEXT,
    legal_basis TEXT,
    source_name TEXT,
    source_url TEXT,
    validation_status TEXT NOT NULL DEFAULT 'curated',
    notes TEXT,
    dedupe_key TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`;
