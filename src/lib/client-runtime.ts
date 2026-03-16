import * as ManagedRuntime from "effect/ManagedRuntime";
import { ApiClient } from "@/api/api-client";

export const clientRuntime = ManagedRuntime.make(ApiClient.Default);
