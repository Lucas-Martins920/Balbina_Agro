-- Nenhuma função security definer do schema public pode ser chamada sem login (papel anon).
-- Função nova que precise ser pública entra aqui com o motivo; o padrão é revoke from public, anon.
\set ON_ERROR_STOP on

do $$
declare
  v_lista text;
begin
  select string_agg(p.oid::regprocedure::text, ', ') into v_lista
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute');
  if v_lista is not null then
    raise exception 'FALHOU: funções security definer que anon executa: %', v_lista;
  end if;
  raise notice 'ok - nenhuma função security definer do public liberada para anon';
end $$;

do $$
begin
  if not has_function_privilege('authenticated', 'public.salvar_cargo(uuid, uuid, text, text, text[])', 'execute')
     or not has_function_privilege('authenticated', 'public.minha_assinatura(uuid)', 'execute') then
    raise exception 'FALHOU: quem tem login perdeu o acesso às funções';
  end if;
  raise notice 'ok - authenticated segue chamando salvar_cargo e minha_assinatura';
end $$;

set role anon;
do $$
begin
  perform public.apagar_cargo('00000000-0000-0000-0000-000000000001');
  raise exception 'FALHOU: anon chamou apagar_cargo';
exception when insufficient_privilege then
  raise notice 'ok - anon recebe "permission denied" em apagar_cargo';
end $$;
reset role;
