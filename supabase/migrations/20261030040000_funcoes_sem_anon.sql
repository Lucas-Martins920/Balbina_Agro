-- Verificação dos 27 pontos de segurança (2026-10-30): funções security definer do schema public que o
-- papel anon (sem login) ainda conseguia chamar. O Postgres dá EXECUTE a PUBLIC em toda função nova, então
-- o "revoke ... from anon" do 20261029224500 não bastava: anon herdava pelo PUBLIC. Todas já recusavam
-- por dentro (exige_master etc.), mas respondiam "Cargo não encontrado" e afins, o que confirma ids.
-- Aqui ficam só para quem tem login (authenticated) e para a chave de serviço.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as assinatura
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')
  loop
    execute format('revoke all on function %s from public, anon', f.assinatura);
    execute format('grant execute on function %s to authenticated, service_role', f.assinatura);
  end loop;
end $$;
