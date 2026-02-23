# CLAUDE.md — Zenvex

Type-safe query layer for Convex. Adds relations, cascading deletes, index query ergonomics. No codegen — all types inferred via generics + Proxy.

**Runtime:** Bun | **Language:** TypeScript (strict) | **Peer:** `convex` | **Dependency:** `convex-helpers`

## Commands

```bash
bun install          # from workspace root
bun test             # run tests (Bun's built-in test runner)
bun run build        # build to dist/
bunx tsc --noEmit -p tsconfig.check.json  # typecheck src/ + tests/
```

`bun dev` (tsc --watch) runs in a separate terminal during development.

## Earlier Attempts

`packages/zenvex/.earlier-attempts/` has two prior implementations (`by-me/`, `by-ai/`) for reference. Neither is production-ready. The `by-me/` attempt drowned in `as` cast spaghetti — hence the Cast Policy.

## Code Style

Functional, immutable: `const` over `let`, `.map()`/`.filter()` over loops, new objects over mutation, pure functions where possible.

## Type Discipline

Avoid `any` and `as` casts. Prefer structural interfaces, Convex generic types, type guards. Every `as` cast must be:
1. **Classified** by kind (Kind 1: TS can't track runtime transform; Kind 2: TS can't prove generic constraint; Kind 3: Convex internal API)
2. **Minimal scope** — cast smallest expression possible
3. **Type-tested** — corresponding `expectTypeOf` test
4. **Linked** — comment references test file

Red flags: `as any`, cast without test, cast masking body errors, multiple casts in one expression. Use `as unknown as T` over `as any`.

Kind 3 casts are common throughout `resolveRelations.ts`, `cascadeDelete.ts`, `queryBuilder.ts`, `tableProxy.ts` — Convex's runtime layer uses `GenericDocument` / `Record<string, unknown>`, so casts to typed docs and IDs are unavoidable at the query execution boundary.

---

## API Overview

### defineRelations

Per-table callbacks with typed `r` builder. `r.one`/`r.many` proxies are schema-aware — autocomplete on table names, FK fields, index names. Resolution/validation at call time.

```typescript
export const relations = defineRelations(schema, {
  posts: (r) => ({
    author: r.one.users("authorId"),
    comments: r.many.comments({ onDelete: "cascade" }),
  }),
  users: (r) => ({
    posts: r.many.posts.byAuthor({ onDelete: "cascade" }),
    groups: r.many.groups.through("userGroups"),
  }),
});
```

Descriptors (`OneDescriptor`, `ManyDescriptor`, `ThroughDescriptor`) are plain data — see `src/relations/types.ts`.

### r.one

`r.one.users("authorId")` — many-to-one via FK field. Resolves to `ctx.db.get(doc.authorId)`. Optional FK → `null`.

### r.many

`r.many.comments()` — one-to-many. Index auto-resolved (finds indexes on target whose first field is `v.id()` pointing to source). Explicit `{ index }` when ambiguous. `onDelete`: `"restrict"` (default) | `"cascade"` | `"setNull"` | `"noAction"`.

### r.many.through

`r.many.tags({ through: "threadTags" })` — many-to-many via join table. Auto-resolves source/target fields and index from join table schema. For same-table joins (users↔users), `index` disambiguates which field is the source lookup.

Delete behavior depends on `onDelete`:
- Default (no `onDelete`): join rows cleaned up, targets untouched.
- `cascade`: targets deleted, then join rows cleaned up.
- `restrict`: blocks if join rows exist (nothing deleted).
- `noAction`: skips entirely (join rows left orphaned).

Extra join table fields appear under `pivot` at query time.

### createZen

Takes Convex context + relations. `QueryCtx` → read-only, `MutationCtx` → read + write.

```typescript
zen: createZen(ctx, relations)
```

### Table/Index Proxy

`zen.posts.byAuthor(userId).findMany()` — positional args map to index fields. `q` range builder for bounds. `zen.posts.findMany()` without index args is a full table scan. `findFirst` shorthand on table proxy.

### Query Options

`with` (relations), `select`/`omit`, `filter` (JS predicate via convex-helpers), `order`, `take`, `add` (augment docs with computed fields).

### Cursor Pagination

When `cursor` is present in `findMany` options (even `null` for first page), return type switches from `Doc[]` to `PaginationResult<Doc>` (`{ page, isDone, continueCursor }`).

```typescript
// No pagination — returns Doc[]
await zen.posts.findMany({ take: 10 });

// Cursor pagination — returns PaginationResult<Doc>
await zen.posts.findMany({ take: 10, cursor: null });       // first page
await zen.posts.findMany({ take: 10, cursor: prevCursor });  // next page
```

### Write Methods

`insert`, `patch`, `delete` (triggers cascading deletes), `upsert(existing: Doc | null, doc)` — takes existing doc or null, not a filter.

### defineJoinTable

`defineJoinTable("users", "groups", { role: v.string() })` — generates ID fields, indexes. Field naming: `${tableName}Id`. Blocks same-table joins (use manual table definition instead).

---

## Runtime Introspection

```typescript
schema.tables[t].validator.fields  // field validators — v.id() has .kind === "id", .tableName
schema.tables[t][" indexes"]()     // index definitions (space-prefixed private method)
```

Optional fields: field validator has `isOptional === "optional"`. `_creationTime` appended to every index by Convex.

## Testing

- `packages/zenvex/tests/` — type tests (`expectTypeOf`), pure function unit tests. Import forum schema.
- `examples/forum/tests/` — integration tests via `convex-test`.
- `examples/forum/` covers every relation pattern: one-to-many, optional FKs, self-referential, self-referential many-to-many, join tables with pivot data, multi-field indexes, cascade chains.

## Convex Constraints

Max 16 fields/index, 32 indexes/table. Equality fields first, only last field uses range. Mutations are atomic transactions. No SQL/JOIN/COUNT.

## What NOT to Build

Computed fields, custom filter syntax, `.withIndex()` escape hatch, soft delete, client extensions/middleware/hooks, model methods, auto-resolving indexes for queries, `where` object syntax.
