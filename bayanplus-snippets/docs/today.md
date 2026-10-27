# Today

This page is not what BayanPlus ran. Each piece is here because the historical guarantee was too weak, not because a larger company would have one.

## Shape

```
Browser SDK
  client event id, event time, small outbox
  -> Edge
       geo as a hint, raw IP dropped
       project id checked for shape only
        |
        v
API
  |-- ACK after a durable queue accepts the record
  |
  Queue (one producer, one consumer, managed)
        |
        v
Worker, partitioned by visitor
  |-- batch insert
  |-- dedupe on the client event id
        |
        v
ClickHouse
  events are immutable
  identity is a map, joined at read time
  sessions are derived, one owner per visitor
  -> compiler
       parameters, tenant from auth, before the query runs
         -> dashboard, preferably from a rollup
```

## What is earned

The client event id makes a retry the same row. The outbox is what survives a failed request. The ack moves to the moment a durable queue accepts the record, because process memory was the thing that lied.

A managed queue is enough while there is one producer and one consumer. Kafka is a partitioned log with a consumer protocol. It becomes reasonable when several consumers need the same stream, or when replay across a long retention is itself a product. It is not the first queue.

Sessions stop being a shared read-modify-write. One worker owns a visitor, or the session is reduced from immutable events. The 30 minute gap can stay. The owner is the change.

Inserts are batches. One row per event fights part creation. The batch is acknowledged back to the queue only after the insert succeeds.

The compiler on this page returns `{ sql, params }`. The project id is the authenticated tenant. Column names stay on an allowlist. Membership finishes before execute.

Past events are not rewritten. A link row maps an anonymous visitor to a known user. Deleting the row undoes the link. Stitched numbers are a join, or a replay.

The edge can still attach country. It does not put the raw IP into the visitor id. Geo is a column beside the event, not an input to identity.

ClickHouse stays for scans and uniqs. At a low rate, Postgres with an index and a rollup answers the same screens. The column store is earned when those scans are the pain, not before.

Kubernetes, a service per step, and a stream processor are the same kind of decision. This pipeline is one API and one worker until they need to scale apart. A network hop between identity, session, and the insert would split one event across failures. Keep that agreement in one process, with the durable queue in front of it.
