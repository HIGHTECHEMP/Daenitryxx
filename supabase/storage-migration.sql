-- Run after creating a PRIVATE Storage bucket named delivery-proofs.

drop policy if exists "driver proof upload" on storage.objects;
drop policy if exists "proof owner admin read" on storage.objects;
drop policy if exists "proof owner admin delete" on storage.objects;

create policy "driver proof upload" on storage.objects for insert to authenticated
with check (
  bucket_id='delivery-proofs'
  and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='driver')
  and (storage.foldername(name))[1]=auth.uid()::text
  and exists(select 1 from public.shipments s where s.id::text=(storage.foldername(name))[2] and s.driver_id=auth.uid())
);

create policy "proof owner admin read" on storage.objects for select to authenticated
using (
  bucket_id='delivery-proofs'
  and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin() or exists(select 1 from public.shipment_documents d join public.shipments s on s.id=d.shipment_id where d.storage_path=name and (s.customer_id=auth.uid() or s.driver_id=auth.uid())))
);

create policy "proof owner admin delete" on storage.objects for delete to authenticated
using (bucket_id='delivery-proofs' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()));
