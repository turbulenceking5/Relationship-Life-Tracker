-- Relationship Life Tracker — initial schema
-- This runs in its own dedicated Supabase project (see
-- docs/09-setup-supabase.md), so table names need no app-specific prefix.

-- ============================================================
-- households + membership
-- ============================================================
create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  default_currency text not null default 'GBP',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.households enable row level security;

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

alter table public.household_members enable row level security;

create function public.is_household_member(hid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.household_members hm
    where hm.household_id = hid and hm.user_id = auth.uid()
  );
$$;

create policy "households: members can view"
  on public.households for select
  using (public.is_household_member(id));

create policy "household_members: members can view roster"
  on public.household_members for select
  using (public.is_household_member(household_id));

-- No direct insert/update/delete policies on households or
-- household_members: joining/creating goes through the SECURITY DEFINER
-- RPCs below, which bypass RLS as the function owner. This prevents a
-- client from inserting itself into an arbitrary household without a
-- valid invite code.

create function public.generate_invite_code()
returns text
language sql
volatile
as $$
  select upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
$$;

create function public.create_household(p_name text)
returns public.households
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household public.households;
begin
  insert into public.households (name, invite_code, created_by)
  values (p_name, public.generate_invite_code(), auth.uid())
  returning * into v_household;

  insert into public.household_members (household_id, user_id, role)
  values (v_household.id, auth.uid(), 'owner');

  return v_household;
end;
$$;

create function public.join_household(p_invite_code text)
returns public.households
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household public.households;
begin
  select * into v_household
  from public.households
  where invite_code = upper(trim(p_invite_code));

  if not found then
    raise exception 'Invalid invite code';
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (v_household.id, auth.uid(), 'member')
  on conflict (household_id, user_id) do nothing;

  return v_household;
end;
$$;

-- ============================================================
-- profiles
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_emoji text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create function public.shares_household(other_user uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members hm1
    join public.household_members hm2 on hm1.household_id = hm2.household_id
    where hm1.user_id = auth.uid() and hm2.user_id = other_user
  );
$$;

create policy "profiles: self or household-mate can view"
  on public.profiles for select
  using (id = auth.uid() or public.shares_household(id));

create policy "profiles: self can update"
  on public.profiles for update
  using (id = auth.uid());

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- shared updated_at trigger helper
-- ============================================================
create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- events
-- ============================================================
create table public.events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null,
  description text,
  category text,
  event_date date not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.events enable row level security;
create index events_household_idx on public.events (household_id, event_date);

create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

create policy "events: members can manage"
  on public.events for all
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- ============================================================
-- expenses
-- ============================================================
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null,
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null default 'GBP',
  category text,
  paid_by uuid references auth.users(id),
  expense_date date not null default current_date,
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.expenses enable row level security;
create index expenses_household_idx on public.expenses (household_id, expense_date desc);

create trigger expenses_set_updated_at
  before update on public.expenses
  for each row execute function public.set_updated_at();

create policy "expenses: members can manage"
  on public.expenses for all
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- ============================================================
-- replacement_items
-- ============================================================
create table public.replacement_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  category text,
  last_replaced_date date not null default current_date,
  interval_days integer not null check (interval_days > 0),
  next_due_date date generated always as (last_replaced_date + interval_days) stored,
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.replacement_items enable row level security;
create index replacement_items_household_idx on public.replacement_items (household_id, next_due_date);

create trigger replacement_items_set_updated_at
  before update on public.replacement_items
  for each row execute function public.set_updated_at();

create policy "replacement_items: members can manage"
  on public.replacement_items for all
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- ============================================================
-- repayments
-- ============================================================
create table public.repayments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null,
  direction text not null default 'owed_by_us' check (direction in ('owed_by_us', 'owed_to_us')),
  counterparty text,
  total_amount numeric(12, 2) not null check (total_amount >= 0),
  remaining_amount numeric(12, 2) not null check (remaining_amount >= 0),
  currency text not null default 'GBP',
  due_date date,
  recurring boolean not null default false,
  frequency text,
  status text not null default 'active' check (status in ('active', 'paid', 'overdue', 'cancelled')),
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.repayments enable row level security;
create index repayments_household_idx on public.repayments (household_id, due_date);

create trigger repayments_set_updated_at
  before update on public.repayments
  for each row execute function public.set_updated_at();

create policy "repayments: members can manage"
  on public.repayments for all
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- ============================================================
-- documents
-- ============================================================
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null,
  category text,
  file_path text not null,
  file_name text not null,
  mime_type text,
  related_type text check (related_type in ('replacement_item', 'repayment', 'expense', 'event')),
  related_id uuid,
  expiry_date date,
  notes text,
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.documents enable row level security;
create index documents_household_idx on public.documents (household_id, created_at desc);

create policy "documents: members can manage"
  on public.documents for all
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- ============================================================
-- storage: private "documents" bucket, folder-per-household
-- path convention: {household_id}/{uuid}-{filename}
-- ============================================================
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "documents storage: members can read"
  on storage.objects for select
  using (
    bucket_id = 'documents'
    and public.is_household_member(((storage.foldername(name))[1])::uuid)
  );

create policy "documents storage: members can upload"
  on storage.objects for insert
  with check (
    bucket_id = 'documents'
    and public.is_household_member(((storage.foldername(name))[1])::uuid)
  );

create policy "documents storage: members can delete"
  on storage.objects for delete
  using (
    bucket_id = 'documents'
    and public.is_household_member(((storage.foldername(name))[1])::uuid)
  );
