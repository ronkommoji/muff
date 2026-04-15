/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as cronActions from "../cronActions.js";
import type * as crons from "../crons.js";
import type * as kv from "../kv.js";
import type * as logs from "../logs.js";
import type * as messages from "../messages.js";
import type * as routines from "../routines.js";
import type * as sessions from "../sessions.js";
import type * as toolCalls from "../toolCalls.js";
import type * as usage from "../usage.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  cronActions: typeof cronActions;
  crons: typeof crons;
  kv: typeof kv;
  logs: typeof logs;
  messages: typeof messages;
  routines: typeof routines;
  sessions: typeof sessions;
  toolCalls: typeof toolCalls;
  usage: typeof usage;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
