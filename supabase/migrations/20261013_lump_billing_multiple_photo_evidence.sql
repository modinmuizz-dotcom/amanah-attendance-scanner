-- Multiple private photo-evidence attachments per certified lump-sum billing.
-- Existing single PDF/photo evidence remains supported.
begin;
alter table public.amanah_lump_billings
  add column if not exists evidence_photos text[] not null default '{}'::text[];

create or replace function public.amanah_lump_submit_billing_with_photos(
  p_contract_id uuid,
  p_milestone text,
  p_pct numeric,
  p_evidence text,
  p_description text,
  p_recovery numeric,
  p_tax numeric,
  p_photos text[]
)
returns uuid
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_photos text[] := coalesce(p_photos, '{}'::text[]);
  v_photo text;
  v_path text;
  v_id uuid;
  v_primary text;
begin
  if auth.uid() is null or not public.amanah_lump_can('CREATE') then
    raise exception 'You are not authorized to attach billing evidence';
  end if;
  if cardinality(v_photos) > 10 then
    raise exception 'Maximum 10 additional photo evidence files per billing';
  end if;
  if exists (select 1 from unnest(v_photos) as image_url
             group by image_url having count(*) > 1) then
    raise exception 'Duplicate photo evidence is not allowed';
  end if;
  foreach v_photo in array v_photos loop
    if v_photo is null or left(v_photo,17) <> 'private-evidence:' then
      raise exception 'Photo evidence must be a privately uploaded picture';
    end if;
    v_path := substring(v_photo from 18);
    -- Extra photos must be uploads made by this user, not arbitrary paths
    -- or URLs for other companies' private documents.
    if v_path not like auth.uid()::text || '/%' then
      raise exception 'Photo evidence does not belong to the signed-in uploader';
    end if;
    if lower(v_path) !~ '\.(jpe?g|png|webp)$' then
      raise exception 'Additional evidence must be JPG, PNG or WEBP pictures';
    end if;
    if not exists(
      select 1 from storage.objects
      where bucket_id='amanah-lump-evidence' and name=v_path
    ) then raise exception 'Photo evidence upload was not found';end if;
  end loop;

  -- Photos alone satisfy the existing requirement to provide evidence.
  v_primary := coalesce(nullif(btrim(p_evidence),''),v_photos[1]);
  v_id := public.amanah_lump_submit_billing(
    p_contract_id,p_milestone,p_pct,v_primary,p_description,p_recovery,p_tax
  );
  update public.amanah_lump_billings
  set evidence_photos=v_photos
  where id=v_id;
  return v_id;
end
$function$;
revoke all on function public.amanah_lump_submit_billing_with_photos(
  uuid,text,numeric,text,text,numeric,numeric,text[]) from public,anon;
grant execute on function public.amanah_lump_submit_billing_with_photos(
  uuid,text,numeric,text,text,numeric,numeric,text[]) to authenticated;
comment on column public.amanah_lump_billings.evidence_photos is
 'Private image paths, additional to the original evidence_url, viewable via signed links by authorized reviewers.';
commit;