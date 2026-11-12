
-- Owner creates private customer accounts with a temporary password;
-- changing encrypted_password through Supabase Auth clears the change requirement.
alter table public.customer_accounts
add column if not exists must_change_password boolean not null default false;

create or replace function private.customer_password_updated()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  update public.customer_accounts
     set must_change_password=false, updated_at=now()
   where user_id=new.id;
  return new;
end;
$$;
revoke all on function private.customer_password_updated() from PUBLIC,anon,authenticated;
drop trigger if exists mi_ruta_customer_password_changed on auth.users;
create trigger mi_ruta_customer_password_changed
after update of encrypted_password on auth.users
for each row when(old.encrypted_password is distinct from new.encrypted_password)
execute function private.customer_password_updated();
