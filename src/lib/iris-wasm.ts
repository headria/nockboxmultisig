"use client";

import { wasm } from "@nockbox/iris-sdk";

let wasmInitialized = false;
let initializingPromise: Promise<void> | null = null;

/**
 * Ensure that the Iris WASM module has been initialized before using any wasm APIs.
 */
export async function ensureIrisWasm(): Promise<typeof wasm> {
  if (wasmInitialized) return wasm;
  if (!initializingPromise) {
    initializingPromise = wasm
      .default()
      .then(() => {
        wasmInitialized = true;
      })
      .finally(() => {
        initializingPromise = null;
      });
  }

  await initializingPromise;
  return wasm;
}
