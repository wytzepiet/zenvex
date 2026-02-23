import {
  customQuery,
  customMutation,
} from "convex-helpers/server/customFunctions";
import {
  query as baseQuery,
  mutation as baseMutation,
} from "./_generated/server";
import { customCtx } from "convex-helpers/server/customFunctions";
import { createZen } from "zenvex";
import { relations } from "./schema";

export const query = customQuery(
  baseQuery,
  customCtx(async (ctx) => ({
    zen: createZen(ctx, relations),
    db: undefined,
  })),
);

export const mutation = customMutation(
  baseMutation,
  customCtx(async (ctx) => ({
    zen: createZen(ctx, relations),
    db: undefined,
  })),
);
