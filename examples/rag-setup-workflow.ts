import { workflow, node, trigger, vectorStore, embeddings, documentLoader, sticky } from '@n8n/workflow-sdk';

const startTrigger = trigger({
  type: 'n8n-nodes-base.manualTrigger',
  version: 1,
  config: { name: 'Start Manual', position: [0, 0] },
  output: [{}]
});

const jsCodeFaq = "const documentos = [\n  { titulo: 'O que e o Metodo ACTO', texto: 'O Metodo ACTO e uma metodologia de neuroeducacao aplicada a tomada de decisao em situacoes de risco, criada pelo instrutor Eder Edick Rafael Sabino, policial em atividade e instrutor de direcao defensiva e tiro preventivo. O metodo treina a pessoa a sair do piloto automatico e tomar decisoes conscientes em momentos de pressao, usando neurociencia e pratica controlada.' },\n  { titulo: 'Onde o Metodo ACTO e aplicado', texto: 'O Metodo ACTO e aplicado em tres frentes principais: transito (direcao defensiva), ambientes operacionais (profissionais que atuam sob risco) e seguranca pessoal no dia a dia. O objetivo e treinar reflexos conscientes para situacoes de alta pressao, evitando decisoes no piloto automatico.' },\n  { titulo: 'Quem criou o Metodo ACTO', texto: 'O Metodo ACTO foi criado por Eder Edick Rafael Sabino, policial em atividade e instrutor de direcao defensiva e tiro preventivo, com base em neuroeducacao e experiencia pratica em seguranca operacional.' },\n  { titulo: 'Onde fica o Metodo ACTO', texto: 'O Metodo ACTO esta sediado em Bauru, Sao Paulo, e atende clientes de varias regioes interessados em treinamentos de tomada de decisao sob pressao.' },\n  { titulo: 'Como funciona o atendimento do Metodo ACTO', texto: 'O atendimento do Metodo ACTO e feito por WhatsApp e Instagram. A equipe (assistentes virtuais Bia, Jennifer e Edilaine) qualifica o interesse da pessoa, pede nome e cidade, e um responsavel humano entra em contato para explicar os proximos passos, valores e datas dos treinamentos.' },\n  { titulo: 'O Metodo ACTO tem preco fixo ou varia', texto: 'Os valores dos treinamentos do Metodo ACTO ainda nao foram cadastrados nesta base de conhecimento. Quando o cliente perguntar sobre precos, valores ou formas de pagamento, informe que um responsavel vai confirmar os detalhes, sem inventar numeros.' }\n];\n\nreturn documentos.map(function(doc) {\n  return { json: { text: doc.titulo + ': ' + doc.texto, titulo: doc.titulo } };\n});";

const criarDocumentos = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Base de Conhecimento ACTO (FAQ)',
    parameters: { jsCode: jsCodeFaq },
    position: [300, 0]
  },
  output: [{ text: 'O que e o Metodo ACTO: O Metodo ACTO e uma metodologia de neuroeducacao...', titulo: 'O que e o Metodo ACTO' }]
});

const embeddingGemini = embeddings({
  type: '@n8n/n8n-nodes-langchain.embeddingsGoogleGemini',
  version: 1,
  config: {
    name: 'Embeddings Gemini',
    parameters: {},
    credentials: { googlePalmApi: { id: 'DmIh0rmRDAWCRxQU', name: 'Nelsons' } },
    position: [600, 250]
  }
});

const dataLoader = documentLoader({
  type: '@n8n/n8n-nodes-langchain.documentDefaultDataLoader',
  version: 1.1,
  config: {
    name: 'Carregar Documentos',
    parameters: {
      dataType: 'json',
      jsonMode: 'allInputData',
      textSplittingMode: 'simple',
      options: {
        pointers: '/text',
        metadata: {
          metadataValues: [
            { name: 'fonte', value: 'FAQ Metodo ACTO' }
          ]
        }
      }
    },
    position: [600, 400]
  }
});

const inserirVectorStore = vectorStore({
  type: '@n8n/n8n-nodes-langchain.vectorStoreRedis',
  version: 1.3,
  config: {
    name: 'Inserir na Base de Conhecimento',
    parameters: {
      mode: 'insert',
      redisIndex: { __rl: true, mode: 'id', value: 'acto_knowledge_base' },
      embeddingBatchSize: 200,
      options: {
        keyPrefix: 'acto_kb:',
        overwriteDocuments: true
      }
    },
    credentials: { redis: { id: 'xRVA77rOmsksQZLE', name: 'PROJETO-ACTO-REDIS-STACK' } },
    subnodes: { embedding: embeddingGemini, documentLoader: dataLoader },
    position: [600, 0]
  },
  output: [{ success: true }]
});

const notaExplicativa = sticky(
  '# RAG - Popular Base de Conhecimento ACTO\n\nEste workflow (re)cria o indice `acto_knowledge_base` no Redis Stack e insere os documentos de FAQ do Metodo ACTO, gerando embeddings via Google Gemini.\n\nRodar manualmente (Start Manual) sempre que quiser ATUALIZAR o conteudo da base de conhecimento. Como overwriteDocuments=true, cada execucao recria o indice do zero com o conteudo do node "Base de Conhecimento ACTO (FAQ)" - edite esse node para adicionar/mudar informacoes reais (precos, cursos, datas) quando o Eder enviar.\n\nEsse Vector Store e consultado pelo Agente Jennifer no workflow "ACTO - IA Conversacional-INSTA" via tool de retrieve-as-tool.',
  [startTrigger, criarDocumentos, inserirVectorStore],
  { color: 4 }
);

export default workflow('acto-rag-setup', 'ACTO – RAG Setup (Popular Base de Conhecimento)')
  .add(startTrigger)
  .to(criarDocumentos)
  .to(inserirVectorStore)
  .add(notaExplicativa);
