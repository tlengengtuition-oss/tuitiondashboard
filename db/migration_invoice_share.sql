-- =====================================================================
-- Shareable invoice links: give each invoice an unguessable token so a
-- parent can open a public "view & pay" page (pay.html?t=<token>) with
-- no login. A security-definer function returns ONLY the invoice that
-- matches the token — anon can't enumerate or read anything else.
-- Run once in the Supabase SQL editor. Additive and backward-compatible.
-- =====================================================================

alter table public.invoices
  add column if not exists share_token uuid not null default gen_random_uuid();

create unique index if not exists invoices_share_token_idx
  on public.invoices (share_token);

-- Public read by token: returns just the rendered invoice, nothing internal.
create or replace function public.invoice_by_token(t uuid)
returns table (invoice_no text, total numeric, status text, html text, title text)
language sql
security definer
stable
set search_path = public
as $$
  select invoice_no, total, status, data->>'html', data->>'title'
  from public.invoices
  where share_token = t
  limit 1;
$$;

revoke all on function public.invoice_by_token(uuid) from public;
grant execute on function public.invoice_by_token(uuid) to anon, authenticated;
