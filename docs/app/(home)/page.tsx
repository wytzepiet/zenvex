import Link from "next/link";
import { codeToHtml } from "shiki";

const mono = "font-[family-name:var(--font-mono)]";
const serif = "font-[family-name:var(--font-serif)]";

async function highlight(code: string) {
  return codeToHtml(code, {
    lang: "typescript",
    theme: "tokyo-night",
  });
}

async function CodePanel({
  name,
  color,
  lines,
  badge,
  badgeColor,
  code,
}: {
  name: string;
  color: string;
  lines: number;
  badge: string;
  badgeColor: "green" | "red" | "yellow";
  code: string;
}) {
  const html = await highlight(code);

  const badgeStyles = {
    green: "bg-[#4ade8018] text-[#4ade80]",
    yellow: "bg-[#fbbf2418] text-[#fbbf24]",
    red: "bg-[#f8717118] text-[#f87171]",
  };

  return (
    <div className="text-left rounded-xl border border-fd-border bg-fd-card overflow-hidden">
      <div className="flex items-center justify-between px-6 py-3.5 border-b border-fd-border">
        <div className="flex items-center gap-2.5">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: color, boxShadow: `0 0 8px ${color}` }}
          />
          <span
            className={`${mono} text-[13px] font-semibold tracking-wide`}
            style={{ color }}
          >
            {name}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className={`${mono} text-[11px] text-[#52525b]`}>
            {lines} lines
          </span>
          <span
            className={`${mono} text-[10px] px-2 py-0.5 rounded font-semibold tracking-wide ${badgeStyles[badgeColor]}`}
          >
            {badge}
          </span>
        </div>
      </div>
      <div
        className="p-6 overflow-x-auto [&_pre]:!bg-transparent [&_pre]:!m-0 [&_pre]:!p-0 [&_code]:!text-[13px] [&_code]:!leading-[1.7] [&_code]:font-[family-name:var(--font-mono)]"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

function Comparison({
  label,
  title,
  titleAccent,
  description,
  children,
}: {
  label: string;
  title: string;
  titleAccent: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="w-full max-w-[900px] mx-auto">
      <div className="text-center mb-8">
        <div
          className={`${mono} text-[11px] tracking-[3px] uppercase text-[#52525b] mb-4`}
        >
          {label}
        </div>
        <h2
          className={`${serif} text-[clamp(28px,4vw,42px)] font-normal leading-[1.1] mb-4`}
        >
          {title} <em className="italic text-[#22d3ee]">{titleAccent}</em>
        </h2>
        <p className="text-fd-muted-foreground text-[15px] max-w-[680px] mx-auto leading-relaxed">
          {description}
        </p>
      </div>

      <div className="flex flex-col gap-5">{children}</div>
    </section>
  );
}

export default async function HomePage() {
  return (
    <div className="flex flex-col items-center text-center flex-1 px-6 py-20">
      {/* Hero */}
      <div
        className={`${mono} text-[11px] tracking-[3px] uppercase text-fd-muted-foreground mb-6`}
      >
        Type-safe queries for Convex
      </div>
      <h1
        className={`${serif} text-[clamp(36px,5vw,56px)] font-normal leading-[1.1] mb-5`}
      >
        Queries, <em className="italic text-[#22d3ee]">enlightened.</em>
      </h1>
      <p className="text-fd-muted-foreground text-base max-w-[680px] mx-auto leading-relaxed mb-10">
        Type-safe relations, cascading deletes, and ergonomic index queries for
        Convex. No codegen — all types inferred via generics.
      </p>
      <div className="flex gap-3 mb-16">
        <Link
          href="/docs"
          className="rounded-lg bg-fd-primary px-6 py-2.5 text-sm font-medium text-fd-primary-foreground transition-colors hover:opacity-90"
        >
          Get Started
        </Link>
        <Link
          href="/docs/why-zenvex"
          className="rounded-lg border border-fd-border px-6 py-2.5 text-sm font-medium transition-colors hover:bg-fd-accent"
        >
          Why Zenvex?
        </Link>
      </div>

      {/* Hero code example */}
      <div className="w-full max-w-[900px]">
        <CodePanel
          name="zenvex"
          color="#22d3ee"
          lines={7}
          badge="type-safe"
          badgeColor="green"
          code={`await zen.posts.byAuthor(userId).findMany({
  with: { author: true, tags: true },
  order: "desc",
  take: 20,
  cursor,
});`}
        />
      </div>

      <div className="my-24 w-16 h-px bg-fd-border" />

      {/* Comparison 1: Eager loading */}
      <Comparison
        label="Eager loading"
        title="Load relations,"
        titleAccent="not boilerplate"
        description="Load a thread with its author, posts (each with their own author), and tags — a common pattern in any app with related data."
      >
        <CodePanel
          name="zenvex"
          color="#22d3ee"
          lines={7}
          badge="declarative"
          badgeColor="green"
          code={`const thread = await zen.threads.find(threadId, {
  with: {
    author: true,
    posts: { with: { author: true }, order: "desc", take: 10 },
    tags: true,
  },
});`}
        />
        <CodePanel
          name="vanilla convex"
          color="#fb923c"
          lines={18}
          badge="manual joins"
          badgeColor="red"
          code={`const thread = await ctx.db.get(threadId);
const author = await ctx.db.get(thread.authorId);
const posts = await ctx.db
  .query("posts")
  .withIndex("byThread", (q) => q.eq("threadId", threadId))
  .order("desc")
  .take(10);
const postsWithAuthors = await Promise.all(
  posts.map(async (post) => ({
    ...post,
    author: await ctx.db.get(post.authorId),
  }))
);
const tagJoins = await ctx.db
  .query("threadTags")
  .withIndex("byThreadsId", (q) => q.eq("threadsId", threadId))
  .collect();
const tags = await Promise.all(tagJoins.map((j) => ctx.db.get(j.tagsId)));`}
        />
      </Comparison>

      <div className="my-24 w-16 h-px bg-fd-border" />

      {/* Comparison 2: Cascading deletes */}
      <Comparison
        label="Cascading deletes"
        title="One call,"
        titleAccent="full cleanup"
        description="Delete a thread and automatically cascade to its posts and clean up join table rows — defined once in your relations config."
      >
        <CodePanel
          name="zenvex"
          color="#22d3ee"
          lines={2}
          badge="1 line"
          badgeColor="green"
          code={`await zen.threads.delete(threadId);
// posts cascade-deleted, join rows cleaned up`}
        />
        <CodePanel
          name="vanilla convex"
          color="#fb923c"
          lines={15}
          badge="manual cleanup"
          badgeColor="red"
          code={`const posts = await ctx.db
  .query("posts")
  .withIndex("byThread", (q) => q.eq("threadId", threadId))
  .collect();
for (const post of posts) {
  await ctx.db.delete(post._id);
}
const joinRows = await ctx.db
  .query("threadTags")
  .withIndex("byThreadsId", (q) => q.eq("threadsId", threadId))
  .collect();
for (const row of joinRows) {
  await ctx.db.delete(row._id);
}
await ctx.db.delete(threadId);`}
        />
      </Comparison>

      <div className="my-24 w-16 h-px bg-fd-border" />

      {/* Comparison 3: Index queries */}
      <Comparison
        label="Index queries"
        title="Indexes as"
        titleAccent="method calls"
        description="Query a multi-field index with a range bound — positional args map to index fields in order."
      >
        <CodePanel
          name="zenvex"
          color="#22d3ee"
          lines={3}
          badge="ergonomic"
          badgeColor="green"
          code={`const threads = await zen.threads
  .byCategoryCreatedAt(categoryId, q.gte(startTime))
  .findMany({ order: "desc", take: 10 });`}
        />
        <CodePanel
          name="vanilla convex"
          color="#fb923c"
          lines={6}
          badge="verbose"
          badgeColor="yellow"
          code={`const threads = await ctx.db
  .query("threads")
  .withIndex("byCategoryCreatedAt", (q) =>
    q.eq("categoryId", categoryId).gte("createdAt", startTime)
  )
  .order("desc")
  .take(10);`}
        />
      </Comparison>

      {/* Bottom CTA */}
      <div className="mt-24 text-center">
        <p className={`${mono} text-[13px] text-[#52525b]`}>
          Same indexes. Same performance.{" "}
          <Link href="/docs" className="text-[#22d3ee] hover:underline">
            Less code.
          </Link>
        </p>
      </div>
    </div>
  );
}
