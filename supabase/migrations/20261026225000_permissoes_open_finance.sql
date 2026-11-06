-- Permissões nas peças do Open Finance (migration 20261026210000, que roda depois da de permissões).
-- Conectar banco cria conexão e contas financeiras: vale conciliacao.editar ou contas.editar.

do $$
declare
  r record;
  v_cond text;
begin
  for r in select * from (values
    ('conexoes_bancarias', array['conciliacao.editar', 'contas.editar']),
    ('contas_financeiras', array['contas.editar', 'cartoes.editar', 'cobrancas.emitir', 'pdv.operar', 'conciliacao.editar'])
  ) t(tabela, perms)
  loop
    v_cond := format('app.pode_algum(empresa_id, %L::text[])', r.perms);
    execute format('drop policy if exists escrita_inserir on %I', r.tabela);
    execute format('drop policy if exists escrita_alterar on %I', r.tabela);
    execute format('drop policy if exists escrita_apagar on %I', r.tabela);
    execute format('create policy escrita_inserir on %I as restrictive for insert with check (%s)', r.tabela, v_cond);
    execute format('create policy escrita_alterar on %I as restrictive for update using (%s) with check (%s)', r.tabela, v_cond, v_cond);
    execute format('create policy escrita_apagar on %I as restrictive for delete using (%s)', r.tabela, v_cond);
  end loop;
end $$;
