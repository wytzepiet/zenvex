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
bun install          # install dependencies
bun test             # run tests
bun run build        # build for publishing
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
import schema from "./schema";
import { relations } from "./relations";
import { computed } from "./computed";

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
  return zen.posts.by_slug(slug).findFirst({ with: { author: true } });
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

- Known methods (`findMany`, `findFirst`, `findByIds`, `delete`, `insert`, `patch`, `upsert`, `withIndex`) → return their implementations directly
- Anything else → treated as an index name, delegates to § Index Proxy

---

## § Index Proxy

Second proxy layer. `zen.posts.by_author` traps the index name, returns a callable function.

```typescript
zen.posts.by_author; // → function expecting positional args
zen.posts.by_author(userId); // → query builder (§ Query Builder)
```

Positional args are equality values for the index fields, in order. These map to `.withIndex("by_author", (q) => q.eq("authorId", userId))` under the hood.

Multi-field indexes:

```typescript
zen.posts.by_author_status(userId, "published");
// → .withIndex("by_author_status", (q) => q.eq("authorId", userId).eq("status", "published"))
```

---

## § Query Builder

Third proxy layer. Holds table name, index name, and args. Exposes terminal methods.

```typescript
// findMany — returns array
await zen.posts.by_author(userId).findMany();
await zen.posts.by_author(userId).findMany({ with: { author: true } });

// findFirst — returns single doc or null
await zen.posts.by_slug("hello").findFirst();

// Full table scan (no index)
await zen.posts.findMany();
await zen.posts.findFirst();
```

### Query options

```typescript
zen.posts.by_author(userId).findMany({
  with: { author: true, comments: true }, // § Relation Resolution
  select: ["_id", "title", "slug"], // field selection (or use omit)
  filter: (q) => q.gt(q.field("likes"), 10), // native Convex filter syntax
  order: "desc", // maps to .order()
  limit: 5, // maps to .take()
});
```

`select` and `omit` are mutually exclusive.

### Pagination

When `paginate` is present, return type changes from `Doc[]` to `{ data: Doc[], cursor: string, hasMore: boolean }`.

```typescript
const page = await zen.posts.by_author(userId).findMany({
  with: { author: true },
  paginate: { cursor, numItems: 20 },
});
// page.data, page.cursor, page.hasMore
```

### Range queries (escape hatch)

For `gt`, `gte`, `lt`, `lte` — use `.withIndex()` which mirrors native Convex:

```typescript
zen.posts
  .withIndex("by_author_date", (q) =>
    q.eq("authorId", userId).gt("date", someDate),
  )
  .findMany();
```

---

## § defineRelations

Parses the user's relation config into introspectable descriptors. Each table gets its own callback so TypeScript can type `r` per table.

```typescript
// convex/relations.ts
import { defineRelations } from "zenvex";
import schema from "./schema";

export const relations = defineRelations(schema, {
  posts: (r) => ({
    author: r.one.users({ by: "authorId" }),
    comments: r.many.comments.by_postId({ onDelete: "cascade" }),
  }),
  comments: (r) => ({
    post: r.one.posts({ by: "postId" }),
    author: r.one.users({ by: "authorId" }),
  }),
  users: (r) => ({
    posts: r.many.posts.by_author({ onDelete: "cascade" }),
    groups: r.many.groups.through("userGroups"),
  }),
  groups: (r) => ({
    members: r.many.users.through("userGroups"),
  }),
});
```

Defined in a separate file from the schema. Reasons:

- Schema is vanilla Convex (untouched)
- Circular references (posts→users→posts) are fine with per-table callbacks
- Different concerns: schema = db, relations = app logic

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
comments: r.many.comments.by_postId({ onDelete: "cascade" }),
```

Resolution: `ctx.db.query("comments").withIndex("by_postId", (q) => q.eq("postId", doc._id)).collect()`.

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
zen.posts.by_author(userId).findMany({
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
// convex/computed.ts
import { defineComputed } from "zenvex";
import schema from "./schema";

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
const post = await zen.posts.by_slug("hello").findFirst();
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
- `.index("by_usersId", ["usersId"])`
- `.index("by_groupsId", ["groupsId"])`

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
// [{ indexDescriptor: "by_usersId", fields: ["usersId", "_creationTime"] }]
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
const id = await zen.users.upsert(await zen.users.by_email(email).findFirst(), {
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
import schema from "./schema";
import { relations } from "./relations";
import { computed } from "./computed";

export const zenOptions = { schema, relations, computed } as const;

export type ZenReader = CreateZenReader<typeof zenOptions>;
export type ZenWriter = CreateZenWriter<typeof zenOptions>;
```

`ZenWriter` extends `ZenReader` with write methods (delete, insert, patch, upsert).

```typescript
import type { ZenReader } from "./zen";

async function getPostWithAuthor(zen: ZenReader, slug: string) {
  return zen.posts.by_slug(slug).findFirst({ with: { author: true } });
}
```

---

## Convex Constraints

- Max 16 fields per index
- Max 32 indexes per table
- `_creationTime` is automatically appended to every index
- Equality fields must come first; only the last field can use range operators
- `.filter()` runs during iteration (streaming), not after collection
- `.filter().take(n)` correctly gives n filtered results
- Mutations are transactions — all writes atomic
- No SQL, no JOIN, no COUNT, no aggregates
- `v.id()` validators have `.kind === "id"` and `.tableName` at runtime

---

## User's File Structure

```
convex/
  schema.ts      ← vanilla Convex (untouched)
  relations.ts   ← defineRelations(schema, { ... })
  computed.ts    ← defineComputed(schema, { ... })
  zen.ts         ← zenOptions + ZenReader/ZenWriter types
  functions.ts   ← customQuery/customMutation using zenOptions
```

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

- **Custom filter syntax** — use Convex's native filter builder
- **Soft delete** — too opinionated, users implement manually
- **Client extensions / middleware / hooks** — not v1
- **Model methods** (Prisma `$extends.model`) — just use functions
- **Computed fields depending on relations** — computed = sync, document-only
- **`reduce` on relations** — changes semantic meaning of the field
- **`map` in query options** — use `.map()` on results in JS
- **Auto-resolving indexes for queries** — explicit by design (only `through()` auto-resolves)
- **`where` object syntax** — index shorthand is the API, keeps index usage visible
