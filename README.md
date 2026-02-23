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
```

## Documentation

See [`packages/zenvex`](packages/zenvex) for install instructions, API docs, and usage examples.

## License

MIT
