import { EventEmitter } from "node:events";
import type { ProgressEvent } from "../types/index.js";

export const progressBus = new EventEmitter();
progressBus.setMaxListeners(50);

export function emitProgress(event: ProgressEvent): void {
  progressBus.emit("progress", event);
}
