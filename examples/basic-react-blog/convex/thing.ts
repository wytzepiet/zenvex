import { query } from "./_generated/server";

export const thing = query({
  handler(ctx) {
    return ctx.db
      .query("posts")
      .withIndex("by_slug", (q) => q.gt("slug", "thing").lt("slug", "thing"));
  },
});
