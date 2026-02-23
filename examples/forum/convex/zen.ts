import type { Zen } from "zenvex";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import schema, { relations } from "./schema";

export type ZenReader = Zen<QueryCtx, typeof schema, typeof relations>;
export type ZenWriter = Zen<MutationCtx, typeof schema, typeof relations>;
