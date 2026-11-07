-- Zerar o sistema também apaga as leituras das sondas (movimento). As sondas em si são cadastro
-- (ligadas aos viveiros) e ficam. Mesmo padrão da migration 20261105000005: a função zerar_sistema
-- é ajustada por texto, e a troca falha se o trecho de referência tiver mudado.
do $$
declare v text;
begin
  v := pg_get_functiondef('public.zerar_sistema(uuid, text, text)'::regprocedure);
  if position('  delete from biometrias where empresa_id = p_empresa;' in v) = 0 then
    raise exception 'zerar_sistema mudou: revise onde apagar leituras_sonda';
  end if;
  v := replace(v, '  delete from biometrias where empresa_id = p_empresa;',
                  '  delete from biometrias where empresa_id = p_empresa;' || chr(10) ||
                  '  delete from leituras_sonda where empresa_id = p_empresa;');
  execute v;
end $$;
