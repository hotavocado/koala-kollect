/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as cardSets from "../cardSets.js";
import type * as cardSetsCore from "../cardSetsCore.js";
import type * as cards from "../cards.js";
import type * as crons from "../crons.js";
import type * as dataSync from "../dataSync.js";
import type * as syncCore from "../syncCore.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  cardSets: typeof cardSets;
  cardSetsCore: typeof cardSetsCore;
  cards: typeof cards;
  crons: typeof crons;
  dataSync: typeof dataSync;
  syncCore: typeof syncCore;
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
