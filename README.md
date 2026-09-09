# n8n Redis Stack RAG Setup

**Guia completo para dar a um agente de IA do n8n uma base de conhecimento (RAG) usando Redis Stack como vector store, no EasyPanel** 🧠

## O Problema

Você quer que seu agente de IA no n8n (WhatsApp, Instagram, etc.) responda perguntas usando uma base de conhecimento real (FAQ, informações de produto/curso), em vez de "alucinar" respostas. Pra isso você precisa de um vector store — e tentando usar o serviço **"Redis"** pronto do EasyPanel pra isso, esbarra num problema:

```
MODULE LIST
(empty array)
```

Mesmo colocando `redis-stack-server` ou `--loadmodule ...` no campo "Comando" do serviço, os módulos (RediSearch, RedisJSON, etc.) nunca carregam — porque **esse campo é ignorado** no template "Redis" do EasyPanel.

## A Solução

**Não use o serviço template "Redis". Crie um serviço "Aplicativo" (App) genérico** com a imagem `redis/redis-stack-server:latest` — nesse tipo de serviço, o campo "Avançado → Comando" *realmente* vira o comando do container, e o `redis-stack-server` carrega todos os módulos (search, JSON, timeseries, bloom, gears) corretamente.

Depois disso: cria a credencial Redis no n8n, popula o índice vetorial com um workflow de insert, e conecta o vector store como uma tool (`retrieve-as-tool`) no seu agente de IA existente.

## Confirmação de Sucesso

```
redis-cli -a "$REDIS_PASSWORD" MODULE LIST
```

deve listar 6 módulos: `rediscompat`, `ReJSON`, `search`, `timeseries`, `bf`, `redisgears_2`.

E no n8n, uma execução do workflow de "RAG Setup" deve terminar em sucesso, criando o índice (`FT.INFO <nome-do-indice>`) e inserindo os documentos.

## Stack Testado

- **n8n**: v2.19+ (self-hosted em EasyPanel)
- **Redis**: `redis/redis-stack-server:latest`
- **Embeddings**: Google Gemini
- **Clientes**: ACTO (produção)

## Por que acontece?

O template "Redis" do EasyPanel monta o comando do container como uma string shell fixa (`sh -c "redis-server --requirepass \"$REDIS_PASSWORD\""`) que não referencia `$0`/`$1`, então qualquer coisa digitada no campo "Comando" da UI vira um argumento posicional solto — nunca chega no processo `redis-server`. Um serviço "Aplicativo" não tem essa limitação: o campo "Comando" vira o `CMD` real do container.

## Como Usar (Runbook Completo)

Veja **[SKILL.md](./SKILL.md)** para o runbook completo com:
- O "trap" do campo Comando no serviço Redis do EasyPanel
- Passo a passo pra criar o serviço App correto
- Configuração da credencial Redis no n8n
- Workflow de RAG Setup (popular o índice) — incluindo a pegadinha do `overwriteDocuments`
- Como conectar o vector store como tool num agente existente
- Checklist de troubleshooting

## Exemplos

Veja a pasta `examples/` para:
- `rag-setup-workflow.ts` — Workflow de exemplo (n8n Workflow SDK) que cria os documentos de FAQ e insere no índice vetorial

## Autoria

- **Descoberta do bug + solução**: Machado (NEOSIX AUTO / Nelson AI)
- **Data**: 09/09/2026
- **Contexto**: Build-out do PROJETO_ACTO (agente Jennifer, DM Instagram)

## Licença

MIT — Use, copie, compartilhe livremente.

---

**Gostou? Compartilhe com outras pessoas que estão configurando RAG no n8n!**

Se isso funcionou pra você, considere dar uma ⭐ no repo ou compartilhar na comunidade n8n.
