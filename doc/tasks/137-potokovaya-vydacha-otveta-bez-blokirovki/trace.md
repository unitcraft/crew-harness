# 137 — trace and evidence

Implementation under test: `3246618da15f5011fa3ebbe768a074168dfb68d6`.

## Causal reproduction

- The unchanged path was `Engine.pump()` receiving until `Link.receive()` returned `None`, with `Hub.pump()` draining only after return and stdio sending output after the hub pump.
- The fake ACP child emits 256 numbered chunks at a nominal 2 ms interval and maintains a marker while still producing them. In the isolated PostgreSQL test database only, a `BEFORE INSERT` trigger adds 15 ms to snapshot saves for the burst session. No product database/schema or live server is changed by that trigger; the temporary test container is removed after each run.
- RED with the original unbounded receive-until-None pump: the page-visible chunk did not arrive while the producer marker was present; the short second session did not finish before the burst; a new page did not attach and receive in-flight history before the burst drained. The test reports all four failed conditions.
- GREEN with a 16-input-event scheduling quantum: the same test passes. The first chunk reaches the page while the producer marker is still present; the short second session finishes before the burst; attach/history succeeds during the stream; all 256 chunks appear once in order and the committed session history is identical after restart.

The limit is per pump invocation, not a response-size cap. A hub call drains each session after its quantum and advances to the next; stdio can then process queued page commands and flush output. `receive() == None` still ends the pump early. Per-event journal/snapshot commit and acknowledgement order are unchanged. The 15 ms trigger is a controlled test delay, not a proposed storage setting. A store operation can still take longer than the whole quantum; the event-count bound prevents a backlog from monopolizing the caller indefinitely.

## WebSocket end-to-end probes

Built both server programs, then ran the Node WebSocket end-to-end suite over files and over a separate temporary PostgreSQL database. Both runs reported `ALL PASSED`. At the first chunk's WebSocket receipt, the test verifies that the fake producer marker still exists and that `agent_done` has not arrived. A second read-only WebSocket also attaches during that interval and receives in-flight history. The burst text, event uniqueness/order, both sessions and history after restart are checked.

The same suite also checks the existing permission, cancel, error, restart, and history flows. PostgreSQL-specific checks confirm sessions and journal rows are stored and the burst history survives restart. The delay trigger exists only in the e2e-created temporary database and is removed with it.

## Timing samples

The e2e run records, in milliseconds, time from page send to first input/first chunk, fake-producer start to engine acceptance, engine event timestamp to WebSocket receipt, and done. The latter two stages distinguish fake ACP/engine acceptance from storage-plus-output/WS delivery; engine-accept-to-WS includes persistence, hub/stdio work and local WebSocket delivery, not persistence alone.

| Store mode | First input | First chunk | Producer → engine accept | Engine accept → WS | Test delay per save | Done |
|---|---:|---:|---:|---:|---:|---:|
| Files | 497 | 513 | 7 | 441 | 0 | 5955 |
| Isolated PG | 1108 | 1108 | 43 | 980 | 15 | 12806 |

These are local synthetic-fake timings, not model latency or production performance thresholds. The PG run deliberately adds a test-only delay; the files/PG difference is not an estimate of ordinary deployments.

## Production observation (context, not isolated proof)

The integrator's read-only observation of a real Kimi turn recorded 204,210 ms total, 28,078 ms to first saved chunk, 507 saved chunks, median saved-chunk gap 340 ms and p90 390 ms. A read-only WebSocket received no history in 1,500 ms during the stream; after completion it received 770 events across three sessions. No original ACP wire timestamps were measured; saved chunk intervals include persistence and backpressure and do not establish model generation speed. No prompts, responses, credentials, or raw history are included here.

## Verification

- Nova server builds: `src/crew_hub.nv`, `src/crew_harness.nv` — pass.
- Tests: `src/server_live`, `src/server`; `src/engine/{codec_test,history_test,nested_test,types_test}.nv`; `src/acp_live/{client_test,e2e_test,ack_test,real_agent_test}.nv`; isolated `src/server_pg` — pass. The real-agent test ran with `CREW_REAL_ACP` unset, so it did not start/login to a real agent.
- Files and isolated-PG WebSocket e2e: pass. Temporary PostgreSQL containers were removed.
- `sh scripts/guards/run-all.sh`: all 9 guards pass.
- No live server, model configuration, production database, ACP protocol, or web-client code was changed.
