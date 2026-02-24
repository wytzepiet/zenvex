# Zenvex

Type-safe relations, cascading deletes, and ergonomic index queries for [Convex](https://convex.dev). No codegen — all types inferred via generics.

```typescript
const thread = await zen.threads.find(threadId, {
  with: {
    author: true,
    posts: { with: { author: true }, order: "desc", take: 10 },
    tags: true,
  },
});

// thread.author.name, thread.posts[0].author.email, thread.tags[0].pivot.order
```

## Features

- **Relations** — `r.one`, `r.many`, `r.many.through` with full autocomplete on table names, fields, and indexes
- **Cascading deletes** — `"cascade"`, `"restrict"`, `"setNull"`, `"noAction"` per relation
- **Index queries** — Positional args map to index fields with range support
- **Eager loading** — Nested `with` specs with per-relation `filter`, `order`, `take`, `select`/`omit`
- **Cursor pagination** — Add `cursor` to `findMany` to switch from `Doc[]` to `PaginationResult`
- **Computed fields** — `add` callbacks augment docs with derived data
- **Write operations** — `insert`, `patch`, `delete`, `upsert` with full type safety
- **Join tables** — `defineJoinTable` helper with auto-generated fields and indexes
- **Zero codegen** — Types flow from your Convex schema through generics and proxies

## Install

```bash
npm install zenvex convex convex-helpers
```

## Quick Start

### 1. Define your schema and relations

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { defineJoinTable, defineRelations } from "zenvex";

const schema = defineSchema({
  users: defineTable({
    name: v.string(),
    email: v.string(),
  }).index("byEmail", ["email"]),

  posts: defineTable({
    title: v.string(),
    body: v.string(),
    authorId: v.id("users"),
  }).index("byAuthor", ["authorId"]),

  tags: defineTable({ name: v.string() }),

  postTags: defineJoinTable("posts", "tags"),
});

export default schema;

export const relations = defineRelations(schema, {
  users: (r) => ({
    posts: r.many.posts({ onDelete: "cascade" }),
  }),
  posts: (r) => ({
    author: r.one.users("authorId"),
    tags: r.many.tags({ through: "postTags" }),
  }),
  tags: (r) => ({
    posts: r.many.posts({ through: "postTags" }),
  }),
});
```

### 2. Create custom functions with `zen` in context

```typescript
// convex/functions.ts
import { customQuery, customMutation, customCtx } from "convex-helpers/server/customFunctions";
import { query as baseQuery, mutation as baseMutation } from "./_generated/server";
import { createZen } from "zenvex";
import { relations } from "./schema";

export const query = customQuery(
  baseQuery,
  customCtx(async (ctx) => ({
    zen: createZen(ctx, relations),
  })),
);

export const mutation = customMutation(
  baseMutation,
  customCtx(async (ctx) => ({
    zen: createZen(ctx, relations),
  })),
);
```

### 3. Use `zen` in your functions

```typescript
// convex/queries.ts
import { v } from "convex/values";
import { query } from "./functions";

export const getPost = query({
  args: { id: v.id("posts") },
  handler: async ({ zen }, { id }) => {
    return zen.posts.find(id, {
      with: { author: true, tags: true },
    });
  },
});

export const listPosts = query({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async ({ zen }, { cursor }) => {
    return zen.posts.findMany({
      with: { author: true },
      order: "desc",
      take: 20,
      cursor,
    });
  },
});
```

```typescript
// convex/mutations.ts
import { v } from "convex/values";
import { mutation } from "./functions";

export const createPost = mutation({
  args: { title: v.string(), body: v.string(), authorId: v.id("users") },
  handler: async ({ zen }, args) => {
    return zen.posts.insert(args);
  },
});

export const deletePost = mutation({
  args: { id: v.id("posts") },
  handler: async ({ zen }, { id }) => {
    await zen.posts.delete(id); // cascades per relation config
  },
});
```

## API

### `defineRelations(schema, config)`

Define relations per table. The `r` builder provides autocomplete for table names, FK fields, and index names.

#### `r.one`

Many-to-one via a foreign key field. Resolves to `ctx.db.get(doc.fkField)`.

```typescript
posts: (r) => ({
  author: r.one.users("authorId"),      // required FK
  parent: r.one.posts("parentId"),       // optional FK → null when missing
})
```

#### `r.many`

One-to-many via an index on the target table. The index is auto-resolved when there's exactly one index whose first field is a `v.id()` pointing to the source table. Use `{ index }` when ambiguous.

```typescript
users: (r) => ({
  posts: r.many.posts({ onDelete: "cascade" }),
  threads: r.many.threads({ index: "byAuthor", onDelete: "cascade" }),
})
```

#### `r.many.through`

Many-to-many via a join table. Auto-resolves source/target fields and indexes from the join table schema. Extra join table fields appear under `pivot` at query time.

```typescript
threads: (r) => ({
  tags: r.many.tags({ through: "threadTags" }),
})

users: (r) => ({
  // Self-referential: `index` disambiguates which field is the source lookup
  followers: r.many.users({ through: "userFollows", index: "byFollowee" }),
  following: r.many.users({ through: "userFollows", index: "byFollower" }),
})
```

#### `onDelete`

| Action | Behavior |
|---|---|
| `"restrict"` | Throws if related documents exist (default) |
| `"cascade"` | Deletes all related documents recursively |
| `"setNull"` | Sets the FK field to `undefined` on related documents |
| `"noAction"` | Skips — no enforcement, no cleanup |

For `through` relations, join rows are always cleaned up (except `"noAction"`).

### `defineJoinTable(tableA, tableB, extraFields?)`

Generates a join table definition with ID fields, indexes, and optional extra fields.

```typescript
const postTags = defineJoinTable("posts", "tags");
// Generates: postsId: v.id("posts"), tagsId: v.id("tags")
// Indexes:   byPostsId, byTagsId

const threadTags = defineJoinTable("threads", "tags", {
  order: v.number(),  // extra field — accessible via `pivot.order`
});
```

Does not support same-table joins (field names would collide). Define those manually.

### `createZen(ctx, relations)`

Creates the `zen` proxy from a Convex context. `QueryCtx` gives read-only access, `MutationCtx` adds write methods.

```typescript
const zen = createZen(ctx, relations);
```

### Table proxy

Access tables directly on the `zen` object. Index methods are available as properties.

```typescript
// Full table scan
await zen.users.findMany()

// By index — positional args map to index fields
await zen.posts.byAuthor(userId).findMany()
await zen.threads.byCategoryCreatedAt(categoryId).findMany({ order: "desc" })

// Multi-field index with range
await zen.threads.byCategoryCreatedAt(categoryId, q.gte(startTime).lt(endTime)).findMany()
```

### Read methods

#### `find(id, opts?)`

Fetch a single document by ID.

```typescript
const post = await zen.posts.find(postId);
const post = await zen.posts.find(postId, {
  with: { author: true },
  select: ["_id", "title"],
});
```

#### `findMany(opts?)`

Fetch multiple documents. Returns `Doc[]` by default, or `PaginationResult` when `cursor` is present.

```typescript
// All documents
await zen.users.findMany()

// With options
await zen.posts.byAuthor(userId).findMany({
  filter: (post) => post.body.length > 100,
  order: "desc",
  take: 10,
  select: ["_id", "title", "body"],
  with: { author: true },
  add: (post) => ({ preview: post.body.slice(0, 200) }),
})

// Paginated
const page = await zen.posts.findMany({ take: 20, cursor: null });
// page.page, page.isDone, page.continueCursor
```

#### `findFirst(opts?)`

Like `findMany` but returns the first match or `null`.

```typescript
const user = await zen.users.byEmail("alice@example.com").findFirst();
```

### Query options

| Option | Type | Description |
|---|---|---|
| `with` | `WithSpec` | Eager load relations (nested specs supported) |
| `filter` | `(doc) => boolean` | JS predicate filter (via convex-helpers) |
| `order` | `"asc" \| "desc"` | Sort order |
| `take` | `number` | Limit results |
| `select` | `string[]` | Include only these fields |
| `omit` | `string[]` | Exclude these fields |
| `add` | `(doc) => object` | Augment docs with computed fields |
| `cursor` | `string \| null` | Enable cursor pagination (`null` for first page) |

### Range markers (`q`)

For multi-field indexes, the last positional argument can be a range marker.

```typescript
import { q } from "zenvex";

zen.threads.byCategoryCreatedAt(categoryId, q.gt(yesterday)).findMany()
zen.threads.byCategoryCreatedAt(categoryId, q.gte(start).lt(end)).findMany()
```

Available: `q.gt`, `q.gte`, `q.lt`, `q.lte` — chainable for bounded ranges.

### Write methods

Available when `createZen` receives a `MutationCtx`.

```typescript
// Insert
const id = await zen.users.insert({ name: "Alice", email: "alice@example.com" });

// Patch
await zen.users.patch(userId, { name: "Alice Updated" });

// Upsert — takes existing doc or null, not a filter
const id = await zen.users.upsert(existingUser, { name: "Alice", email: "alice@example.com" });

// Delete — triggers cascading deletes per relation config
await zen.threads.delete(threadId);
```

### Nested `with` specs

Relations can be nested and configured independently.

```typescript
await zen.threads.find(threadId, {
  with: {
    author: true,
    category: true,
    posts: {
      filter: (p) => !p.parentId,  // top-level posts only
      order: "asc",
      take: 20,
      with: {
        author: true,
        replies: { take: 5, with: { author: true } },
      },
    },
    tags: true,  // through relation — each tag has `.pivot.order`
  },
});
```

### Computed fields with `add`

```typescript
await zen.categories.findMany({
  with: { threads: true },
  add: (category) => ({
    threadCount: category.threads.length,
  }),
});
// Result: [{ name: "Tech", threads: [...], threadCount: 12 }, ...]
```

`add` callbacks receive the document with loaded relations, so you can derive values from related data.

## Type helpers

Export your `Zen` types for use across your codebase:

```typescript
// convex/zen.ts
import type { Zen } from "zenvex";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { relations } from "./schema";

export type ZenReader = Zen<QueryCtx, typeof relations>;
export type ZenWriter = Zen<MutationCtx, typeof relations>;
```

## License

MIT
