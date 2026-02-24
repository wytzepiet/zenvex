import type { Zen } from "zenvex";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { relations } from "./schema";

export type ZenReader = Zen<QueryCtx, typeof relations>;
export type ZenWriter = Zen<MutationCtx, typeof relations>;
