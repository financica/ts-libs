/**
 * `@financica/nbb-cbso/ws`: client for the Central Balance Sheet Office's
 * "Authentic Data Query" web service (filed annual accounts by enterprise
 * number).
 */

export { NbbCbsoClient } from "./client.js";
export type { FetchLike, NbbCbsoClientOptions } from "./client.js";
export type { DepositAddress, DepositFormat, DepositReference } from "./types.js";
export { NbbCbsoApiError, NbbCbsoError } from "../errors.js";
