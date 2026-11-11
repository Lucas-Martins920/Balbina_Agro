-- Importação por planilha modelo: produtos no pacote, idempotência por chave, trava do plano
-- (Basic não importa financeiro) e histórico de quem importou.
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

insert into auth.users (id, email, email_confirmed_at) values
  ('99e70000-0000-0000-0000-0000000000a1', 'dono@planilha.com', now());

set role authenticated;
set request.jwt.claim.sub = '99e70000-0000-0000-0000-0000000000a1';
select set_config('t.emp', criar_empresa('98777666000155', 'Piscicultura Planilha Ltda')::text, false);

select set_config('t.pacote', $j${
  "origem": "planilha",
  "contas": [{"nome": "Caixa da piscicultura", "tipo": "caixinha"}],
  "contatos": [{"chave": "contato:7", "nome": "Mercado Central", "tipos": ["cliente"]}],
  "produtos": [
    {"nome": "Milho moído", "tipo": "insumo_racao", "unidade": "kg", "sku": "MIL01", "estoque_minimo": 500},
    {"nome": "Caixa de papelão", "tipo": "embalagem", "unidade": "un"},
    {"nome": "Peixe extra", "tipo": "peixe", "unidade": "kg"}
  ],
  "titulos": [
    {"chave": "lanc:abc#1", "tipo": "receber", "descricao": "Venda de peixes", "contato": "Mercado Central", "vencimento": "2026-03-10",
     "valor_cents": 90000, "rateio": [{"categoria": "Venda de peixes", "valor_cents": 90000}],
     "baixas": [{"chave": "lanc:abc#1:pg", "conta": "Caixa da piscicultura", "data": "2026-03-10", "valor_cents": 90000}]}
  ]
}$j$, false);

select set_config('t.r', importar_pacote(current_setting('t.emp')::uuid, current_setting('t.pacote')::jsonb)::text, false);
select pg_temp.ok((current_setting('t.r')::jsonb->>'produtos')::int = 2, 'importa produtos e ignora o pescado (vem das classes)');
select pg_temp.ok((select estoque_minimo from produtos where empresa_id = current_setting('t.emp')::uuid and nome = 'Milho moído') = 500,
  'produto com estoque mínimo e código');
select pg_temp.ok((select tipo from produtos where empresa_id = current_setting('t.emp')::uuid and nome = 'Milho moído') = 'outro', 'insumo de ração da planilha antiga entra como outro (fábrica desativada)');
select pg_temp.ok((select pago_cents from agendamentos where empresa_id = current_setting('t.emp')::uuid and descricao = 'Venda de peixes') = 90000,
  'lançamento da planilha entra com a baixa');

-- mandar a mesma planilha de novo não duplica nada; produto existente só é completado
select set_config('t.r', importar_pacote(current_setting('t.emp')::uuid,
  jsonb_set(current_setting('t.pacote')::jsonb, '{produtos,1}', '{"nome": "CAIXA DE PAPELAO", "tipo": "outro", "unidade": "cx", "ncm": "4819.10.00"}'))::text, false);
select pg_temp.ok((current_setting('t.r')::jsonb->>'titulos_ja_importados')::int = 1
  and (select count(*) from agendamentos where empresa_id = current_setting('t.emp')::uuid) = 1
  and (select count(*) from baixas where empresa_id = current_setting('t.emp')::uuid) = 1, 'reenviar a planilha não duplica');
select pg_temp.ok((select count(*) from produtos where empresa_id = current_setting('t.emp')::uuid and tipo <> 'peixe') = 2
  and (select (tipo, unidade, ncm) = ('embalagem', 'un', '4819.10.00') from produtos
        where empresa_id = current_setting('t.emp')::uuid and nome = 'Caixa de papelão'),
  'produto que já existe é completado sem mudar tipo e unidade');

select pg_temp.ok((select count(*) from audit_log where empresa_id = current_setting('t.emp')::uuid and tabela = 'produtos' and acao = 'insert'
  and usuario = 'dono@planilha.com' and depois->>'nome' in ('Milho moído', 'Caixa de papelão')) = 2, 'histórico registra quem importou');

-- plano Basic: cadastros e produtos entram, financeiro não
reset role;
update assinaturas set plano_id = 'basic-mensal', status = 'ativa', teste_ate = app.hoje_brasil() - 1, pago_ate = app.hoje_brasil() + 20
 where empresa_id = current_setting('t.emp')::uuid;
set role authenticated;
select pg_temp.espera_erro(format($$select importar_pacote(%L, %L)$$, current_setting('t.emp'),
  '{"origem": "planilha", "titulos": [{"chave": "x", "tipo": "pagar", "descricao": "Milho", "vencimento": "2026-03-01", "valor_cents": 100}]}'),
  'O financeiro não faz parte do plano');
select pg_temp.espera_erro(format($$select importar_pacote(%L, %L)$$, current_setting('t.emp'),
  '{"origem": "planilha", "categorias": [{"nome": "Milho", "sentido": "saida"}]}'), 'O financeiro não faz parte do plano');
select pg_temp.ok((importar_pacote(current_setting('t.emp')::uuid, '{"origem": "planilha",
  "contatos": [{"nome": "Fornecedor Basic", "tipos": ["fornecedor"]}], "produtos": [{"nome": "Vacina X", "tipo": "vacina", "unidade": "dose"}]}')
  ->>'produtos')::int = 1, 'Basic importa cadastros e produtos');

reset role;
