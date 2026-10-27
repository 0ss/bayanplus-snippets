import type { EventEnvelope } from "../domain/model";

export const WORKER_CONCURRENCY = 10;

export interface EventQueue {
  /** Returns once the envelope is in process memory. Worker failure does not reject this. */
  enqueue(envelope: EventEnvelope): void;
}

type Worker = (envelope: EventEnvelope) => Promise<void>;

/**
 * One list, one process, ten workers. No cap. A crash drops whatever is still here.
 * Nothing is requeued: a failed worker is logged and returns.
 */
export class InMemoryEventQueue implements EventQueue {
  private readonly pending: EventEnvelope[] = [];
  private running = 0;

  constructor(
    private readonly worker: Worker,
    private readonly concurrency = WORKER_CONCURRENCY,
  ) {}

  enqueue(envelope: EventEnvelope): void {
    this.pending.push(envelope);
    this.pump();
  }

  depth(): number {
    return this.pending.length + this.running;
  }

  private pump(): void {
    while (this.running < this.concurrency && this.pending.length > 0) {
      const envelope = this.pending.shift();
      if (!envelope) return;
      this.running += 1;
      void this.worker(envelope).finally(() => {
        this.running -= 1;
        this.pump();
      });
    }
  }
}

const ENQUEUE_ATTEMPTS = 5;

/**
 * Five attempts on enqueue only. The worker catches, so insert failures never enter this loop.
 * enqueue() returns once the array has the envelope, before the worker runs.
 */
export class EnqueueRetrier {
  constructor(private readonly queue: EventQueue) {}

  async submit(envelope: EventEnvelope): Promise<void> {
    let last: unknown;
    for (let attempt = 1; attempt <= ENQUEUE_ATTEMPTS; attempt++) {
      try {
        this.queue.enqueue(envelope);
        return;
      } catch (error) {
        last = error;
      }
    }
    throw last;
  }
}
