-- =====================================================================
-- Self-reported payment: a parent can tap "I've paid" on the pay link,
-- set the date + (optionally) attach their transaction screenshot, and
-- that marks the invoice paid — no gateway, no manual editing.
-- Depends on migration_invoice_share.sql (share_token) and the receipts
-- bucket. Run once in the Supabase SQL editor. Additive.
-- =====================================================================

alter table public.invoices
  add column if not exists self_reported boolean not null default false;

-- Is this a real invoice share token? Used by the storage policy below so a
-- parent can only upload under a folder named after a token that exists.
create or replace function public.is_valid_share_token(t uuid)
returns boolean
language sql security definer stable set search_path = public
as $$ select exists (select 1 from public.invoices where share_token = t); $$;
revoke all on function public.is_valid_share_token(uuid) from public;
grant execute on function public.is_valid_share_token(uuid) to anon, authenticated;

-- Parent marks their invoice paid (by token). Also settles the invoice's lessons
-- so the Ledger stays consistent. Idempotent; only the token holder can call it
-- for their own invoice (they can't touch anyone else's).
create or replace function public.mark_invoice_paid_by_token(t uuid, p_date date, p_proof text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.invoices
     set status = 'paid', paid_date = p_date, self_reported = true,
         proof_path = coalesce(p_proof, proof_path)
   where share_token = t;

  update public.lessons
     set paid = true, paid_date = p_date
   where id::text in (
     select jsonb_array_elements_text(i.data->'lesson_ids')
     from public.invoices i where i.share_token = t
   );
end; $$;
revoke all on function public.mark_invoice_paid_by_token(uuid, date, text) from public;
grant execute on function public.mark_invoice_paid_by_token(uuid, date, text) to anon, authenticated;

-- Let a parent (anon) upload their screenshot to shared/<token>/… for a valid token,
-- and let the owning tutor read those files (for the Proof column on the Invoices page).
create policy "receipts_anon_insert_shared" on storage.objects for insert to anon
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = 'shared'
    and public.is_valid_share_token(((storage.foldername(name))[2])::uuid)
  );

create policy "receipts_owner_read_shared" on storage.objects for select to authenticated
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = 'shared'
    and exists (
      select 1 from public.invoices i
      where i.share_token = ((storage.foldername(name))[2])::uuid
        and i.tutor_id = auth.uid()
    )
  );
