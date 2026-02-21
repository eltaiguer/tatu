-- Tatu schema (Core + Next, soft delete)
-- Safe to run multiple times.

create extension if not exists pgcrypto;

create table if not exists public.import_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  file_type text not null check (file_type in ('credit_card', 'bank_account_usd', 'bank_account_uyu')),
  file_checksum text not null,
  status text not null check (status in ('processing', 'completed', 'failed')),
  total_rows integer not null default 0 check (total_rows >= 0),
  inserted_rows integer not null default 0 check (inserted_rows >= 0),
  duplicate_rows integer not null default 0 check (duplicate_rows >= 0),
  error_message text,
  started_at timestamptz not null default timezone('utc', now()),
  finished_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.import_runs
  add column if not exists file_checksum text,
  add column if not exists started_at timestamptz not null default timezone('utc', now()),
  add column if not exists finished_at timestamptz,
  add column if not exists created_at timestamptz not null default timezone('utc', now());

update public.import_runs
set file_checksum = coalesce(file_checksum, 'legacy');

alter table public.import_runs
  alter column file_checksum set not null;

create table if not exists public.transactions (
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_id text not null,
  date timestamptz not null,
  description text not null check (length(trim(description)) > 0),
  amount numeric(14,2) not null check (amount >= 0),
  currency text not null check (currency in ('USD', 'UYU')),
  type text not null check (type in ('debit', 'credit')),
  source text not null check (source in ('credit_card', 'bank_account')),
  category text,
  tags text[] not null default '{}'::text[],
  category_confidence numeric(4,3) check (category_confidence is null or (category_confidence >= 0 and category_confidence <= 1)),
  balance numeric(14,2),
  raw_data jsonb not null default '{}'::jsonb,
  import_id uuid references public.import_runs(id) on delete set null,
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, transaction_id),
  constraint transactions_soft_delete_consistency check (
    (is_deleted = false and deleted_at is null) or
    (is_deleted = true and deleted_at is not null)
  )
);

alter table public.transactions
  add column if not exists import_id uuid references public.import_runs(id) on delete set null,
  add column if not exists tags text[] not null default '{}'::text[],
  add column if not exists is_deleted boolean not null default false,
  add column if not exists deleted_at timestamptz,
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table public.transactions
  alter column amount type numeric(14,2),
  alter column balance type numeric(14,2),
  alter column category_confidence type numeric(4,3);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'transactions_soft_delete_consistency'
      and conrelid = 'public.transactions'::regclass
  ) then
    alter table public.transactions
      add constraint transactions_soft_delete_consistency check (
        (is_deleted = false and deleted_at is null) or
        (is_deleted = true and deleted_at is not null)
      );
  end if;
end $$;

create table if not exists public.category_overrides (
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant_normalized text not null,
  merchant_original text,
  category text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, merchant_normalized)
);

alter table public.category_overrides
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

create table if not exists public.custom_categories (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  label text not null check (length(trim(label)) > 0),
  color text not null check (color ~ '^#([0-9A-Fa-f]{6})$'),
  icon text,
  is_archived boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, id)
);

alter table public.custom_categories
  add column if not exists is_archived boolean not null default false,
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

create index if not exists idx_transactions_user_date_active
  on public.transactions (user_id, date desc)
  where is_deleted = false;

create index if not exists idx_transactions_user_category_active
  on public.transactions (user_id, category)
  where is_deleted = false;

create index if not exists idx_transactions_user_source_active
  on public.transactions (user_id, source)
  where is_deleted = false;

create index if not exists idx_transactions_tags_gin
  on public.transactions using gin (tags);

create index if not exists idx_transactions_raw_data_gin
  on public.transactions using gin (raw_data);

create index if not exists idx_import_runs_user_started
  on public.import_runs (user_id, started_at desc);

create index if not exists idx_import_runs_user_checksum
  on public.import_runs (user_id, file_checksum);

create index if not exists idx_category_overrides_user_updated
  on public.category_overrides (user_id, updated_at desc);

create index if not exists idx_custom_categories_user_active
  on public.custom_categories (user_id, is_archived, label);

create or replace function public.set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.enforce_soft_delete_timestamp()
returns trigger
language plpgsql
as $$
begin
  if new.is_deleted = true and old.is_deleted = false then
    new.deleted_at = timezone('utc', now());
  elsif new.is_deleted = false and old.is_deleted = true then
    new.deleted_at = null;
  end if;

  return new;
end;
$$;

drop trigger if exists set_transactions_updated_at on public.transactions;
create trigger set_transactions_updated_at
before update on public.transactions
for each row
execute function public.set_updated_at_timestamp();

drop trigger if exists enforce_transactions_soft_delete on public.transactions;
create trigger enforce_transactions_soft_delete
before update on public.transactions
for each row
execute function public.enforce_soft_delete_timestamp();

drop trigger if exists set_category_overrides_updated_at on public.category_overrides;
create trigger set_category_overrides_updated_at
before update on public.category_overrides
for each row
execute function public.set_updated_at_timestamp();

drop trigger if exists set_custom_categories_updated_at on public.custom_categories;
create trigger set_custom_categories_updated_at
before update on public.custom_categories
for each row
execute function public.set_updated_at_timestamp();

alter table public.transactions enable row level security;
alter table public.import_runs enable row level security;
alter table public.category_overrides enable row level security;
alter table public.custom_categories enable row level security;

grant select, insert, update, delete on table public.transactions to authenticated;
grant select, insert, update, delete on table public.import_runs to authenticated;
grant select, insert, update, delete on table public.category_overrides to authenticated;
grant select, insert, update, delete on table public.custom_categories to authenticated;

drop policy if exists "transactions_select_own" on public.transactions;
create policy "transactions_select_own"
on public.transactions
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "transactions_insert_own" on public.transactions;
create policy "transactions_insert_own"
on public.transactions
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "transactions_update_own" on public.transactions;
create policy "transactions_update_own"
on public.transactions
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "transactions_delete_own" on public.transactions;
create policy "transactions_delete_own"
on public.transactions
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "import_runs_select_own" on public.import_runs;
create policy "import_runs_select_own"
on public.import_runs
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "import_runs_insert_own" on public.import_runs;
create policy "import_runs_insert_own"
on public.import_runs
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "import_runs_update_own" on public.import_runs;
create policy "import_runs_update_own"
on public.import_runs
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "import_runs_delete_own" on public.import_runs;
create policy "import_runs_delete_own"
on public.import_runs
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "category_overrides_select_own" on public.category_overrides;
create policy "category_overrides_select_own"
on public.category_overrides
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "category_overrides_insert_own" on public.category_overrides;
create policy "category_overrides_insert_own"
on public.category_overrides
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "category_overrides_update_own" on public.category_overrides;
create policy "category_overrides_update_own"
on public.category_overrides
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "category_overrides_delete_own" on public.category_overrides;
create policy "category_overrides_delete_own"
on public.category_overrides
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "custom_categories_select_own" on public.custom_categories;
create policy "custom_categories_select_own"
on public.custom_categories
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "custom_categories_insert_own" on public.custom_categories;
create policy "custom_categories_insert_own"
on public.custom_categories
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "custom_categories_update_own" on public.custom_categories;
create policy "custom_categories_update_own"
on public.custom_categories
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "custom_categories_delete_own" on public.custom_categories;
create policy "custom_categories_delete_own"
on public.custom_categories
for delete
to authenticated
using (auth.uid() = user_id);
