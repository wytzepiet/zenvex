# AI-generated reference code

This directory contains the AI-generated implementation that was moved here for reference.
Build it yourself. Use these files only when you're stuck and want to see one possible approach.

## What you need to implement

Roughly in dependency order — earlier items are needed by later ones.

### 1. Types (`types/`)
- **`relations.ts`** — Relation descriptor types (`OneDescriptor`, `ManyDescriptor`, `ThroughDescriptor`). These are the data structures that `defineRelations` produces.
- **`queryOptions.ts`** — Types for `findMany`/`findFirst` options: `with`, `select`, `omit`, `filter`, `order`, `limit`, `paginate`, `computed`.
- **`zen.ts`** — The `Zen` type that narrows based on whether ctx has a reader or writer. This is the main public type users import.
- **`index.ts`** — Re-exports.

### 2. Range queries (`range.ts`)
- The `q` builder: `q.gt()`, `q.gte()`, `q.lt()`, `q.lte()` with chaining.
- Just data — `{ lower?: { op, value }, upper?: { op, value } }`.
- Type-level enforcement: calling `gt()` should only expose `lt()`/`lte()` (and vice versa).

### 3. defineRelations (`relations/defineRelations.ts`)
- Takes schema + per-table callbacks, returns typed relation descriptors.
- `r.one.tableName({ by })`, `r.many.tableName(opts?)`, `r.many.tableName({ through })`.
- Auto-resolves indexes for `r.many` (find index on target whose first field is a `v.id()` pointing back).

### 4. Relation resolution (`relations/resolve.ts`)
- Given a doc and its relation config, resolve `with: { author: true }` etc.
- `r.one` → `ctx.db.get(doc[fk])`
- `r.many` → index query on target table
- `r.many.through` → query join table, batch get targets, attach `pivot` data
- Recursive for nested `with`.

### 5. Proxy chain (`query/`)
- **`tableProxy.ts`** — `zen.posts` traps the table name. Known methods go to implementations, anything else becomes an index name → index proxy.
- **`queryBuilder.ts`** — Holds table + index + args. Terminal methods: `findMany`, `findFirst`. Applies `with`, `select`, `omit`, `filter`, `order`, `limit`, `paginate`, `computed`.

### 6. createZen (`createZen.ts`)
- Single entry point. Returns a Proxy where property access gives you a table proxy.
- Narrows return type based on ctx: reader → read-only, writer → + insert/patch/delete/upsert.

### 7. Write methods
- `insert` — thin wrapper around `ctx.db.insert()`
- `patch` — thin wrapper around `ctx.db.patch()`
- `upsert` — find-or-create: `null` → insert, exists → patch
- `delete` — triggers cascading deletes based on relation config
- `findByIds` — batch `ctx.db.get()` via `Promise.all`

## The hard parts

- **Proxy typing** — TypeScript doesn't infer Proxy shapes. You'll need some casts, but keep them minimal and documented.
- **Index arg inference** — Positionally mapping args to index fields with the last one optionally being a range marker. Getting the types right here is tricky.
- **Zen type narrowing** — Making `Zen` expose write methods only when ctx is a writer, while keeping everything generic over the schema/relations.
- **Nested `with` types** — The return type of a query with `{ with: { author: { with: { posts: true } } } }` needs to recursively merge relation results into the doc type.

## What's already done

- `defineJoinTable` — in `src/relations/defineJoinTable.ts`, you wrote this yourself.
