-- Importação (NIBO / planilhas): cadastros casados por nome e documento, títulos com rateio e baixas,
-- idempotência e regras de conciliação aprendidas do histórico.
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
  ('99300000-0000-0000-0000-0000000000a1', 'dono@importacao.com', now()),
  ('99300000-0000-0000-0000-0000000000a2', 'auxiliar@importacao.com', now());

set role authenticated;
set request.jwt.claim.sub = '99300000-0000-0000-0000-0000000000a1';
select set_config('t.emp', criar_empresa('99333444000155', 'Piscicultura Importação Ltda')::text, false);
select convidar_usuario(current_setting('t.emp')::uuid, 'auxiliar@importacao.com', 'financeiro', '{}', false);

select set_config('t.pacote', $j${
  "origem": "nibo",
  "categorias": [
    {"nome": "Venda de Peixes", "sentido": "entrada", "grupo": "receita_operacional"},
    {"nome": "Insumos", "sentido": "saida", "grupo": "custo_operacional"},
    {"nome": "Milho", "sentido": "saida", "pai": "Insumos"},
    {"nome": "Energia", "sentido": "saida", "grupo": "custo_operacional", "codigo": "2.9"}
  ],
  "centros_custo": [{"nome": "Viveiro 1"}, {"nome": "Comercial"}],
  "contas": [
    {"chave": "acc1", "nome": "Sicredi", "tipo": "corrente", "banco_codigo": "748", "saldo_inicial_cents": 150000, "saldo_inicial_data": "2026-01-01"},
    {"chave": "acc2", "nome": "Caixa da piscicultura", "tipo": "caixinha"}
  ],
  "contatos": [
    {"chave": "c1", "nome": "Mercado Bom Preço", "tipos": ["cliente"], "cpf_cnpj": "11.222.333/0001-81", "cidade": "Manaus", "uf": "am"},
    {"chave": "f1", "nome": "Cerealista Norte", "tipos": ["fornecedor"], "cpf_cnpj": "12345678909", "produtor_rural": true},
    {"nome": "Cliente Sem Doc", "tipos": ["cliente"], "cpf_cnpj": "123"}
  ],
  "titulos": [
    {"chave": "s1", "tipo": "receber", "descricao": "Venda peixe jan", "contato_chave": "c1", "vencimento": "2026-01-10", "valor_cents": 100000,
     "rateio": [{"categoria": "Venda de Peixes", "centro_custo": "Comercial", "valor_cents": 100000}],
     "baixas": [{"conta_chave": "acc1", "data": "2026-01-10", "valor_cents": 100000}]},
    {"chave": "s2", "tipo": "pagar", "descricao": "Milho", "contato_chave": "f1", "vencimento": "2026-01-15", "valor_cents": 50000,
     "rateio": [{"categoria": "Milho", "categoria_pai": "Insumos", "centro_custo": "Viveiro 1", "valor_cents": 30000},
                {"categoria": "Energia", "valor_cents": 19999}],
     "baixas": [{"conta": "Sicredi", "data": "2026-01-16", "valor_cents": 50500}]},
    {"chave": "s3", "tipo": "pagar", "descricao": "Milho fev", "contato_chave": "f1", "vencimento": "2026-02-15", "valor_cents": 40000,
     "rateio": [{"categoria": "Milho", "categoria_pai": "Insumos", "valor_cents": 40000}]},
    {"chave": "s4", "tipo": "pagar", "descricao": "Sem categoria", "contato": "Fornecedor Novo", "vencimento": "2026-02-20", "valor_cents": 1234},
    {"chave": "s5", "tipo": "pagar", "descricao": "Sem valor", "vencimento": "2026-02-20", "valor_cents": 0}
  ],
  "transferencias": [
    {"chave": "t1", "origem_chave": "acc1", "destino_chave": "acc2", "data": "2026-01-20", "valor_cents": 20000, "descricao": "Troco"}
  ]
}$j$, false);

-- só o master importa
set request.jwt.claim.sub = '99300000-0000-0000-0000-0000000000a2';
select aceitar_convites();
select pg_temp.espera_erro(format($$select importar_pacote(%L, %L::jsonb)$$, current_setting('t.emp'), current_setting('t.pacote')),
  'Só o usuário master');
set request.jwt.claim.sub = '99300000-0000-0000-0000-0000000000a1';

select set_config('t.res', importar_pacote(current_setting('t.emp')::uuid, current_setting('t.pacote')::jsonb)::text, false);
select pg_temp.ok((current_setting('t.res')::jsonb->>'titulos')::int = 4, 'importa 4 títulos válidos e ignora o sem valor');
select pg_temp.ok((current_setting('t.res')::jsonb->>'baixas')::int = 2, 'importa as baixas');
select pg_temp.ok((current_setting('t.res')::jsonb->>'transferencias')::int = 1, 'importa a transferência');
select pg_temp.ok((current_setting('t.res')::jsonb->>'total_avisos')::int = 2, 'avisa do documento inválido e do título sem valor');

select pg_temp.ok((select count(*) = 1 from categorias where empresa_id = current_setting('t.emp')::uuid and nome = 'Venda de peixes'),
  '"Venda de Peixes" casa com a categoria padrão, sem duplicar');
select pg_temp.ok((select count(*) = 1 from categorias c join categorias p on p.id = c.parent_id
                   where c.empresa_id = current_setting('t.emp')::uuid and c.nome = 'Milho' and p.nome = 'Insumos'),
  'subcategoria criada debaixo do pai importado');
select pg_temp.ok((select codigo = '2.9' and grupo = 'custo_operacional' from categorias
                   where empresa_id = current_setting('t.emp')::uuid and nome = 'Energia'), 'categoria nova com grupo e código');
select pg_temp.ok((select count(*) = 1 from contas_financeiras where empresa_id = current_setting('t.emp')::uuid and nome = 'Caixa da piscicultura'),
  'conta "Caixa da piscicultura" casa com a padrão');
select pg_temp.ok((select saldo_inicial_cents = 150000 and banco_codigo = '748' from contas_financeiras
                   where empresa_id = current_setting('t.emp')::uuid and nome = 'Sicredi'), 'conta bancária com saldo inicial');
select pg_temp.ok((select cpf_cnpj = '11222333000181' and uf = 'AM' from contatos
                   where empresa_id = current_setting('t.emp')::uuid and nome = 'Mercado Bom Preço'), 'contato com documento limpo e UF');
select pg_temp.ok((select produtor_rural from contatos where empresa_id = current_setting('t.emp')::uuid and nome = 'Cerealista Norte'),
  'fornecedor produtor rural');
select pg_temp.ok((select cpf_cnpj is null from contatos where empresa_id = current_setting('t.emp')::uuid and nome = 'Cliente Sem Doc'),
  'documento inválido fica em branco');
select pg_temp.ok((select 'fornecedor' = any(tipos) from contatos where empresa_id = current_setting('t.emp')::uuid and nome = 'Fornecedor Novo'),
  'contato citado só no lançamento vira fornecedor');

select pg_temp.ok((select status = 'quitado' and pago_cents = 100000 from agendamentos a
                   join importacao_vinculos v on v.registro_id = a.id and v.chave = 's1'), 'recebimento pago fica quitado');
select pg_temp.ok((select a.status = 'quitado' and b.juros_cents = 500 and b.valor_cents = 50000
                   from agendamentos a join importacao_vinculos v on v.registro_id = a.id and v.chave = 's2'
                   join baixas b on b.agendamento_id = a.id), 'pago a mais vira juros');
select pg_temp.ok((select sum(r.valor_cents) = 50000 from agendamento_rateios r
                   join importacao_vinculos v on v.registro_id = r.agendamento_id and v.chave = 's2'), 'rateio fecha com o valor');
select pg_temp.ok((select c.nome = 'Importado sem categoria' and a.status = 'aberto' from agendamentos a
                   join importacao_vinculos v on v.registro_id = a.id and v.chave = 's4'
                   join agendamento_rateios r on r.agendamento_id = a.id join categorias c on c.id = r.categoria_id),
  'título sem categoria cai em "Importado sem categoria"');

-- rodar de novo não duplica
select set_config('t.res', importar_pacote(current_setting('t.emp')::uuid, current_setting('t.pacote')::jsonb)::text, false);
select pg_temp.ok((current_setting('t.res')::jsonb->>'titulos')::int = 0 and (current_setting('t.res')::jsonb->>'titulos_ja_importados')::int = 4,
  'segunda importação pula os títulos já trazidos');
select pg_temp.ok((select count(*) = 4 from agendamentos where empresa_id = current_setting('t.emp')::uuid and origem = 'importacao'),
  'nenhum título duplicado');
select pg_temp.ok((select count(*) = 1 from transferencias where empresa_id = current_setting('t.emp')::uuid), 'nenhuma transferência duplicada');
select pg_temp.ok((select count(*) = 1 from contatos where empresa_id = current_setting('t.emp')::uuid and nome = 'Mercado Bom Preço'),
  'nenhum contato duplicado');

-- planilha do LC com o mesmo cliente: casa pelo documento e une os dados
select importar_pacote(current_setting('t.emp')::uuid,
  '{"origem": "lc", "contatos": [{"nome": "MERCADO BOM PRECO LTDA", "tipos": ["cliente"], "cpf_cnpj": "11222333000181", "telefone": "92 99999-0000"}]}');
select pg_temp.ok((select count(*) = 1 and bool_and(telefone = '92 99999-0000') from contatos
                   where empresa_id = current_setting('t.emp')::uuid and cpf_cnpj = '11222333000181'), 'cliente do LC casa pelo CNPJ');

-- dois clientes com o mesmo nome no LC continuam dois cadastros
select importar_pacote(current_setting('t.emp')::uuid,
  '{"origem": "lc", "contatos": [{"chave": "lc:1", "nome": "ANTONIO", "tipos": ["cliente"]}, {"chave": "lc:2", "nome": "Antônio", "tipos": ["cliente"]}]}');
select importar_pacote(current_setting('t.emp')::uuid,
  '{"origem": "lc", "contatos": [{"chave": "lc:1", "nome": "ANTONIO", "tipos": ["cliente"]}, {"chave": "lc:2", "nome": "Antônio", "tipos": ["cliente"]}]}');
select pg_temp.ok((select count(*) = 2 from contatos where empresa_id = current_setting('t.emp')::uuid and app.nome_chave(nome) = 'antonio'),
  'homônimos da mesma origem não se juntam, nem na segunda importação');

-- reimportação traz a baixa nova do título que estava em aberto e não repete a baixa antiga
select set_config('t.res', importar_pacote(current_setting('t.emp')::uuid, $j${"origem": "nibo", "titulos": [
  {"chave": "s1", "tipo": "receber", "descricao": "Venda peixe jan", "vencimento": "2026-01-10", "valor_cents": 100000,
   "baixas": [{"chave": "e1", "conta_chave": "acc1", "data": "2026-01-10", "valor_cents": 100000}]},
  {"chave": "s3", "tipo": "pagar", "descricao": "Milho fev", "vencimento": "2026-02-15", "valor_cents": 40000,
   "baixas": [{"chave": "e9", "conta_chave": "acc1", "data": "2026-02-16", "valor_cents": 40000}]}
]}$j$::jsonb)::text, false);
select pg_temp.ok((current_setting('t.res')::jsonb->>'baixas')::int = 1, 'reimportação traz só a baixa nova');
select pg_temp.ok((select status = 'quitado' from agendamentos a join importacao_vinculos v on v.registro_id = a.id and v.chave = 's3'),
  'título em aberto fica quitado com a baixa nova');
select pg_temp.ok((select count(*) = 1 from baixas b join importacao_vinculos v on v.registro_id = b.agendamento_id and v.chave = 's1'),
  'baixa já importada antes do vínculo não duplica');
select pg_temp.ok((select count(*) = 2 from importacao_vinculos where empresa_id = current_setting('t.emp')::uuid and entidade = 'baixa'),
  'as duas baixas ficam vinculadas');
select set_config('t.res', importar_pacote(current_setting('t.emp')::uuid, $j${"origem": "nibo", "titulos": [
  {"chave": "s3", "tipo": "pagar", "descricao": "Milho fev", "vencimento": "2026-02-15", "valor_cents": 40000,
   "baixas": [{"chave": "e9", "conta_chave": "acc1", "data": "2026-02-16", "valor_cents": 40000}]}
]}$j$::jsonb)::text, false);
select pg_temp.ok((current_setting('t.res')::jsonb->>'baixas')::int = 0, 'terceira importação não traz nada de novo');

-- grupo errado de uma importação antiga é corrigido ao reimportar, junto com as subcategorias
select importar_pacote(current_setting('t.emp')::uuid,
  '{"origem": "nibo", "categorias": [{"nome": "Administrativas", "sentido": "saida", "grupo": "receita_operacional"},
                                     {"nome": "Internet", "sentido": "saida", "grupo": "receita_operacional", "pai": "Administrativas"}]}');
select pg_temp.ok((select grupo = 'receita_operacional' from categorias where empresa_id = current_setting('t.emp')::uuid and nome = 'Internet'),
  'cenário: subcategoria entrou com o grupo errado');
select importar_pacote(current_setting('t.emp')::uuid,
  '{"origem": "nibo", "categorias": [{"nome": "Administrativas", "sentido": "saida", "grupo": "despesa_operacional"},
                                     {"nome": "Internet", "sentido": "saida", "grupo": "despesa_operacional", "pai": "Administrativas"}]}');
select pg_temp.ok((select bool_and(grupo = 'despesa_operacional') and count(*) = 2 from categorias
                   where empresa_id = current_setting('t.emp')::uuid and nome in ('Internet', 'Administrativas')),
  'reimportar corrige o grupo do pai e da subcategoria');
select pg_temp.ok((select grupo = 'receita_operacional' from categorias where empresa_id = current_setting('t.emp')::uuid and nome = 'Venda de peixes'),
  'categoria do sistema não muda de grupo');

-- automação: regra de conciliação aprendida do fornecedor com 2 lançamentos na mesma categoria
select set_config('t.n', criar_regras_do_historico(current_setting('t.emp')::uuid)::text, false);
select pg_temp.ok(current_setting('t.n')::int = 1, 'cria uma regra do histórico: ' || current_setting('t.n'));
select pg_temp.ok((select r.tipo = 'pagamento' and c.nome = 'Milho' and r.condicoes->0->>'valor' = '12345678909'
                   from regras_conciliacao r join categorias c on c.id = r.acao_categoria_id
                   where r.empresa_id = current_setting('t.emp')::uuid), 'regra pelo CPF do fornecedor leva à categoria certa');
select pg_temp.ok(criar_regras_do_historico(current_setting('t.emp')::uuid) = 0, 'não repete a regra');
reset role;

\echo 'TESTES DA IMPORTAÇÃO PASSARAM'
