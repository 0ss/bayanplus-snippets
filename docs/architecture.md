# Architecture

BayanPlus collected page events, named a visitor, grouped them into sessions, and answered dashboard questions from ClickHouse. The control plane was separate from the event path. Guarantees below are the ones the system actually had.

## Shape

```
Browser SDK
  -> Cloudflare Edge
       IP, country, region, city
       dev=true goes to the staging origin
        |
        v
Ingestion API <--- Firebase / Firestore
  |-- ACK 200       projects, members, fingerprint blacklist
  |
  In-memory queue (fastq, ten workers, one process, no cap)
        |
        v
Event worker
  |-- drop (unknown project, domain, bot, exclusion)
  |-- identity
  |-- sessionization
  |-- enrichment (geo, parsed device, raw IP onto the row)
  |-- one insert
        |
        v
ClickHouse
  -> query layer
       -> dashboard
```

The edge is not a store. Firestore feeds the worker after the ack, and the dashboard for membership. It is not a second analytics database.

## Guarantees

The ack means `received`. The envelope is in the in-memory queue. ClickHouse has no row yet. A crash drops the queue. The page sent no event id and no event time. The live insert asked ClickHouse for `now()` at write time, so a backed-up queue dates the row later than the request. There is no idempotency key.

The retrier wrapped the push: five attempts, five seconds apart in production. The worker catches, so the push looks successful and the extra attempts never run. A validation drop returns normally. The client already has a 200.

Ten workers share the process. A session is a read, then one or two writes, with no lock and no owner per visitor. Two workers can read the same open session and both write a cancel row and a new state row. Signs on one order key can sum to 0, and the session disappears on merge. The session lookup also sampled a million rows. Above that, the open session can be missed. See `src/sessions.ts`.

Identity is `cyrb53` of fingerprint, edge IP, and project id. A missing fingerprint is new random material, hashed the same way. The hash fits in a JS number. It is not a secret. The raw IP is an input and a column on the event.

The worker trusts `x-ip` and the geo headers. Nothing checks that the Cloudflare worker overwrote them. A caller who reaches the origin can set them.

Dashboard SQL is a string. The project id is the one the caller supplied, interpolated, and not escaped. Filter values were pasted in too. A cleaner replaced quotes in those values only. `uniq(user_id)` is approximate and multiplied by the sample factor. The project predicate is on both sides of the event/session join.

A known user rewrites `user_id` on past events and sessions with `ALTER UPDATE`. `visitor_id` stays. The new row already carries the known id. The mutation finishes later, so two reads can disagree.

## What this was not

No durable queue. No exactly-once delivery. No parameterized query on the historical path. No single writer per visitor. No batch insert. Projects and members were not analytics facts.
