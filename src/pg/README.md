# pg: the store and the journal of the engine in PostgreSQL

The handlers of the effects `Store` (`save`, `load`) and `Journal` (`write`, `read_all`) of the engine
([`src/engine`](../engine/README.md)) on PostgreSQL, written straight on the driver
[nova-postgres](https://github.com/nv-lang/nova-postgres) (a foreign package, read only). There is **no layer over databases**
here and none is waited for: the SQL is PostgreSQL's, the calls are three functions (`list_sessions` came in task 099). Task 098
(`doc/tasks/098-pg-storage/`); the session server (`src/server/`, task 099) gives a `PgWorld` to the engine of every session when its `store` is `pg`.

This directory holds the SQL and the scripts; the Nova code is in three modules beside it (why three: see "Why three
modules").

| Path | What it is |
|---|---|
| `src/pg/schema.sql` | the migration: schema `crew`, two tables, three functions, the role `crew_app`, the rights. Safe to run again |
| `src/pg/pg.example.json` | an example of the settings file (a placeholder password; a real one goes to the environment) |
| `src/pg/testdb.ps1` | starts and stops the temporary PostgreSQL in Docker for the tests |
| `src/pg/db.ps1` | the **permanent** PostgreSQL of the product in Docker: `up`, `status`, `down`, `psql`, `backup`, `restore`, `reset`, `env`, `serve-config` (task 115; see "The permanent database in Docker") |
| `src/pgdb/` | module `crew_harness.pgdb`: `PgConfig`, the calls `pg_save_step`, `pg_load`, `pg_migrate`, `pg_rows`, the socket loop (`wire.nv`), the test support (`testkit.nv`) |
| `src/pgconf/` | module `crew_harness.pgconf`: the settings from a file and the environment (`pg_config`) |
| `src/pgstore/` | module `crew_harness.pgstore`: `PgWorld`, `pg_store`, `pg_journal` |

## Tables and functions

```
crew.machine_snapshot(id text, step int, snapshot jsonb, saved_at timestamptz)   primary key (id, step)
crew.machine_journal (id text, step int, seq int,        entry jsonb)            primary key (id, step, seq),
                                                                                  foreign key (id, step) -> machine_snapshot
crew.save_step(id text, step int, snapshot jsonb, lines jsonb, first_seq int default null) returns int
crew.load(id text) returns table (step int, snapshot jsonb, journal jsonb)
crew.list_sessions() returns table (id text)                                          -- task 099: the ids of all sessions, in order
```

`id` is the id of the session (1 to 128 characters). One snapshot row is kept per step (the history stays; pruning is not done
yet). `entry` is the journal line of the engine as an object (`journal_line`): the envelope (`trace`, `step`, `cause`, `state`, `request`, `at`) and the
event `{"code": ..., "params": {name: value}}` (version 6 of the dictionary: a code and parameters, no Russian text; `jsonb` keeps the keys of
the parameters in its own order, the engine takes them by name). The schema does not know the fields of the line, so it did not change in task 102;
old lines (`kind`, `text`) stay readable.

**`save_step` writes the snapshot and the lines of a step in one transaction** (either both or none) and obeys the rule of the
step. Let `current` be the last step of the session (0 for a new one):

| `step` | What happens |
|---|---|
| `current + 1` | the next step: the snapshot is stored, the lines get the numbers `first_seq`, `first_seq + 1`... (0 when `first_seq` is null) |
| `current` | a repeat. The same snapshot (or none) and the same lines at the same numbers: nothing changes, nothing is added. Another snapshot, or another line at a taken number: error `CH002`, nothing is written. Lines without a snapshot and with `first_seq` null are put after the lines the step has: this is how the marks of the dispatch (`sent`, `cancel_sent`) reach the journal after the commit |
| anything else (a gap, a step back, 0) | error `CH001`, nothing is written |

The call takes an advisory lock of the session, so two writers cannot both take "the next step". A line that is not an
object, or a snapshot that is not an object, fails the whole call, and the snapshot of the step is not stored either.

**`load`** returns one row, the last snapshot and the whole journal of the session ordered by `(step, seq)`; no row - the
session is unknown. Both come from one statement, so they agree.

**The application role.** `crew_app` has no login and no password in the migration. A deployment makes a login that is a member
of it (`create role crew_service login password '...' in role crew_app`) and the program connects as that login. The role
can run `crew.save_step`, `crew.load` and `crew.list_sessions` and **nothing else**: it cannot `select`, write or truncate the tables, and cannot create
anything in the schema. The functions run with the rights of their owner (`security definer`, `search_path` fixed). Nobody but
the owner touches the tables (the tests check this with real `select`s that must fail with 42501).

## The handlers

`PgWorld.open(config, session)` is the PostgreSQL side of one session. The handlers are made from it as the memory handlers
are made from `MemoryWorld`:

```nova
mut world = PgWorld.open(config, "chat-1")
with Journal = pg_journal(world), Store = pg_store(world), Link = ..., Time = ... {
    start_engine[ChatState, ChatSession](chat_session(), "chat-1")
}
```

- The engine commits a step as the journal lines first and the snapshot after them (rule 13). **The lines of the step wait in
  the `PgWorld`, and `Store.save` carries them with the snapshot to `save_step`**, one call, one transaction. A process that
  dies between the lines and the snapshot leaves nothing in the database; `resume_engine` then sees the last committed step.
- A line of the step that is already committed (the marks of `dispatch`) is written to the database at once.
- `Store.load` returns the last snapshot and remembers its step (so a new process puts the marks on the right step);
  `Journal.read_all` returns the committed journal in the order of writing.
- A failed operation is not an error value: the handler **stops the process** with `panic` (the step is not committed, rule 13).
  The text has the user, host, port and database, the message of the server and its SQLSTATE; never the password. The same
  operations without the `panic` are `pg_write`, `pg_commit`, `pg_read_all`, `pg_load_snapshot` (they return `Result`; the tests
  use them for the failure cases).
- One call is one connection (connect, one query, close). There is no pool yet; with the md5 login of the tests a call is
  about 10 ms, with SCRAM about a quarter of a second on the unoptimized build.

## Settings

`PgConfig { host, port, database, user, password }`. `pg_config(file)` (module `crew_harness.pgconf`) reads a JSON file (the
argument, or the variable `CREW_PG_CONFIG` when the argument is empty; see `pg.example.json`) and puts the environment over it:
`CREW_PG_HOST`, `CREW_PG_PORT`, `CREW_PG_DATABASE`, `CREW_PG_USER`, `CREW_PG_PASSWORD`. The password may live in the environment
alone. Defaults: `127.0.0.1`, 5432, `crew`, `crew_app`, no password (which `check` refuses).
`PgConfig.check` also refuses a host that is not local (`127.0.0.1`, `localhost`, `::1`): the driver has no TLS yet, so neither
the password nor the data may cross a network; TLS is a task of its own. Every call checks the configuration first.
The password is in no error and no log line; `describe()` leaves it out.

## The permanent database in Docker

`src/pg/db.ps1` runs the PostgreSQL the product keeps its sessions in, in Docker, with one command (task 115; `testdb.ps1` stays for the tests and
is a different, temporary container). It works with **one container, `crew-harness-pg`, and one volume, `crew-harness-pg-data`**, and with nothing
else: the other containers and volumes of the machine and any PostgreSQL service of the machine are not touched (no `prune`, no other name). If Docker
is not running it says so and ends with code 1.

```powershell
powershell -File src/pg/db.ps1 up                  # first run: image postgres:16-alpine, the container, the database crew, schema.sql, the login crew_service
powershell -File src/pg/db.ps1 status              # container, port, volume, version, schema (tables, functions), sessions, a real login with the password
powershell -File src/pg/db.ps1 down                # stop the container; the volume (the data) stays
powershell -File src/pg/db.ps1 psql                # psql inside the container as the administrator (-Sql "select ..." for one command)
powershell -File src/pg/db.ps1 backup C:/work/crew.dump    # pg_dump (custom format); no file name: backups/ beside the settings file
powershell -File src/pg/db.ps1 restore C:/work/crew.dump   # replaces the database; the present state is dumped to backups/ first
powershell -File src/pg/db.ps1 reset -Force        # removes the container AND THE VOLUME: all data; without -Force it only explains and stops
powershell -File src/pg/db.ps1 env                 # the variables the server needs (CREW_PG_*), without the password; -ShowPassword prints it
powershell -File src/pg/db.ps1 serve-config        # writes the settings of the server with store pg, no password
```

- **`up` is safe to repeat.** An existing container is only started (or left running), `schema.sql` is applied again (it is written for that), the
  login is made once and **its password is never changed afterwards**. The container is made with `--restart unless-stopped`; the port is
  `127.0.0.1:15432` (`-Port 15433` changes it: the container is re-created, the volume and the data stay; only the local address is ever published).
- **Passwords.** Two random passwords (the administrator `postgres` and the login `crew_service`, a member of `crew_app`) are made on the first `up`
  and written to `~/.config/crew-harness/pg.json` (`-Config <file>` names another), **outside the repository**; on Windows only the owner of the
  file keeps access to it. Besides them the file holds the container, the volume, the port and the database. No command prints a password except
  `env -ShowPassword`; the SQL that holds one goes to `psql` over stdin, never on a command line; a message with a password in it is shown with `***`.
  The settings file lost while the container lives: `up` makes new passwords and sets them in the database (the local login of the container
  is trusted, so the administrator password is not needed for this).
- **The database is `crew`.** `-Database crew_x` (a lower case name) makes one more database in the same container, with the
  schema (the tests of `src/server/test/e2e.mjs --pg-docker` use `crew_e2e` and drop it with `db.ps1 dropdb -Database crew_e2e`; `dropdb` drops only
  a database named `crew_<something>`, never `crew`). `psql`, `backup`, `restore` act on `-Database` too.
- **Backup and restore.** `backup` is `pg_dump -Fc` of one database (roles are not in it; `up` makes `crew_app` and the login again). `restore`
  replaces the data, so it first dumps the present state to `~/.config/crew-harness/backups/<database>-before-restore-<time>.dump`, then runs
  `pg_restore --clean --if-exists --single-transaction` and applies `schema.sql` again; a failed restore leaves the database as it was.
- **Reset.** `reset -Force` removes the container, the volume and the settings file (its passwords belong to the removed volume). The next `up` starts
  from nothing. It is the only command that loses data; make a `backup` first.
- **What is not touched:** any other container, volume, network or image of Docker, the PostgreSQL services of the machine, the repository (no
  password or path of the machine is written to it).
- **Speed.** The login uses SCRAM (the default of PostgreSQL 16): a call of the server is one connection, which is a quarter of a second on the
  unoptimized build of the driver (see "The handlers"). The tests use md5 logins of the temporary container for that reason.

The server on this database: [`src/server/run-pg.ps1`](../server/README.md) (`powershell -File src/server/run-pg.ps1`) does `up`, takes the password
from the settings file into the environment of the server process and starts it.

## Run the tests

The tests need a real PostgreSQL. A temporary container, on a random port of `127.0.0.1`, with random passwords made for it, is made by:

```powershell
powershell -File src/pg/testdb.ps1          # starts it and writes target/pg-test.json (the port and the passwords of this container)
. C:/work/nova/nova-oracle-0.1.0-windows-x86_64/setup-env.ps1
nova test src                               # everything; the PostgreSQL tests are src/pgdb, src/pgconf, src/pgstore
nova test src --jobs 4                     # recommended with all 9 units: the default 16 jobs can push src/acp_live past the 60 s limit
nova test --strict-effects src
powershell -File src/pg/testdb.ps1 -Stop    # stops and removes the container
```

The script needs Docker running and says so if it is not; it never touches a PostgreSQL service of the machine. By hand, the
same is `docker run --rm -d --name crew-pg-test -e POSTGRES_PASSWORD=<a test password> -e POSTGRES_INITDB_ARGS=--auth-host=md5
-p 127.0.0.1::5432 postgres:16-alpine -c password_encryption=md5`, then `docker port crew-pg-test 5432` and a
`target/pg-test.json` that is a JSON object with the keys `port`, `admin_password` (the password given to the container) and
`app_password` (any other one, for the test logins). The passwords are in no file of the repository (the guard of secrets
would stop them). The test logins use md5 because a SCRAM login costs a quarter of a second on the
unoptimized build and the tests make hundreds of connections; one test makes a SCRAM login and checks that it works and that a
wrong password does not.

No `target/pg-test.json` is a **red test with a message**, not a silent skip: a green run must mean that the real PostgreSQL was
used. Every test makes a database of its own (`crew_t_<name>`) with the real `schema.sql` and a login `crew_u_<name>` that is a
member of `crew_app` only, and drops both at the end. The tests read the file from the root of the repository, where `nova test`
runs. A unit of `nova test` has a time limit of 60 seconds (`--timeout`); with md5 the three PostgreSQL units take 10 to 20
seconds each.

| Unit | Tests | What they show |
|---|---|---|
| `src/pgdb` | 29 | the migration (twice, with data), save and load, UTF-8, the rule of the step (next, repeat, gap, back, first), a repeat that differs, lines added to a committed step, one transaction (a bad line takes the snapshot down, a bad snapshot takes the lines down), the rights of the role, the stranger login, SCRAM, the faults and the password, the settings value |
| `src/pgconf` | 5 | the environment over the file, the file named by the caller or by `CREW_PG_CONFIG`, errors without the content of the file, the example file |
| `src/pgstore` | 16 | the handlers alone (lines wait for the snapshot, marks go at once, a new world after a restart, death between the lines and the snapshot, misuse) and **the engine with the chat machine on them**: the same story in memory and on PostgreSQL (conversation with Cyrillic and a four-byte letter, cancel, idle term, refusal) gives the same journal, snapshot and answer; restart in a new world, death before the send, death between the journal and the snapshot, two sessions |

## Why three modules (Oracle 0.1.0)

Two defects of Nova Oracle 0.1.0 decide the layout. Reproductions are in `spikes/env/` (items 21 to 25 of its README).

1. **`std.os` and the engine cannot be in one program.** The engine has an enum `Output`; `std.os` exports a value type
   `Output`; the code generator mixes them up. Task 095 renames the engine's type to `StepOutput` for the same reason. Until
   that is in `main`, no module that holds the engine may import `std.os` (not even for `env`). So `crew_harness.pgstore`
   (the engine's handlers) and `crew_harness.pgdb` (which it imports) have no `std.os`: the test support reads the port
   from a file, not from an environment variable; and the settings from the file and the environment are read in
   `crew_harness.pgconf`, which does not import the engine. The server that starts the sessions will read the settings with
   `pgconf` and give the value `PgConfig` to `PgWorld.open`; when 095's rename is in `main` the program may hold both.
2. **`postgres.pgnet` and the engine cannot be in one program.** The driver file `pgnet/listener.nv` writes the constructor
   `ListenerMsg.Event { ... }`, and the compiler read it as a record literal of the engine's `Event` (since task 102 the engine's type is `Incoming`; whether `pgnet` now fits next to the engine was not tried, the module keeps its own socket loop). So `wire.nv` does not use
   `pgnet`: it repeats its socket loop (about sixty lines: write what the `Session` owes, read a chunk, feed it, collect the
   events up to ReadyForQuery) over the pure core `postgres.Session`, which has no such clash. The rest of the driver
   (the message encoders and decoders, SCRAM, md5, the session state machine) is used as it is. This part should go away when
   the clash is fixed in the compiler or the driver.

Also observed: modules must be one folder under `src/` (`src/pgdb`, not `src/pg/db`: E_D78_MODULE_PATH_MISMATCH), a handler
operation whose body is only `panic(...)` does not compile, and `return []T.new()` in a handler operation does not compile
(`mut out = []T.new()` and then `out` does).

## What is not here

- TLS (the driver has none; the settings refuse a host that is not local), a connection pool, reconnect and retry (a failed call
  stops the process; the restart finds the last committed step), pruning of old snapshots.
- PostgREST (later, and only under the role `crew_app`), roles other than `crew_app`, creating the application login (by hand).
- The journal of the machines only: the `log.md` of a task stays a file. (The session server, `src/server/`, makes one `PgWorld` per session.)
- The file handlers (task 095, `src/storage/`) stay as the fallback; both sets of handlers have the same effects.
- A test of two writers at the same moment (the advisory lock is in the SQL; the tests are single-threaded).
