import type { EventQueue } from "./queue";
import type { BrowserEvent, EdgeContext } from "./types";

/**
 * HTTP collect handler.
 * Enqueues into process memory, then responds 200.
 */
export function collect(
  body: BrowserEvent,
  edge: EdgeContext,
  userAgent: string,
  queue: EventQueue,
  respond: (status: number) => void,
): void {
  queue.push({ ...body, userAgent, edge });
  // ACK happens before durable storage.
  respond(200);
}
