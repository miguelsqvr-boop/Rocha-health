-- =============================================================================
-- Rocha Health: family access, Super Admin & privacy model
--
-- Principle: "The Super Admin can manage the family's health data. Every family
-- member owns their own health profile."
--
-- Every health record carries family_id + member_id. Access is decided in ONE
-- place, app.member_ids_with(capability), and every row-level-security policy,
-- storage policy and RPC goes through it. The UI only mirrors these rules; it
-- never enforces them on its own.
--
--   Super Admin (active)  -> every member of their family
--   Family member (active)-> only their own member_id
--   member_access_grants  -> future granular sharing (view / upload / full,
--                            temporary, caregiver, doctor). No UI creates
--                            grants yet, but the rules already honour them.
--   Deactivated accounts  -> nothing
-- =============================================================================

create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Types
-- -----------------------------------------------------------------------------
create type public.member_role as enum ('super_admin', 'member');
create type public.member_status as enum ('not_invited', 'invited', 'active', 'deactivated');
create type public.access_level as enum ('view', 'upload', 'full');
create type public.document_status as enum ('processing', 'ready_for_review', 'filed', 'failed');
create type public.identity_status as enum ('match', 'mismatch', 'uncertain', 'unchecked');
create type public.result_confidence as enum ('high', 'needs_review');

-- -----------------------------------------------------------------------------
-- Families and members
-- -----------------------------------------------------------------------------
create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  -- Login link. Null until the member accepts an invitation. One login belongs
  -- to exactly one family member.
  user_id uuid unique references auth.users(id) on delete set null,
  role public.member_role not null default 'member',
  status public.member_status not null default 'not_invited',
  display_name text not null check (length(trim(display_name)) > 0),
  -- Identity fields used by wrong-person protection. Only the Super Admin can
  -- change them (see app.guard_family_member_write).
  legal_name text,
  name_aliases text[] not null default '{}',
  date_of_birth date,
  sex text check (sex in ('female', 'male', 'other')),
  email text,
  -- Self-editable profile fields.
  phone text,
  avatar_color text,
  preferences jsonb not null default '{}',
  sort_order integer not null default 100,
  invited_at timestamptz,
  activated_at timestamptz,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Target for composite foreign keys, so a record's family_id can never
  -- disagree with its member's family.
  unique (family_id, id)
);
create index family_members_family_idx on public.family_members (family_id, sort_order);

-- Future granular permissions. A grant gives one login (family member,
-- caregiver or doctor) access to one member's records.
create table public.member_access_grants (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  subject_member_id uuid not null,
  grantee_user_id uuid not null references auth.users(id) on delete cascade,
  access_level public.access_level not null,
  relationship text not null default 'family'
    check (relationship in ('family', 'caregiver', 'doctor')),
  expires_at timestamptz,
  revoked_at timestamptz,
  note text,
  granted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (family_id, subject_member_id)
    references public.family_members(family_id, id) on delete cascade
);
create index member_access_grants_grantee_idx on public.member_access_grants (grantee_user_id);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  member_id uuid not null,
  email text not null,
  -- Only the SHA-256 of the token is stored; the plaintext is shown once.
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id),
  revoked_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (family_id, member_id)
    references public.family_members(family_id, id) on delete cascade
);

-- -----------------------------------------------------------------------------
-- Reference data managed by the Super Admin (family_id null = built in)
-- -----------------------------------------------------------------------------
create table public.health_categories (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references public.families(id) on delete cascade,
  code text not null,
  label text not null,
  parent_code text,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (family_id, code)
);

create table public.biomarkers (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references public.families(id) on delete cascade,
  code text not null,
  name text not null,
  category text not null,
  default_unit text,
  synonyms text[] not null default '{}',
  reference_low numeric,
  reference_high numeric,
  -- null: being inside the reference range is what matters.
  higher_is_better boolean,
  loinc_code text,
  description text,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (family_id, code)
);

create table public.preventive_care_rules (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references public.families(id) on delete cascade,
  code text not null,
  title text not null,
  description text,
  sex text check (sex in ('female', 'male')),
  min_age integer,
  max_age integer,
  interval_months integer not null check (interval_months > 0),
  -- A filed document of one of these types, or a result for one of these
  -- biomarkers, counts as the check having been done.
  document_types text[] not null default '{}',
  biomarker_codes text[] not null default '{}',
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (family_id, code)
);

-- -----------------------------------------------------------------------------
-- Health records. Every table: family_id + member_id, composite FK to the member.
-- -----------------------------------------------------------------------------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  -- Null only while a Super Admin upload waits for "Let AI identify".
  member_id uuid,
  uploaded_by uuid not null references auth.users(id),
  uploaded_by_name text,
  status public.document_status not null default 'processing',
  original_filename text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  -- {family_id}/{document_id}/original.{ext}. Deliberately no member id: file
  -- access always follows the document's *current* assignment.
  storage_path text not null unique,
  document_type text,
  category text,
  title text,
  document_date date,
  provider text,
  filing_path text[] not null default '{}',
  extraction jsonb,
  extracted_patient_name text,
  extracted_date_of_birth date,
  -- {"suggested_member_id": ..., "by_member": {"<member id>": {"status": "match"|"mismatch"|"uncertain", ...}}}
  identity_assessment jsonb,
  identity_status public.identity_status not null default 'unchecked',
  identity_confirmed_by uuid references auth.users(id),
  identity_confirmed_at timestamptz,
  processing_error text,
  filed_at timestamptz,
  filed_by uuid references auth.users(id),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, family_id, member_id),
  foreign key (family_id, member_id)
    references public.family_members(family_id, id) on delete restrict,
  constraint filed_documents_are_assigned
    check (status <> 'filed' or member_id is not null),
  -- Wrong-person protection, enforced by the database: a document can only be
  -- filed when the identity check matched, or a person explicitly confirmed it.
  constraint filed_documents_have_confirmed_identity
    check (status <> 'filed' or identity_status = 'match' or identity_confirmed_by is not null)
);
create index documents_member_idx on public.documents (member_id, status, document_date desc);
create index documents_family_idx on public.documents (family_id, created_at desc);

create table public.health_results (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  member_id uuid not null,
  biomarker_id uuid references public.biomarkers(id) on delete set null,
  analyte_name text not null,
  source_document_id uuid,
  result_date date not null,
  value_numeric numeric,
  value_text text,
  unit text,
  reference_low numeric,
  reference_high numeric,
  reference_text text,
  flag text check (flag in ('low', 'normal', 'high', 'abnormal')),
  confidence public.result_confidence not null default 'high',
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (value_numeric is not null or value_text is not null),
  foreign key (family_id, member_id)
    references public.family_members(family_id, id) on delete restrict,
  -- Results always belong to the same person as their source document. Moving
  -- a document to another member moves its results with it (ON UPDATE CASCADE).
  foreign key (source_document_id, family_id, member_id)
    references public.documents(id, family_id, member_id)
    on update cascade on delete cascade
);
create index health_results_member_idx on public.health_results (member_id, biomarker_id, result_date desc);
create index health_results_document_idx on public.health_results (source_document_id);

create table public.medications (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  member_id uuid not null,
  kind text not null default 'medication' check (kind in ('medication', 'supplement')),
  name text not null,
  dose text,
  frequency text,
  started_on date,
  ended_on date,
  prescriber text,
  notes text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (family_id, member_id)
    references public.family_members(family_id, id) on delete cascade
);
create index medications_member_idx on public.medications (member_id, kind);

create table public.wellness_entries (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  member_id uuid not null,
  domain text not null
    check (domain in ('sleep', 'fitness', 'body_composition', 'vitals', 'nutrition', 'mindfulness')),
  metric text not null,
  value numeric not null,
  unit text,
  recorded_at timestamptz not null,
  source text not null default 'manual',
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (family_id, member_id)
    references public.family_members(family_id, id) on delete cascade
);
create index wellness_entries_member_idx on public.wellness_entries (member_id, domain, metric, recorded_at desc);

create table public.wearable_connections (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  member_id uuid not null,
  provider text not null
    check (provider in ('apple_health', 'oura', 'whoop', 'garmin', 'fitbit', 'withings', 'polar')),
  status text not null default 'pending' check (status in ('pending', 'connected', 'error', 'disconnected')),
  connected_by uuid references auth.users(id) default auth.uid(),
  connected_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, provider),
  foreign key (family_id, member_id)
    references public.family_members(family_id, id) on delete cascade
);

-- OAuth tokens for wearables. RLS on, no policies: only the service role
-- (the sync worker) can read them. Never exposed to any signed-in user.
create table public.wearable_credentials (
  connection_id uuid primary key references public.wearable_connections(id) on delete cascade,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.preventive_care_completions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  member_id uuid not null,
  rule_code text not null,
  completed_on date not null,
  note text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (family_id, member_id)
    references public.family_members(family_id, id) on delete cascade
);

create table public.correction_requests (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  member_id uuid not null,
  requested_by uuid not null references auth.users(id) default auth.uid(),
  entity_type text not null check (entity_type in ('document', 'health_result', 'profile', 'other')),
  entity_id uuid,
  message text not null check (length(trim(message)) > 0),
  status text not null default 'open' check (status in ('open', 'resolved', 'rejected')),
  resolution_note text,
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (family_id, member_id)
    references public.family_members(family_id, id) on delete cascade
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  recipient_member_id uuid not null references public.family_members(id) on delete cascade,
  -- Whose health information the notification is about. Visibility is
  -- re-checked against this on every read.
  subject_member_id uuid references public.family_members(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_recipient_idx on public.notifications (recipient_member_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Audit log: append-only. No API role can write to it directly; entries come
-- from app.write_audit() (RPCs and triggers). Not foreign-keyed so history
-- outlives the rows it describes.
-- -----------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  family_id uuid,
  occurred_at timestamptz not null default now(),
  actor_user_id uuid,
  actor_member_id uuid,
  actor_name text,
  -- Set while a Super Admin uses "View as" for another member.
  acting_as_member_id uuid,
  action text not null,
  target_member_id uuid,
  target_member_name text,
  entity_type text,
  entity_id uuid,
  summary text,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}',
  ip_address text,
  user_agent text
);
create index audit_log_family_idx on public.audit_log (family_id, occurred_at desc);
create index audit_log_target_idx on public.audit_log (target_member_id, occurred_at desc);

-- =============================================================================
-- Access functions. SECURITY DEFINER so they can read family_members without
-- recursing through its own RLS; they only ever answer questions about the
-- *calling* user (auth.uid()).
-- =============================================================================

-- Member ids the caller may act on for a capability: 'read' | 'upload' | 'write'.
create or replace function app.member_ids_with(p_capability text)
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  with me as (
    select m.id, m.family_id, m.role
    from public.family_members m
    where m.user_id = auth.uid() and m.status = 'active'
  )
  -- 1. A member always has full access to their own profile.
  select me.id from me
  union
  -- 2. A Super Admin has full access to everyone in the family they run.
  select fm.id
  from public.family_members fm
  join me on me.family_id = fm.family_id and me.role = 'super_admin'
  union
  -- 3. Explicit, unexpired, unrevoked grants (granular sharing, future UI).
  select g.subject_member_id
  from public.member_access_grants g
  where g.grantee_user_id = auth.uid()
    and g.revoked_at is null
    and (g.expires_at is null or g.expires_at > now())
    and case p_capability
          when 'read' then g.access_level in ('view', 'full')
          when 'upload' then g.access_level in ('upload', 'full')
          when 'write' then g.access_level = 'full'
          else false
        end
    -- A deactivated family member loses every grant they hold.
    and not exists (
      select 1 from public.family_members x
      where x.user_id = auth.uid() and x.status <> 'active'
    )
$$;

create or replace function app.admin_family_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select m.family_id from public.family_members m
  where m.user_id = auth.uid() and m.status = 'active' and m.role = 'super_admin'
$$;

create or replace function app.member_family_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select m.family_id from public.family_members m
  where m.user_id = auth.uid() and m.status = 'active'
$$;

create or replace function app.current_member_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select m.id from public.family_members m
  where m.user_id = auth.uid() and m.status = 'active'
$$;

create or replace function app.is_family_admin(p_family_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from app.admin_family_ids() f where f = p_family_id)
$$;

create or replace function app.require_active_member()
returns public.family_members
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_member public.family_members;
begin
  if auth.uid() is null then
    raise exception using errcode = '28000', message = 'Not signed in.';
  end if;
  select * into v_member from public.family_members
  where user_id = auth.uid() and status = 'active';
  if not found then
    raise exception using errcode = '42501', message = 'Your account is not active.';
  end if;
  return v_member;
end;
$$;

-- Pending (unfiled) documents: visible to Super Admins and to the person who
-- uploaded them, as long as they may still upload for that member. Nobody else
-- sees a document before its identity has been confirmed.
create or replace function app.can_manage_pending_document(p_doc public.documents)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select app.is_family_admin(p_doc.family_id)
      or (p_doc.uploaded_by = auth.uid()
          and (p_doc.member_id is null
               or p_doc.member_id in (select app.member_ids_with('upload'))))
$$;

-- Marks the current statement as an RPC that writes its own, more meaningful
-- audit entries, so the generic row triggers stay quiet. Scoped to this
-- statement (not the transaction): any later write in the same transaction is
-- audited normally.
create or replace function app.begin_audited_operation()
returns void
language sql volatile set search_path = ''
as $$
  select set_config('rh.audited_operation', statement_timestamp()::text, true);
$$;

-- The only way anything is written to audit_log.
create or replace function app.write_audit(
  p_family_id uuid,
  p_action text,
  p_target_member_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_summary text,
  p_before jsonb default null,
  p_after jsonb default null,
  p_metadata jsonb default '{}'
) returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  v_actor public.family_members;
  v_target_name text;
  v_view_as uuid;
begin
  if auth.uid() is not null then
    select * into v_actor from public.family_members where user_id = auth.uid();
  end if;
  if p_target_member_id is not null then
    select display_name into v_target_name from public.family_members where id = p_target_member_id;
  end if;
  -- The app forwards the "View as" member and client IP / user agent as
  -- request headers. Only a Super Admin of that member's family can be
  -- recorded as viewing as them.
  begin
    v_view_as := nullif(v_headers ->> 'x-rh-view-as', '')::uuid;
  exception when invalid_text_representation then
    v_view_as := null;
  end;
  if v_view_as is not null and not exists (
    select 1 from public.family_members t
    where t.id = v_view_as and app.is_family_admin(t.family_id)
  ) then
    v_view_as := null;
  end if;

  insert into public.audit_log (
    family_id, actor_user_id, actor_member_id, actor_name, acting_as_member_id,
    action, target_member_id, target_member_name, entity_type, entity_id,
    summary, before_data, after_data, metadata, ip_address, user_agent
  ) values (
    coalesce(p_family_id, v_actor.family_id), auth.uid(), v_actor.id,
    coalesce(v_actor.display_name, case when auth.uid() is null then 'System' end),
    v_view_as, p_action, p_target_member_id, v_target_name, p_entity_type, p_entity_id,
    p_summary, p_before, p_after, coalesce(p_metadata, '{}'),
    left(coalesce(v_headers ->> 'x-rh-client-ip', split_part(v_headers ->> 'x-forwarded-for', ',', 1)), 64),
    left(coalesce(v_headers ->> 'x-rh-user-agent', v_headers ->> 'user-agent'), 512)
  );
end;
$$;

revoke all on all functions in schema app from public;
grant execute on all functions in schema app to authenticated, service_role;
-- Only SECURITY DEFINER code (RPCs and triggers, running as the owner) may
-- write audit entries.
revoke execute on function app.write_audit(uuid, text, uuid, text, uuid, text, jsonb, jsonb, jsonb)
  from authenticated, service_role;

-- =============================================================================
-- Triggers
-- =============================================================================
create or replace function app.set_updated_at()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['families', 'family_members', 'health_categories', 'biomarkers',
    'preventive_care_rules', 'documents', 'health_results', 'medications', 'wearable_connections']
  loop
    execute format('create trigger set_updated_at before update on public.%I
      for each row execute function app.set_updated_at()', t);
  end loop;
end $$;

-- Rules for direct (PostgREST) writes to family_members. SECURITY INVOKER on
-- purpose: current_user tells us whether the write came straight from a
-- signed-in user or from a trusted context (a SECURITY DEFINER RPC that
-- enforces its own rules, the service role, or a migration).
create or replace function app.guard_family_member_write()
returns trigger language plpgsql set search_path = ''
as $$
declare
  v_self_editable constant text[] := array['display_name', 'phone', 'avatar_color', 'preferences', 'updated_at'];
  v_member public.family_members := coalesce(new, old);
begin
  if current_user not in ('authenticated', 'anon') then
    return v_member;
  end if;

  if tg_op = 'INSERT' then
    if new.user_id is not null or new.status <> 'not_invited' then
      raise exception using errcode = '42501',
        message = 'New family members start as a profile. Send an invitation to give them a login.';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.user_id = auth.uid() then
      raise exception using errcode = '42501', message = 'You cannot delete your own profile.';
    end if;
    if old.role = 'super_admin' and old.status = 'active' and not exists (
      select 1 from public.family_members x
      where x.family_id = old.family_id and x.id <> old.id
        and x.role = 'super_admin' and x.status = 'active'
    ) then
      raise exception using errcode = '42501', message = 'The family must keep at least one active Super Admin.';
    end if;
    return old;
  end if;

  -- UPDATE
  if new.family_id <> old.family_id or new.user_id is distinct from old.user_id then
    raise exception using errcode = '42501',
      message = 'A member''s family and login can only change through an invitation.';
  end if;

  if not app.is_family_admin(old.family_id) then
    -- Members may edit their own permitted profile fields only.
    if (to_jsonb(new) - v_self_editable) is distinct from (to_jsonb(old) - v_self_editable) then
      raise exception using errcode = '42501',
        message = 'You can edit your display name, phone, colour and preferences. Ask the Super Admin to change anything else.';
    end if;
    return new;
  end if;

  if new.status = 'active' and new.user_id is null then
    raise exception using errcode = '22023',
      message = 'A member becomes active when they accept their invitation.';
  end if;
  if new.status = 'deactivated' and old.status <> 'deactivated' then
    if old.user_id = auth.uid() then
      raise exception using errcode = '42501', message = 'You cannot deactivate your own account.';
    end if;
    new.deactivated_at := now();
  elsif new.status <> 'deactivated' and old.status = 'deactivated' then
    new.deactivated_at := null;
  end if;
  if old.role = 'super_admin' and old.status = 'active'
     and (new.role <> 'super_admin' or new.status <> 'active')
     and not exists (
       select 1 from public.family_members x
       where x.family_id = old.family_id and x.id <> old.id
         and x.role = 'super_admin' and x.status = 'active'
     ) then
    raise exception using errcode = '42501', message = 'The family must keep at least one active Super Admin.';
  end if;
  return new;
end;
$$;

create trigger guard_family_member_write
  before insert or update or delete on public.family_members
  for each row execute function app.guard_family_member_write();

-- Generic before/after audit for direct writes. Arguments: entity name, and
-- the column holding the member the row is about ('' for none).
create or replace function app.audit_row_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_entity text := tg_argv[0];
  v_member_col text := nullif(tg_argv[1], '');
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_before jsonb;
  v_after jsonb;
  v_summary text;
  v_verb text := case tg_op when 'INSERT' then 'create' when 'UPDATE' then 'update' else 'delete' end;
begin
  -- RPCs write their own audit entries; cascaded changes (e.g. results moving
  -- with their document) are covered by the parent operation's entry.
  if current_setting('rh.audited_operation', true) = statement_timestamp()::text
     or pg_trigger_depth() > 1 then
    return null;
  end if;
  -- Built-in reference data (no family) ships with migrations.
  if v_row ->> 'family_id' is null then
    return null;
  end if;

  if tg_op = 'UPDATE' then
    select jsonb_object_agg(o.key, o.value), jsonb_object_agg(o.key, v_new -> o.key)
      into v_before, v_after
    from jsonb_each(v_old) o
    where o.key not in ('updated_at') and o.value is distinct from v_new -> o.key;
    if v_before is null then
      return null;
    end if;
  else
    v_before := v_old;
    v_after := v_new;
  end if;

  if v_entity = 'health_result' then
    v_summary := case tg_op
      when 'UPDATE' then format('%s %s → %s', v_row ->> 'analyte_name',
        coalesce(v_old ->> 'value_numeric', v_old ->> 'value_text'),
        coalesce(v_new ->> 'value_numeric', v_new ->> 'value_text'))
      else format('%s %s %s', v_row ->> 'analyte_name',
        coalesce(v_row ->> 'value_numeric', v_row ->> 'value_text'), v_verb || 'd')
    end;
  elsif v_entity = 'family_member' then
    v_summary := format('Profile %sd: %s', v_verb, v_row ->> 'display_name');
  else
    -- e.g. "Added medication: Vitamin D3", "Updated biomarker: ApoB"
    v_summary := format('%s %s%s',
      case tg_op when 'INSERT' then 'Added' when 'UPDATE' then 'Updated' else 'Deleted' end,
      replace(v_entity, '_', ' '),
      coalesce(': ' || coalesce(v_row ->> 'name', v_row ->> 'title', v_row ->> 'metric', v_row ->> 'label', v_row ->> 'access_level'), ''));
  end if;

  perform app.write_audit(
    (v_row ->> 'family_id')::uuid,
    v_entity || '.' || v_verb,
    case when v_member_col is not null then (v_row ->> v_member_col)::uuid end,
    v_entity,
    (v_row ->> 'id')::uuid,
    v_summary, v_before, v_after,
    -- current_setting('role') is the caller's role even inside SECURITY DEFINER.
    jsonb_build_object('via', case current_setting('role', true)
                                when 'authenticated' then 'api'
                                when 'service_role' then 'service_role'
                                else 'database' end)
  );
  return null;
end;
$$;

create trigger audit_family_members after insert or update or delete on public.family_members
  for each row execute function app.audit_row_change('family_member', 'id');
create trigger audit_documents after insert or update or delete on public.documents
  for each row execute function app.audit_row_change('document', 'member_id');
create trigger audit_health_results after insert or update or delete on public.health_results
  for each row execute function app.audit_row_change('health_result', 'member_id');
create trigger audit_medications after insert or update or delete on public.medications
  for each row execute function app.audit_row_change('medication', 'member_id');
create trigger audit_wellness_entries after insert or update or delete on public.wellness_entries
  for each row execute function app.audit_row_change('wellness_entry', 'member_id');
create trigger audit_wearable_connections after insert or update or delete on public.wearable_connections
  for each row execute function app.audit_row_change('wearable_connection', 'member_id');
create trigger audit_grants after insert or update or delete on public.member_access_grants
  for each row execute function app.audit_row_change('access_grant', 'subject_member_id');
create trigger audit_correction_requests after insert or update on public.correction_requests
  for each row execute function app.audit_row_change('correction_request', 'member_id');
create trigger audit_biomarkers after insert or update or delete on public.biomarkers
  for each row execute function app.audit_row_change('biomarker', '');
create trigger audit_health_categories after insert or update or delete on public.health_categories
  for each row execute function app.audit_row_change('health_category', '');
create trigger audit_preventive_care_rules after insert or update or delete on public.preventive_care_rules
  for each row execute function app.audit_row_change('preventive_care_rule', '');

create or replace function app.audit_log_is_append_only()
returns trigger language plpgsql set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'The audit log is append-only.';
end;
$$;

create trigger audit_log_append_only before update or delete on public.audit_log
  for each row execute function app.audit_log_is_append_only();

-- =============================================================================
-- Row-level security
-- =============================================================================
alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.member_access_grants enable row level security;
alter table public.invitations enable row level security;
alter table public.health_categories enable row level security;
alter table public.biomarkers enable row level security;
alter table public.preventive_care_rules enable row level security;
alter table public.documents enable row level security;
alter table public.health_results enable row level security;
alter table public.medications enable row level security;
alter table public.wellness_entries enable row level security;
alter table public.wearable_connections enable row level security;
alter table public.wearable_credentials enable row level security;
alter table public.preventive_care_completions enable row level security;
alter table public.correction_requests enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_log enable row level security;

-- Signed-out visitors get nothing, whatever the policies say.
revoke all on all tables in schema public from anon;

-- families
create policy families_select on public.families for select to authenticated
  using (id in (select app.member_family_ids()));
create policy families_update on public.families for update to authenticated
  using (id in (select app.admin_family_ids()))
  with check (id in (select app.admin_family_ids()));

-- family_members: members see only themselves; the Super Admin sees the family.
-- (The family_id clause also lets the Super Admin read back a profile they
-- just created, which member_ids_with() cannot see within the same statement.)
create policy family_members_select on public.family_members for select to authenticated
  using (id in (select app.member_ids_with('read'))
         or family_id in (select app.admin_family_ids()));
create policy family_members_insert on public.family_members for insert to authenticated
  with check (family_id in (select app.admin_family_ids()));
create policy family_members_update on public.family_members for update to authenticated
  using (family_id in (select app.admin_family_ids()) or user_id = (select auth.uid()))
  with check (family_id in (select app.admin_family_ids()) or user_id = (select auth.uid()));
create policy family_members_delete on public.family_members for delete to authenticated
  using (family_id in (select app.admin_family_ids()));

-- member_access_grants: managed by the Super Admin; visible to both parties.
create policy grants_select on public.member_access_grants for select to authenticated
  using (family_id in (select app.admin_family_ids())
         or grantee_user_id = (select auth.uid())
         or subject_member_id in (select app.member_ids_with('read')));
create policy grants_admin_write on public.member_access_grants for all to authenticated
  using (family_id in (select app.admin_family_ids()))
  with check (family_id in (select app.admin_family_ids()));

-- invitations: Super Admin only.
create policy invitations_admin on public.invitations for all to authenticated
  using (family_id in (select app.admin_family_ids()))
  with check (family_id in (select app.admin_family_ids()));

-- Reference data: readable by the family, built-in rows read-only.
create policy health_categories_select on public.health_categories for select to authenticated
  using (family_id is null or family_id in (select app.member_family_ids()));
create policy health_categories_admin on public.health_categories for all to authenticated
  using (family_id in (select app.admin_family_ids()))
  with check (family_id in (select app.admin_family_ids()));
create policy biomarkers_select on public.biomarkers for select to authenticated
  using (family_id is null or family_id in (select app.member_family_ids()));
create policy biomarkers_admin on public.biomarkers for all to authenticated
  using (family_id in (select app.admin_family_ids()))
  with check (family_id in (select app.admin_family_ids()));
create policy preventive_rules_select on public.preventive_care_rules for select to authenticated
  using (family_id is null or family_id in (select app.member_family_ids()));
create policy preventive_rules_admin on public.preventive_care_rules for all to authenticated
  using (family_id in (select app.admin_family_ids()))
  with check (family_id in (select app.admin_family_ids()));

-- documents: filed documents follow the member's access; unfiled ones are
-- visible only to Super Admins and their uploader. All writes go through RPCs.
create policy documents_select on public.documents for select to authenticated
  using (
    deleted_at is null and (
      family_id in (select app.admin_family_ids())
      or (status = 'filed' and member_id in (select app.member_ids_with('read')))
      or (status <> 'filed' and uploaded_by = (select auth.uid())
          and (member_id is null or member_id in (select app.member_ids_with('upload'))))
    )
  );

-- health_results: read follows the member. Document-derived results are
-- created by confirm_document(); people may add manual results for members
-- they can write to. Corrections are a Super Admin action.
create policy health_results_select on public.health_results for select to authenticated
  using (member_id in (select app.member_ids_with('read')));
create policy health_results_insert on public.health_results for insert to authenticated
  with check (member_id in (select app.member_ids_with('write'))
              and source_document_id is null
              and created_by = (select auth.uid()));
create policy health_results_update on public.health_results for update to authenticated
  using (family_id in (select app.admin_family_ids())
         or (member_id in (select app.member_ids_with('write'))
             and source_document_id is null and created_by = (select auth.uid())))
  with check (family_id in (select app.admin_family_ids())
              or (member_id in (select app.member_ids_with('write'))
                  and source_document_id is null and created_by = (select auth.uid())));
create policy health_results_delete on public.health_results for delete to authenticated
  using (family_id in (select app.admin_family_ids())
         or (member_id in (select app.member_ids_with('write'))
             and source_document_id is null and created_by = (select auth.uid())));

-- Member-owned data: the member and the Super Admin can read and write.
create policy medications_select on public.medications for select to authenticated
  using (member_id in (select app.member_ids_with('read')));
create policy medications_write on public.medications for all to authenticated
  using (member_id in (select app.member_ids_with('write')))
  with check (member_id in (select app.member_ids_with('write')));

create policy wellness_select on public.wellness_entries for select to authenticated
  using (member_id in (select app.member_ids_with('read')));
create policy wellness_write on public.wellness_entries for all to authenticated
  using (member_id in (select app.member_ids_with('write')))
  with check (member_id in (select app.member_ids_with('write')));

create policy wearables_select on public.wearable_connections for select to authenticated
  using (member_id in (select app.member_ids_with('read')));
create policy wearables_write on public.wearable_connections for all to authenticated
  using (member_id in (select app.member_ids_with('write')))
  with check (member_id in (select app.member_ids_with('write')));

create policy preventive_completions_select on public.preventive_care_completions for select to authenticated
  using (member_id in (select app.member_ids_with('read')));
create policy preventive_completions_write on public.preventive_care_completions for all to authenticated
  using (member_id in (select app.member_ids_with('write')))
  with check (member_id in (select app.member_ids_with('write')));

-- correction_requests: anyone who can see a record can ask for it to be
-- corrected; resolving is a Super Admin action.
create policy corrections_select on public.correction_requests for select to authenticated
  using (member_id in (select app.member_ids_with('read')));
create policy corrections_insert on public.correction_requests for insert to authenticated
  with check (member_id in (select app.member_ids_with('read'))
              and requested_by = (select auth.uid())
              and status = 'open' and resolved_by is null);
create policy corrections_resolve on public.correction_requests for update to authenticated
  using (family_id in (select app.admin_family_ids()))
  with check (family_id in (select app.admin_family_ids()));

-- notifications: your own, and only while you can still see whose they are.
create policy notifications_select on public.notifications for select to authenticated
  using (recipient_member_id = (select app.current_member_id())
         and (subject_member_id is null or subject_member_id in (select app.member_ids_with('read'))));
create policy notifications_mark_read on public.notifications for update to authenticated
  using (recipient_member_id = (select app.current_member_id()))
  with check (recipient_member_id = (select app.current_member_id()));
revoke insert, update, delete on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- audit_log: Super Admin read-only. No write privileges for any API role.
create policy audit_log_select on public.audit_log for select to authenticated
  using (family_id in (select app.admin_family_ids()));
revoke insert, update, delete, truncate on public.audit_log from authenticated, service_role;

-- wearable_credentials: no policies at all (service role only).
revoke all on public.wearable_credentials from authenticated;

-- Writes that must go through audited RPCs.
revoke insert, update, delete on public.documents from authenticated;
revoke insert, update, delete on public.families from authenticated;
grant update (name) on public.families to authenticated;
revoke insert on public.invitations from authenticated;

-- =============================================================================
-- Timeline (security_invoker: the caller's RLS applies to every branch)
-- =============================================================================
create view public.member_timeline with (security_invoker = true) as
  select d.family_id, d.member_id,
         coalesce(d.document_date, d.filed_at::date) as event_date,
         'document'::text as kind, d.id as ref_id,
         coalesce(d.title, initcap(replace(d.document_type, '_', ' ')), d.original_filename) as title,
         d.provider as detail, d.category
  from public.documents d
  where d.status = 'filed' and d.deleted_at is null
  union all
  select m.family_id, m.member_id, m.started_on, m.kind || '_started', m.id, m.name,
         concat_ws(' · ', m.dose, m.frequency), null
  from public.medications m
  where m.started_on is not null
  union all
  select m.family_id, m.member_id, m.ended_on, m.kind || '_stopped', m.id, m.name, null, null
  from public.medications m
  where m.ended_on is not null
  union all
  select c.family_id, c.member_id, c.completed_on, 'preventive_care', c.id, c.rule_code, c.note, null
  from public.preventive_care_completions c;

revoke all on public.member_timeline from anon;
grant select on public.member_timeline to authenticated;
