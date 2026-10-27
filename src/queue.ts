import fastq, { type queueAsPromised } from "fastq";
import type { QueuedEvent } from "./types";

const WORKERS = 10;
const ENQUEUE_ATTEMPTS = 5;

export type EventQueue = {
  push(event: QueuedEvent): void;
};

export function createQueue(
  worker: (event: QueuedEvent) => Promise<void>,
): EventQueue {
  const q: queueAsPromised<QueuedEvent> = fastq.promise(worker, WORKERS);

  return {
    push(event: QueuedEvent): void {
      void enqueueWithRetry(q, event);
    },
  };
}

async function enqueueWithRetry(
  q: queueAsPromised<QueuedEvent>,
  event: QueuedEvent,
): Promise<void> {
  let last: unknown;
  for (let attempt = 0; attempt < ENQUEUE_ATTEMPTS; attempt++) {
    try {
      await q.push(event);
      return;
    } catch (error) {
      last = error;
    }
  }
  console.error(last);
}
