-- Tatu transactions table for Supabase
-- Safe to run multiple times.

create table if not exists public.transactions (
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_id text not null,
  date timestamptz not null,
  description text not null,
  amount numeric not null,
  currency text not null check (currency in ('USD', 'UYU')),
  type text not null check (type in ('debit', 'credit')),
  source text not null check (source in ('credit_card', 'bank_account')),
  category text,
  category_confidence numeric,
  balance numeric,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, transaction_id)
);

create index if not exists idx_transactions_user_date
  on public.transactions (user_id, date desc);

create or replace function public.set_transactions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_transactions_updated_at on public.transactions;
create trigger set_transactions_updated_at
before update on public.transactions
for each row
execute function public.set_transactions_updated_at();

alter table public.transactions enable row level security;

grant select, insert, update, delete on table public.transactions to authenticated;

drop policy if exists "users can select own transactions" on public.transactions;
create policy "users can select own transactions"
on public.transactions
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "users can insert own transactions" on public.transactions;
create policy "users can insert own transactions"
on public.transactions
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "users can update own transactions" on public.transactions;
create policy "users can update own transactions"
on public.transactions
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users can delete own transactions" on public.transactions;
create policy "users can delete own transactions"
on public.transactions
for delete
to authenticated
using (auth.uid() = user_id);
