-- NF-e dos pedidos pela Focus NFe.
\set ON_ERROR_STOP on

create or replace function pg_temp.espera_erro(p_sql text, p_trecho text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FALHOU: era esperado erro contendo "%" em: %', p_trecho, p_sql;
exception when others then
  if sqlerrm like 'FALHOU:%' then raise; end if;
  if position(p_trecho in sqlerrm) = 0 then
    raise exception 'FALHOU: erro diferente do esperado. Esperado "%", veio "%"', p_trecho, sqlerrm;
  end if;
end $$;

create or replace function pg_temp.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'FALHOU: %', p_msg; end if;
  raise notice 'ok - %', p_msg;
end $$;

set role authenticated;
set request.jwt.claim.sub = '95959595-9595-9595-9595-959595959595';
select set_config('t.emp', criar_empresa('95000111000195', 'Piscicultura N Ltda')::text, false);
insert into contatos (id, empresa_id, tipos, nome, cpf_cnpj, cidade, uf, endereco) values
  ('96000000-0000-0000-0000-0000000000c1', current_setting('t.emp')::uuid, '{cliente}', 'Mercado N', '12312312000199', null, null, '{}');
select ajustar_estoque_peixe(current_setting('t.emp')::uuid, (select id from classes_peixe where empresa_id = current_setting('t.emp')::uuid and nome = 'Extra'), 100, 'inventário');
select set_config('t.cx', (select id::text from produtos where empresa_id = current_setting('t.emp')::uuid and nome = 'Caixa 20 kg · peixe extra'), false);
select set_config('t.ped', criar_pedido(current_setting('t.emp')::uuid, '96000000-0000-0000-0000-0000000000c1',
  jsonb_build_array(jsonb_build_object('produto_id', current_setting('t.cx'), 'quantidade', 3, 'preco_unit_cents', 18000)))::text, false);

select pg_temp.espera_erro(format('select preparar_nfe(%L)', current_setting('t.ped')), 'Fature o pedido');
select faturar_pedido(current_setting('t.ped')::uuid);
select pg_temp.espera_erro(format('select preparar_nfe(%L)', current_setting('t.ped')), 'rua, número, bairro, CEP, cidade, UF');
update contatos set endereco = '{"logradouro":"Rua A","numero":"10","bairro":"Centro","cep":"90000000"}', cidade = 'Porto Alegre', uf = 'RS'
where id = '96000000-0000-0000-0000-0000000000c1';

select set_config('t.nf', preparar_nfe(current_setting('t.ped')::uuid)::text, false);
select pg_temp.ok((select status = 'processando' and valor_total_cents = 54000 and provedor_ref like 'balbina-%' and serie = 1 from notas_fiscais where id = current_setting('t.nf')::uuid),
  'nota aberta com o total do pedido e referência para a Focus');
select pg_temp.espera_erro(format('select preparar_nfe(%L)', current_setting('t.ped')), 'já tem uma nota');
select pg_temp.ok((select count(*) = 1 and min(ncm) = '03028990' and min(quantidade) = 3 from nfe_itens where pedido_id = current_setting('t.ped')::uuid), 'item com NCM de peixe fresco');

select pg_temp.ok((select app.config_fiscal(e)->>'icms_situacao' from empresas e where id = current_setting('t.emp')::uuid) = '400', 'Simples usa CSOSN 400 por padrão');
update empresas set config_fiscal = '{"icms_situacao":"300"}' where id = current_setting('t.emp')::uuid;
select pg_temp.ok((select x->>'icms_situacao' = '300' and x->>'cfop_interna' = '5101' from config_fiscal_empresa(current_setting('t.emp')::uuid) x), 'configuração da empresa vence o padrão');

update notas_fiscais set status = 'rejeitada', motivo_rejeicao = 'teste' where id = current_setting('t.nf')::uuid;
select pg_temp.ok(preparar_nfe(current_setting('t.ped')::uuid) is not null, 'nota rejeitada pode ser reemitida');

-- Produtor rural pessoa física: CPF + inscrição estadual
set request.jwt.claim.sub = '95959595-9595-9595-9595-959595959596';
select pg_temp.espera_erro($$select criar_empresa('95011122233', 'João Produtor')$$, 'precisa da inscrição estadual');
select set_config('t.pr', criar_empresa('950.111.222-33', 'João Produtor', 'Piscicultura do João', '096/7654321')::text, false);
select pg_temp.ok((select regime_tributario = 'produtor_rural' and inscricao_estadual = '0967654321' and cnpj = '95011122233' from empresas where id = current_setting('t.pr')::uuid),
  'produtor rural criado com CPF e IE');
select pg_temp.ok((select x->>'pis_situacao' = '08' and x->>'icms_situacao' = '40' and (x->>'funrural_percentual')::numeric = 1.5 from config_fiscal_empresa(current_setting('t.pr')::uuid) x),
  'padrões fiscais do produtor rural');
select pg_temp.espera_erro($$select criar_empresa('1234567890', 'X')$$, 'Informe o CNPJ');

set request.jwt.claim.sub = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
select pg_temp.ok((select count(*) from notas_fiscais where empresa_id = current_setting('t.emp')::uuid) = 0, 'notas isoladas por empresa');
select pg_temp.espera_erro(format('select preparar_nfe(%L)', current_setting('t.ped')), 'não encontrado');

reset role;
\o
\echo 'TESTES DA NF-e PASSARAM'
