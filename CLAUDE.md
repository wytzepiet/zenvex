# CLAUDE.md — Zenvex

## What Is This

Zenvex is a lightweight, type-safe query layer for Convex. It adds relations, computed fields, cascading deletes, and index query ergonomics. It does NOT reimplement things Convex already does well — it passes those through.

**Package name:** `zenvex`
**Runtime:** Bun
**Language:** TypeScript (strict)
**Test runner:** `bun test`
**Peer dependencies:** `convex`, `convex-helpers`
**No codegen** — all types inferred via TypeScript generics + Proxy objects at runtime.

## Commands

```bash
bun install          # install dependencies (run from workspace root)
bun test             # run tests
bun run build        # build — must run after source changes for examples/ to pick up new types
bunx tsc --noEmit    # typecheck
```

## Architecture

```
src/
  index.ts                  — public API exports
  createZen.ts              — § createZen
  proxy/
    tableProxy.ts           — § Table Proxy
    indexProxy.ts           — § Index Proxy
    queryBuilder.ts         — § Query Builder
  relations/
    defineRelations.ts      — § defineRelations
    resolveOne.ts           — § r.one
    resolveMany.ts          — § r.many
    resolveThrough.ts       — § r.many.through
    cascade.ts              — § Cascading Deletes
  computed/
    defineComputed.ts       — § defineComputed
    apply.ts                — § Computed Field Resolution
  schema/
    defineJoinTable.ts      — § defineJoinTable
    introspect.ts           — § Runtime Introspection
  mutations/
    delete.ts               — § zen.table.delete
    upsert.ts               — § zen.table.upsert
    insert.ts               — § zen.table.insert
    patch.ts                — § zen.table.patch
  types/
    index.ts                — all public type exports
    zen.ts                  — § ZenQueryCtx / ZenMutationCtx
    relations.ts            — relation descriptor types
    computed.ts             — computed field types
    queryOptions.ts         — findMany/findFirst option types
tests/
  — mirrors src/ structure
```

Each `§` references a chapter below.

---

## § createZen

Two functions: `createZenReader` (queries) and `createZenWriter` (mutations). Both take `ctx.db` and a shared options object.

```typescript
// convex/zen.ts
import schema, { relations, computed } from "./schema";

export const zenOptions = { schema, relations, computed } as const;

export type ZenReader = CreateZenReader<typeof zenOptions>;
export type ZenWriter = CreateZenWriter<typeof zenOptions>;
```

```typescript
// convex/functions.ts
import { zenOptions } from "./zen";

export const query = customQuery(
  baseQuery,
  customCtx(async (ctx) => ({
    zen: createZenReader(ctx.db, zenOptions),
  })),
);

export const mutation = customMutation(
  baseMutation,
  customCtx(async (ctx) => ({
    zen: createZenWriter(ctx.db, zenOptions),
  })),
);
```

Use the types in helper functions:

```typescript
import type { ZenReader } from "./zen";

async function getPostWithAuthor(zen: ZenReader, slug: string) {
  return zen.posts.bySlug(slug).findFirst({ with: { author: true } });
}
```

`createZenReader` takes a `GenericDatabaseReader` → returns read-only zen (findMany, findFirst, findByIds).
`createZenWriter` takes a `GenericDatabaseWriter` → returns full zen (+ insert, patch, delete, upsert).

Schema is required. Relations and computed are optional — progressive adoption:

```typescript
export const zenOptions = { schema } as const; // index shorthand only
export const zenOptions = { schema, relations } as const; // + relations
export const zenOptions = { schema, relations, computed } as const; // + computed fields
```

---

## § Table Proxy

First proxy layer. `zen.posts` traps the table name via `get`.

```typescript
zen.posts; // → table proxy for "posts"
zen.users; // → table proxy for "users"
```

The table proxy intercepts property access:

- Known methods (`findMany`, `findFirst`, `findByIds`, `delete`, `insert`, `patch`, `upsert`) → return their implementations directly
- Anything else → treated as an index name, delegates to § Index Proxy

---

## § Index Proxy

Second proxy layer. `zen.posts.byAuthor` traps the index name, returns a callable function.

```typescript
zen.posts.byAuthor; // → function expecting positional args
zen.posts.byAuthor(userId); // → query builder (§ Query Builder)
```

Positional args map to index fields in order. Plain values become equality constraints. These map to `.withIndex("byAuthor", (q) => q.eq("authorId", userId))` under the hood.

Multi-field indexes:

```typescript
zen.posts.byAuthorStatus(userId, "published");
// → .withIndex("byAuthorStatus", (q) => q.eq("authorId", userId).eq("status", "published"))
```

Args are optional — provide any prefix of the index fields, or none at all (useful when you just need the index for ordering):

```typescript
zen.posts.byAuthorDate().findMany({ order: "desc" });         // no args, index used for ordering only
zen.posts.byAuthorDate(userId).findMany();                     // just first field
zen.posts.byAuthorDate(userId, someDate).findMany();           // both fields, equality
```

### Range queries

The last positional arg can be a range marker instead of a plain value, using the `q` builder exported from `zenvex`:

```typescript
import { q } from "zenvex";

zen.posts.byDate(q.gte(start).lte(end)).findMany();
zen.posts.byAuthorDate(userId, q.gt(someDate)).findMany();
```

`q.gt()` / `q.gte()` returns a type that only exposes `.lt()` / `.lte()` (and vice versa), matching Convex's constraint that lower bound comes before upper bound. Chaining is optional — a single bound like `q.gt(value)` is valid.

At runtime, the range marker is just data (`{ lower?: { op, value }, upper?: { op, value } }`). It gets applied inside the `withIndex` callback after all equality args.

You cannot skip fields in the middle (Convex constraint).

### CamelCase index naming

Index names become method names, so camelCase is recommended:

```typescript
.index("byAuthor", ["authorId"])
// → zen.posts.byAuthor(userId)
```

Not enforced — zenvex reads whatever names you define. But camelCase reads like a natural API.

---

## § Query Builder

Third proxy layer. Holds table name, index name, and args. Exposes terminal methods.

```typescript
// findMany — returns array
await zen.posts.byAuthor(userId).findMany();
await zen.posts.byAuthor(userId).findMany({ with: { author: true } });

// findFirst — returns single doc or null
await zen.posts.bySlug("hello").findFirst();

// Full table scan (no index)
await zen.posts.findMany();
await zen.posts.findFirst();
```

### Query options

```typescript
zen.posts.byAuthor(userId).findMany({
  with: { author: true, comments: true }, // § Relation Resolution
  select: ["_id", "title", "slug"], // field selection (or use omit)
  filter: (post) => post.likes > 10 && post.tags.includes("happy"), // plain JS via convex-helpers
  order: "desc", // maps to .order()
  limit: 5, // maps to .take()
});
```

`select` and `omit` are mutually exclusive.

### Pagination

When `paginate` is present, return type changes from `Doc[]` to `{ data: Doc[], cursor: string, hasMore: boolean }`.

```typescript
const page = await zen.posts.byAuthor(userId).findMany({
  with: { author: true },
  paginate: { cursor, numItems: 20 },
});
// page.data, page.cursor, page.hasMore
```

---

## § defineRelations

Parses the user's relation config into introspectable descriptors. Each table gets its own callback so TypeScript can type `r` per table.

```typescript
// convex/schema.ts (named export alongside schema)
export const relations = defineRelations(schema, {
  posts: (r) => ({
    author: r.one.users({ by: "authorId" }),
    comments: r.many.comments.byPostId({ onDelete: "cascade" }),
  }),
  comments: (r) => ({
    post: r.one.posts({ by: "postId" }),
    author: r.one.users({ by: "authorId" }),
  }),
  users: (r) => ({
    posts: r.many.posts.byAuthor({ onDelete: "cascade" }),
    groups: r.many.groups.through("userGroups"),
  }),
  groups: (r) => ({
    members: r.many.users.through("userGroups"),
  }),
});
```

Defined as a named export in `schema.ts` alongside the schema default export. Schema stays vanilla Convex (untouched). Circular references (posts→users→posts) are fine with per-table callbacks. User can split into a separate file if preferred.

---

## § r.one

One-to-one / many-to-one. The `by` field is on the **current** table, holding the target's `_id`.

```typescript
author: r.one.users({ by: "authorId" }),
```

Resolution: `ctx.db.get(doc.authorId)`. Direct ID lookup, no index needed.

---

## § r.many

One-to-many. Queries the **target** table by a named index. The index name matches the query builder pattern.

```typescript
comments: r.many.comments.byPostId({ onDelete: "cascade" }),
```

Resolution: `ctx.db.query("comments").withIndex("byPostId", (q) => q.eq("postId", doc._id)).collect()`.

Options: `{ onDelete: "cascade" | "setNull" | "restrict" }`.

---

## § r.many.through

Many-to-many via a join table. Auto-resolves the join using § Runtime Introspection.

```typescript
groups: r.many.groups.through("userGroups"),
```

Resolution steps:

1. Inspect `userGroups` validator fields → find `v.id()` field with `.tableName === "users"` (source) → that's the lookup field
2. Find `v.id()` field with `.tableName === "groups"` (target) → that's the FK to resolve
3. Find an index on `userGroups` starting with the source field (via `.indexes()`)
4. Query: `user._id` → query `userGroups` by source index → read target FK → `ctx.db.get(targetId)`

### Pivot data

Extra fields on the join table appear under `pivot`:

```typescript
const user = await zen.users.findFirst({ with: { groups: true } });
// user.groups → [{ _id: "...", name: "Devs", pivot: { role: "admin", joinedAt: 123 } }]
```

### Cascade behavior

`through()` always deletes join table rows when source is deleted. Target table is never touched. No option needed.

---

## § Relation Resolution

When processing `with` in a query:

1. Execute main query (index or full scan)
2. For each result doc, resolve relations in parallel (`Promise.all`):
   - `r.one` → `ctx.db.get(doc[fieldName])`
   - `r.many` → index query on target table
   - `through` → query join table → batch `ctx.db.get()` for targets
3. Apply nested `with` recursively on relation results
4. Apply computed fields (sync)
5. Apply `select`/`omit` to final shape

### Nested relation options

```typescript
zen.posts.byAuthor(userId).findMany({
  with: {
    comments: {
      with: { author: true },
      limit: 5,
      order: "desc",
    },
  },
});
```

---

## § defineComputed

Sync, pure transforms of the document's own data. Always included on results — no `with` needed.

```typescript
// convex/schema.ts (named export alongside schema)
export const computed = defineComputed(schema, {
  posts: {
    url: (post) => `/blog/${post.slug}`,
    excerpt: (post) => post.content.slice(0, 200),
  },
  users: {
    fullName: (user) => `${user.firstName} ${user.lastName}`,
  },
});
```

```typescript
const post = await zen.posts.bySlug("hello").findFirst();
post.url; // → "/blog/hello" — always there
post.excerpt; // → "Lorem ipsum..." — always there
```

Rules:

- Sync only (no async, no db access)
- Only access the document's own fields
- Cannot depend on relations
- Zero cost — just a function call per doc

---

## § Computed Field Resolution

After all relations are resolved on a document, run each computed field function and merge results onto the document. Runs after relation resolution, before `select`/`omit`.

---

## § defineJoinTable

Schema helper. Generates a join table definition with ID fields and indexes.

```typescript
import { defineJoinTable } from "zenvex";

export default defineSchema({
  users: defineTable({ name: v.string() }),
  groups: defineTable({ name: v.string() }),

  userGroups: defineJoinTable("users", "groups", {
    role: v.string(),
    joinedAt: v.number(),
  }),
});
```

Generates:

- `usersId: v.id("users")` field
- `groupsId: v.id("groups")` field
- `.index("byUsersId", ["usersId"])`
- `.index("byGroupsId", ["groupsId"])`

Field naming: `${tableName}Id` — no singularization. User never types these names. Third argument (extra fields) is optional.

---

## § Runtime Introspection

Two Convex APIs used at setup time:

**Field validators:**

```typescript
schema.tables.userGroups.validator.fields;
// { usersId: VId<"users">, groupsId: VId<"groups">, role: VString }
// v.id() validators have .kind === "id" and .tableName
```

**Index metadata (experimental):**

```typescript
schema.tables.userGroups.indexes();
// [{ indexDescriptor: "byUsersId", fields: ["usersId", "_creationTime"] }]
```

Used by § r.many.through to auto-resolve join table indexes. If Convex changes this API, `through()` resolution needs updating.

---

## § Cascading Deletes

When `zen.table.delete(id)` is called:

1. Load the document
2. Walk the relation graph from relations config
3. For `onDelete: "cascade"` → recursively delete related docs (depth-first)
4. For `onDelete: "setNull"` → patch related docs, set FK to null
5. For `onDelete: "restrict"` → check for related docs, throw if any exist
6. For `through` relations → always delete join table rows
7. Delete the source document

All within a single Convex mutation transaction (atomic).

```typescript
// Deletes user, their posts, each post's comments
await zen.users.delete(userId);
```

---

## § zen.table.insert

Thin wrapper around `ctx.db.insert()`.

```typescript
const postId = await zen.posts.insert({
  title: "Hello",
  slug: "hello",
  content: "...",
  authorId: userId,
});
```

---

## § zen.table.patch

Thin wrapper around `ctx.db.patch()`.

```typescript
await zen.posts.patch(postId, { title: "Updated" });
```

---

## § zen.table.upsert

Find-or-create pattern. First arg is `{ _id } | null` (typically from a `findFirst`). If null → insert. If exists → patch. Returns the ID.

```typescript
const id = await zen.users.upsert(await zen.users.byEmail(email).findFirst(), {
  email,
  name,
  lastSeen: Date.now(),
});
```

Same data for both create and update. If you need different data for each case, use an if/else — it's two lines.

---

## § zen.table.delete

Triggers § Cascading Deletes based on relation config.

```typescript
await zen.posts.delete(postId);
// deletes post + all comments (if cascade configured)
```

---

## § zen.table.findByIds

Batch `ctx.db.get()` via `Promise.all`. Filters nulls, returns typed array.

```typescript
const posts = await zen.posts.findByIds([id1, id2, id3]);
// Post[] — no nulls
```

---

## § ZenQueryCtx / ZenMutationCtx

Generic types derived from the zen options object. Defined in `zen.ts` alongside the options.

```typescript
// convex/zen.ts
import {
  createZenReader,
  createZenWriter,
  CreateZenReader,
  CreateZenWriter,
} from "zenvex";
import schema, { relations, computed } from "./schema";

export const zenOptions = { schema, relations, computed } as const;

export type ZenReader = CreateZenReader<typeof zenOptions>;
export type ZenWriter = CreateZenWriter<typeof zenOptions>;
```

`ZenWriter` extends `ZenReader` with write methods (delete, insert, patch, upsert).

```typescript
import type { ZenReader } from "./zen";

async function getPostWithAuthor(zen: ZenReader, slug: string) {
  return zen.posts.bySlug(slug).findFirst({ with: { author: true } });
}
```

---

## Convex Constraints

- Max 16 fields per index
- Max 32 indexes per table
- `_creationTime` is automatically appended to every index
- Equality fields must come first; only the last field can use range operators
- `filter()` from `convex-helpers/server/filter` supports plain JS predicates, streams during iteration (see https://stack.convex.dev/complex-filters-in-convex)
- `.filter().take(n)` correctly gives n filtered results
- Mutations are transactions — all writes atomic
- No SQL, no JOIN, no COUNT, no aggregates
- `v.id()` validators have `.kind === "id"` and `.tableName` at runtime

---

## User's File Structure

```
convex/
  schema.ts      ← schema (default export), relations + computed (named exports)
  zen.ts         ← zenOptions + ZenReader/ZenWriter types
  functions.ts   ← customQuery/customMutation using zenOptions
```

Schema is the default export, relations and computed are named exports from the same file. User can split into separate files if they prefer.

---

## Testing Strategy

Monorepo with workspaces:

```
zenvex/
  packages/
    zenvex/              ← the npm package
      src/
      tests/             ← type tests, pure function tests
      package.json
  examples/
    basic-react-blog/    ← Convex project, workspace dependency on zenvex
      convex/
      tests/             ← everything that needs a real db
      package.json
  package.json           ← workspace root
```

**In `packages/zenvex/tests/`:**

- Type inference tests (`expectTypeOf` or similar)
- `defineJoinTable`: verify output structure (fields, indexes)
- Cascade graph walking: given a relation config, verify the correct delete order
- Computed field application: given a doc and computed config, verify merged output

**In `examples/basic-react-blog/tests/`:**

- Real Convex backend, real database
- Proxy behavior: verify actual queries return correct data
- Queries with `with` return correct related data
- Cascading deletes actually remove the right documents
- Upsert creates or patches correctly
- `through` relations resolve correctly
- Computed fields appear on results
- Pagination, filter, order, limit pass-throughs work

---

## What NOT to Build

These were deliberately excluded. Do not add without discussion.

- **Custom filter syntax** — plain JS predicates via `convex-helpers/server/filter` is the API
- **`.withIndex()` escape hatch** — the `q` range builder covers range queries, no separate API needed
- **Soft delete** — too opinionated, users implement manually
- **Client extensions / middleware / hooks** — not v1
- **Model methods** (Prisma `$extends.model`) — just use functions
- **Computed fields depending on relations** — computed = sync, document-only
- **`reduce` on relations** — changes semantic meaning of the field
- **`map` in query options** — use `.map()` on results in JS
- **Auto-resolving indexes for queries** — explicit by design (only `through()` auto-resolves)
- **`where` object syntax** — index shorthand is the API, keeps index usage visible
