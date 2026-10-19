-- schema.sql - the storage of the product engine in PostgreSQL (task 098).
--
-- Run it as the OWNER of the database (the migration role), never as the application role:
--     psql -h <host> -d <database> -f src/pg/schema.sql
-- It is safe to run again: tables and functions are created only when absent or replaced, the grants are repeated,
-- no data is touched.
--
-- What is here:
--   crew.machine_snapshot  one row per (session, step): the snapshot of the engine after the step;
--   crew.machine_journal   the lines of the journal: (session, step, seq), seq counts from 0 inside a step;
--   crew.save_step         the only way to write: the snapshot and the lines of a step in ONE transaction;
--   crew.load              the only way to read: the last snapshot and the whole journal of a session;
--   crew.list_sessions     the ids of the sessions (task 099);
--   crew_app               the role of the application: it may run the three functions and nothing else.
-- The application logs in with a role that is a member of crew_app (create it by hand, with the password of the
-- deployment: `create role crew_service login password '...' in role crew_app`); no password is in this file.

create schema if not exists crew;

-- The group role of the application. It cannot log in itself. A concurrent run may create it first: that is fine.
do $$
begin
    if not exists (select 1 from pg_roles where rolname = 'crew_app') then
        create role crew_app nologin;
    end if;
exception
    when duplicate_object or unique_violation then
        null;
end
$$;

create table if not exists crew.machine_snapshot (
    id       text        not null check (id <> '' and length(id) <= 128),
    step     integer     not null check (step >= 1),
    snapshot jsonb       not null check (jsonb_typeof(snapshot) = 'object'),
    saved_at timestamptz not null default now(),
    primary key (id, step)
);

-- A line of the journal belongs to a step that has its snapshot: the foreign key makes a "line without a step" impossible
-- even for the owner. The text of the line is kept as jsonb (the object of the engine's journal line).
create table if not exists crew.machine_journal (
    id    text    not null,
    step  integer not null,
    seq   integer not null check (seq >= 0),
    entry jsonb   not null check (jsonb_typeof(entry) = 'object'),
    primary key (id, step, seq),
    foreign key (id, step) references crew.machine_snapshot (id, step)
);

-- save_step(session, step, snapshot, lines, first_seq)
--   The rule of the step: `step` is the current step of the session (a repeat) or the current plus one (the next step);
--   a new session begins at 1. Anything else - a gap or a step back - is the error CH001 and nothing is written.
--   The next step needs its snapshot; the lines get the numbers first_seq, first_seq + 1, ... (0 when first_seq is null).
--   A repeat of the current step may come without a snapshot, to add lines of the step after its commit (the marks of
--   the dispatch); with first_seq null they are put after the lines the step has. A repeat with first_seq given and the
--   same snapshot and lines changes nothing; with another snapshot or another line at a taken number it is the error
--   CH002 and nothing is written.
--   The whole call is one transaction: if any line cannot be stored, the snapshot of the step is not stored either.
--   Returns the step.
create or replace function crew.save_step(
    p_id        text,
    p_step      integer,
    p_snapshot  jsonb,
    p_lines     jsonb,
    p_first_seq integer default null
) returns integer
language plpgsql
security definer
set search_path = pg_catalog, crew
as $$
declare
    v_current  integer;
    v_first    integer;
    v_stored   jsonb;
    v_mismatch integer;
begin
    if p_id is null or p_id = '' or length(p_id) > 128 then
        raise exception 'save_step: the session id must be 1 to 128 characters' using errcode = '22023';
    end if;
    if p_step is null or p_step < 1 then
        raise exception 'save_step: the step must be 1 or more' using errcode = 'CH001';
    end if;
    if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
        raise exception 'save_step: the lines must be a JSON array' using errcode = '22023';
    end if;
    if p_first_seq is not null and p_first_seq < 0 then
        raise exception 'save_step: first_seq must be 0 or more' using errcode = '22023';
    end if;

    -- one writer per session at a time: two processes cannot both take "the next step"
    perform pg_advisory_xact_lock(hashtextextended('crew.save_step:' || p_id, 0));

    select coalesce(max(step), 0) into v_current from crew.machine_snapshot where id = p_id;

    if p_step = v_current + 1 then
        if p_snapshot is null then
            raise exception 'save_step: the step % of % needs a snapshot', p_step, p_id using errcode = 'CH001';
        end if;
        insert into crew.machine_snapshot (id, step, snapshot) values (p_id, p_step, p_snapshot);
        v_first := coalesce(p_first_seq, 0);
    elsif p_step = v_current then
        if p_snapshot is not null then
            select snapshot into v_stored from crew.machine_snapshot where id = p_id and step = p_step;
            if v_stored <> p_snapshot then
                raise exception 'save_step: the step % of % is already saved with another snapshot', p_step, p_id
                    using errcode = 'CH002';
            end if;
        end if;
        if p_first_seq is null then
            select coalesce(max(seq) + 1, 0) into v_first from crew.machine_journal where id = p_id and step = p_step;
        else
            v_first := p_first_seq;
        end if;
    else
        raise exception 'save_step: the step % does not follow the step % of %', p_step, v_current, p_id
            using errcode = 'CH001';
    end if;

    insert into crew.machine_journal (id, step, seq, entry)
        select p_id, p_step, v_first + (l.ord - 1)::integer, l.line
        from jsonb_array_elements(p_lines) with ordinality as l(line, ord)
    on conflict (id, step, seq) do nothing;

    -- a number that was taken must hold the same line
    select count(*) into v_mismatch
        from jsonb_array_elements(p_lines) with ordinality as l(line, ord)
        join crew.machine_journal j
          on j.id = p_id and j.step = p_step and j.seq = v_first + (l.ord - 1)::integer
        where j.entry <> l.line;
    if v_mismatch > 0 then
        raise exception 'save_step: a line of the step % of % differs from the line already stored', p_step, p_id
            using errcode = 'CH002';
    end if;

    return p_step;
end
$$;

-- load(session): the last snapshot and the whole journal of the session (the lines in the order of writing: by step,
-- then by seq). No row - the session is unknown.
create or replace function crew.load(p_id text)
returns table (step integer, snapshot jsonb, journal jsonb)
language sql
stable
security definer
set search_path = pg_catalog, crew
as $$
    select s.step,
           s.snapshot,
           coalesce((select jsonb_agg(j.entry order by j.step, j.seq) from crew.machine_journal j where j.id = s.id),
                    '[]'::jsonb)
    from crew.machine_snapshot s
    where s.id = p_id
    order by s.step desc
    limit 1
$$;

-- list_sessions(): the ids of all sessions, once each, in the order of the names (the server finds its sessions with it
-- when it starts).
create or replace function crew.list_sessions()
returns table (id text)
language sql
stable
security definer
set search_path = pg_catalog, crew
as $$
    select distinct s.id from crew.machine_snapshot s order by s.id
$$;

-- The rights. Nobody but the owner touches the tables; the application role runs the three functions.
revoke all on schema crew from public;
revoke all on all tables in schema crew from public;
revoke all on all tables in schema crew from crew_app;
grant usage on schema crew to crew_app;
revoke all on function crew.save_step(text, integer, jsonb, jsonb, integer) from public;
revoke all on function crew.load(text) from public;
revoke all on function crew.list_sessions() from public;
grant execute on function crew.save_step(text, integer, jsonb, jsonb, integer) to crew_app;
grant execute on function crew.load(text) to crew_app;
grant execute on function crew.list_sessions() to crew_app;
