/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as ai from "../ai.js";
import type * as audioTranscription from "../audioTranscription.js";
import type * as branches from "../branches.js";
import type * as bulletPoints from "../bulletPoints.js";
import type * as contentSearch from "../contentSearch.js";
import type * as dynamicFileContent from "../dynamicFileContent.js";
import type * as dynamicFiles from "../dynamicFiles.js";
import type * as fileTemplates from "../fileTemplates.js";
import type * as fileUploads from "../fileUploads.js";
import type * as firecrawl from "../firecrawl.js";
import type * as github from "../github.js";
import type * as githubSearch from "../githubSearch.js";
import type * as http from "../http.js";
import type * as migrations from "../migrations.js";
import type * as projects from "../projects.js";
import type * as resumes from "../resumes.js";
import type * as seed from "../seed.js";
import type * as webSearch from "../webSearch.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  ai: typeof ai;
  audioTranscription: typeof audioTranscription;
  branches: typeof branches;
  bulletPoints: typeof bulletPoints;
  contentSearch: typeof contentSearch;
  dynamicFileContent: typeof dynamicFileContent;
  dynamicFiles: typeof dynamicFiles;
  fileTemplates: typeof fileTemplates;
  fileUploads: typeof fileUploads;
  firecrawl: typeof firecrawl;
  github: typeof github;
  githubSearch: typeof githubSearch;
  http: typeof http;
  migrations: typeof migrations;
  projects: typeof projects;
  resumes: typeof resumes;
  seed: typeof seed;
  webSearch: typeof webSearch;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
