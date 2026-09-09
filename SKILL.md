---
name: n8n-redis-stack-rag-setup
description: "Use when setting up RAG (Retrieval-Augmented Generation) for an n8n AI agent with Redis Stack as the vector store on EasyPanel — fixing module loading and wiring the vector store as an agent tool."
---

# n8n + Redis Stack RAG setup (EasyPanel)

End-to-end recipe for giving an n8n AI agent (e.g. a WhatsApp/Instagram DM assistant) a
knowledge base via RAG, using Redis Stack (RediSearch + RedisJSON) as the vector store and
Google Gemini embeddings, deployed on EasyPanel. Written from the PROJETO_ACTO build-out.

## The EasyPanel "Redis" service type trap (read this first)

EasyPanel's built-in **Redis** service template hardcodes the container command as:

```
sh -c "redis-server --requirepass \"$REDIS_PASSWORD\"" <whatever you type in "Comando">
```

Because the quoted script string doesn't reference `$0`/`$1`/etc., anything typed into the
Advanced -> "Comando" field is appended as **unused positional shell arguments** — it never
reaches the actual `redis-server` process. This means:

- Typing `redis-stack-server` in that field does nothing (still plain Redis, no modules).
- Typing `--loadmodule /opt/redis-stack/lib/redisearch.so ...` does nothing either.
- `MODULE LIST` will always return `(empty array)` no matter what you put there.
- You can confirm this dead end quickly: `cat /proc/1/cmdline | tr '\0' ' '` in the service's
  Bash console shows the real argv has zero extra flags, even though the UI field shows your
  text saved.

**Don't waste time iterating on the "Comando" field of a Redis-type service.** It cannot be
made to load Redis Stack modules. This is a template limitation, not a syntax error.

## The fix: use a generic "Aplicativo" (App) service instead

1. In EasyPanel, click **+ Servico -> Aplicativo**, give it a name (e.g. `redis-stack-rag`).
2. **Fonte -> Imagem Docker**: `redis/redis-stack-server:latest` (the server-only image, no
   RedisInsight UI — lighter than `redis/redis-stack:latest`, same modules).
3. **Ambiente**: add `REDIS_PASSWORD=<generate a strong password>` (used only for your own
   reference/scripts — it is NOT read automatically by the image's entrypoint, see next step).
4. **Avancado -> Comando**: this field on an App-type service DOES become the real container
   command (unlike the Redis-type template). Set it to:
   ```
   redis-stack-server --requirepass <same password as REDIS_PASSWORD>
   ```
   The `redis-stack-server` wrapper script (found at `/usr/bin/redis-stack-server` inside the
   container) appends all of *this* command's own trailing args (`$*`) after its own
   `--loadmodule` flags for rediscompat/redisearch/rejson/redistimeseries/redisbloom/redisgears
   — so `--requirepass` here reaches the real process correctly. (Note: the image's own
   `REDIS_ARGS` env var is NOT read by this script — don't rely on it; use the Comando field.)
5. **Armazenamento -> Adicionar Montagem de Volume**: name `redis-data`, mount path `/data`, so
   data survives restarts.
6. **Implantar**. Check the logs — you should see each module loading (`ReJSON`, `search`,
   `bf`, `redisgears_2`, ...) ending in `Ready to accept connections tcp`.
7. Verify from the service's Bash console:
   ```
   redis-cli -a "$REDIS_PASSWORD" MODULE LIST 2>/dev/null
   ```
   should list 6 modules (rediscompat, ReJSON, search, timeseries, bf, redisgears_2). Don't
   trust a run with `2>/dev/null` alone if auth might be silently failing — also sanity check
   with `redis-cli -a "$REDIS_PASSWORD" DBSIZE` or an explicit `PING`/`AUTH` first, since a
   missing password (`ERR ... without any password configured`) can otherwise hide behind the
   suppressed stderr.
8. The internal hostname other services (n8n) reach this on is
   `<project>_<service-name>` (e.g. `meu-projeto_redis-stack-rag`) on port 6379 — same
   convention as the old Redis-type service, no "Dominios"/port publish needed for
   internal-only access. Delete the auto-created HTTP domain entry (port 80) since Redis is
   TCP, not HTTP.

## n8n side: credential + populating the index

1. Create/update a **Redis** credential in n8n: Host = the internal hostname above, Port 6379,
   Password = the one you set, **User left blank** (password-only auth; a non-empty "User"
   field with value `default` can trigger confusing AUTH errors on some redis-stack builds —
   leave it blank and "Retry" the connection test until it's green before saving).
2. Build a small "RAG Setup" workflow: Manual Trigger -> Code node producing the FAQ/knowledge
   documents (`{ text, titulo }` per item) -> `@n8n/n8n-nodes-langchain.vectorStoreRedis` node
   in **insert** mode, with a `documentDefaultDataLoader` (jsonMode `allInputData`, pointers
   `/text`) and an `embeddingsGoogleGemini` node as its `documentLoader`/`embedding` subnodes.
   Give the index a fixed name (`redisIndex.value`, e.g. `acto_knowledge_base`) and a
   `keyPrefix` (e.g. `acto_kb:`).
3. **First-ever run**: set `options.overwriteDocuments = false`. On the very first insert the
   index doesn't exist yet, and `overwriteDocuments: true` makes the node try to drop the
   index first (`FT.DROPINDEX`), which throws `Unknown Index name` and aborts the whole node
   before it ever creates anything. Run once with it `false` (this creates the index and
   inserts the docs successfully), then flip it back to `true` for all future re-runs (now the
   drop-then-recreate cycle works because the index exists).
4. Verify with `FT.INFO <index-name>` and `DBSIZE` in the Redis console — confirms number of
   indexed vectors and the HNSW algorithm/attributes.

## Wiring the vector store into an existing AI Agent as a RAG tool

To let an existing `@n8n/n8n-nodes-langchain.agent` node (e.g. a DM/WhatsApp assistant)
consult the knowledge base, add two nodes and two connections via the n8n MCP
`update_workflow` (or manually):

1. `@n8n/n8n-nodes-langchain.embeddingsGoogleGemini` node (own instance, separate from the
   one used by the Setup workflow — it just needs the same `googlePalmApi` credential).
2. `@n8n/n8n-nodes-langchain.vectorStoreRedis` node in **retrieve-as-tool** mode, same
   `redisIndex.value`/`keyPrefix` as the Setup workflow, with a clear `toolDescription` (in
   the agent's own language) telling the LLM when to call it — e.g. "search the ACTO Method
   knowledge base for FAQ answers; use this before saying you don't know something." Same
   Redis credential as above.
3. Connect `embeddings -> vectorStore` with connection type `ai_embedding`.
4. Connect `vectorStore -> agent` with connection type `ai_tool` (this is what actually plugs
   it into the agent's tool list — no change needed to the agent node's own parameters/prompt
   unless you want to explicitly mention the tool in the system message).
5. Publish the workflow (`publish_workflow`) — an active/live workflow needs the new version
   published to take effect, editing the draft alone is not enough.

## Quick troubleshooting checklist

- `FT.DROPINDEX`/`FT.CREATE`/"unknown command" errors in n8n execution -> Redis doesn't have
  RediSearch loaded -> check `MODULE LIST`, almost certainly the EasyPanel "Redis" service-type
  Comando-field trap above.
- `ERR AUTH <password> called without any password configured for the default user` when
  testing the n8n credential -> the Redis instance has no `requirepass` set -> check the
  service's actual running command/args (`ps aux | grep redis`, or the Comando field on an
  App-type service) — don't trust `REDIS_ARGS`/similar env vars unless you've confirmed the
  entrypoint script actually reads them.
- `Unknown Index name` on a vectorStore **insert** node with `overwriteDocuments: true` -> the
  index doesn't exist yet -> run once with it `false`, then switch back to `true`.
- Always sanity-check `redis-cli -a "$PASS" ... 2>/dev/null` results — piping stderr to
  /dev/null can hide an AUTH failure while an unrelated command still "succeeds" against an
  unauthenticated connection.
