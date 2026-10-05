-- Test helpers. Usage pattern inside a test file:
--   :as_santi            -- psql variable expanding to "become Santi"
--   select tests.ok(<condition>, 'label');
--   select tests.fails($$<sql>$$, 'expected error fragment', 'label');
create schema tests;
grant usage on schema tests to authenticated, anon;

create table tests.users (name text primary key, id uuid not null, email text);
create table tests.docs (label text primary key, id uuid not null);
create table tests.tokens (label text primary key, token text not null);
grant select on tests.users, tests.docs, tests.tokens to authenticated, anon;

-- Sets the JWT claims Supabase would set for this user. Follow with
-- `set role authenticated`.
create function tests.as_user(p_name text) returns void
language plpgsql security definer as $$
declare v tests.users;
begin
  select * into v from tests.users where name = p_name;
  if not found then raise exception 'unknown test user %', p_name; end if;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v.id, 'email', v.email, 'role', 'authenticated')::text, false);
end $$;

create function tests.user_id(p_name text) returns uuid
language sql stable security definer as $$ select id from tests.users where name = p_name $$;

-- Looks up ids bypassing RLS: an attacker may know or guess another record's id.
create table tests.members (name text primary key, id uuid not null);
create function tests.member(p_name text) returns uuid
language sql stable security definer as $$
  select coalesce((select id from tests.members where name = p_name),
                  (select id from public.family_members where display_name = p_name))
$$;
grant select, insert on tests.members to authenticated;
create function tests.doc(p_label text) returns uuid
language sql stable security definer as $$ select id from tests.docs where label = p_label $$;
create function tests.doc_path(p_label text) returns text
language sql stable security definer as $$
  select d.storage_path from public.documents d join tests.docs t on t.id = d.id where t.label = p_label
$$;
create function tests.remember_doc(p_label text, p_id uuid) returns uuid
language sql security definer as $$
  insert into tests.docs values (p_label, p_id) returning id
$$;
create function tests.remember_token(p_label text, p_token text) returns void
language sql security definer as $$ insert into tests.tokens values (p_label, p_token) $$;
create function tests.token(p_label text) returns text
language sql stable security definer as $$ select token from tests.tokens where label = p_label $$;
-- Reads the audit log bypassing RLS (to check what was recorded).
create function tests.last_audit(p_action text) returns public.audit_log
language sql stable security definer as $$
  select * from public.audit_log where action = p_action order by id desc limit 1
$$;
create function tests.audit_count(p_action text) returns bigint
language sql stable security definer as $$ select count(*) from public.audit_log where action = p_action $$;
create function tests.raw_document(p_label text) returns public.documents
language sql stable security definer as $$
  select d.* from public.documents d join tests.docs t on t.id = d.id where t.label = p_label
$$;

create function tests.ok(p_condition boolean, p_label text) returns void
language plpgsql as $$
begin
  if p_condition is distinct from true then
    raise exception 'FAIL: %', p_label;
  end if;
  raise notice 'ok - %', p_label;
end $$;

-- Runs p_sql (as the current role) and passes only if it raises an error
-- whose message or detail contains p_expect.
create function tests.fails(p_sql text, p_expect text, p_label text) returns void
language plpgsql as $$
declare v_msg text; v_detail text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_msg = message_text, v_detail = pg_exception_detail;
    if p_expect is not null
       and position(lower(p_expect) in lower(v_msg || ' ' || coalesce(v_detail, ''))) = 0 then
      raise exception 'FAIL: % (expected error containing "%", got "%")', p_label, p_expect, v_msg;
    end if;
    raise notice 'ok - % [%]', p_label, v_msg;
    return;
  end;
  raise exception 'FAIL: % (expected an error, but the statement succeeded)', p_label;
end $$;

-- Runs p_sql and returns the number of rows it affected (for UPDATE/DELETE
-- that RLS silently filters to zero rows).
create function tests.rows_affected(p_sql text) returns bigint
language plpgsql as $$
declare v bigint;
begin
  execute p_sql;
  get diagnostics v = row_count;
  return v;
end $$;

grant execute on all functions in schema tests to authenticated, anon;
