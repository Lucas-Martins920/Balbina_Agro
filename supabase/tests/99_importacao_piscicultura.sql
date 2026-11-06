-- Planilha modelo, parte da piscicultura: setores e viveiros, lotes povoados e estoque inicial,
-- com reenvio sem duplicar e linha com problema virando aviso.
\set ON_ERROR_STOP on

create or replace function pg_temp.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'FALHOU: %', p_msg; end if;
  raise notice 'ok - %', p_msg;
end $$;

insert into auth.users (id, email, email_confirmed_at) values
  ('9b170000-0000-0000-0000-0000000000a1', 'dono@pisciculturaplanilha.com', now());

set role authenticated;
set request.jwt.claim.sub = '9b170000-0000-0000-0000-0000000000a1';
select set_config('t.emp', criar_empresa('97666555000144', 'Piscicultura Nova Ltda')::text, false);

select importar_pacote(current_setting('t.emp')::uuid,
  '{"origem": "planilha", "produtos": [{"nome": "Ração engorda", "tipo": "racao", "unidade": "kg"}]}');

select set_config('t.pacote', $j${
  "viveiros": [
    {"setor": "Setor 1", "nome": "Viveiro 1", "finalidade": "engorda", "sistema": "escavado", "capacidade": 10000,
     "area_m2": 5000, "profundidade_m": 1.5},
    {"setor": "Setor 1", "nome": "Viveiro 2", "finalidade": "recria", "sistema": "tanque_rede", "capacidade": 5000, "volume_m3": 6, "aeracao": true}
  ],
  "lotes": [
    {"codigo": "L01", "especie": "tambaqui", "povoamento": "2026-03-01", "peso_inicial_g": 3, "peso_alvo_g": 2500, "viveiro": "Viveiro 1",
     "qtd": 9500, "custo_cents": 1000000, "fornecedor": "Alevinos do Norte"},
    {"codigo": "L02", "especie": "Tambaqui Matrinxã (cruzado)", "povoamento": "2026-03-01", "peso_inicial_g": 20,
     "setor": "Setor 1", "viveiro": "Viveiro 2", "qtd": 4000},
    {"codigo": "L03", "especie": "Tambaqui", "povoamento": "2026-03-01", "peso_inicial_g": 5, "viveiro": "Viveiro 1", "qtd": 100}
  ],
  "estoque": [
    {"produto": "ração engorda", "quantidade": 1500, "data": "2026-03-01", "custo_cents": 300000},
    {"produto": "Milho", "quantidade": 10, "data": "2026-03-01"}
  ]
}$j$, false);

select set_config('t.r', importar_piscicultura(current_setting('t.emp')::uuid, current_setting('t.pacote')::jsonb)::text, false);
select pg_temp.ok((current_setting('t.r')::jsonb->>'setores')::int = 1 and (current_setting('t.r')::jsonb->>'viveiros')::int = 2,
  'cria o setor e os viveiros');
select pg_temp.ok((current_setting('t.r')::jsonb->>'lotes')::int = 2 and (current_setting('t.r')::jsonb->>'especies')::int = 1,
  'povoa os lotes e cadastra a espécie que não existe');
select pg_temp.ok((select fase = 'engorda' and peso_inicial_g = 3 and peso_alvo_g = 2500 from lotes where empresa_id = current_setting('t.emp')::uuid and codigo = 'L01')
  and (select fase = 'recria' and especie_id = (select id from especies where empresa_id = current_setting('t.emp')::uuid and nome = 'Tambaqui Matrinxã (cruzado)')
       from lotes where empresa_id = current_setting('t.emp')::uuid and codigo = 'L02')
  and (select especie_id = (select id from especies where empresa_id is null and nome = 'Tambaqui') from lotes where empresa_id = current_setting('t.emp')::uuid and codigo = 'L01')
  and exists (select 1 from contatos where empresa_id = current_setting('t.emp')::uuid and nome = 'Alevinos do Norte' and 'fornecedor' = any(tipos)),
  'fase pelo viveiro, espécie do catálogo sem diferenciar maiúsculas, espécie nova e fornecedor cadastrado');
select pg_temp.ok((select sistema = 'escavado' and area_m2 = 5000 and profundidade_m = 1.5 from viveiros where empresa_id = current_setting('t.emp')::uuid and nome = 'Viveiro 1')
  and (select sistema = 'tanque_rede' and volume_m3 = 6 and aeracao from viveiros where empresa_id = current_setting('t.emp')::uuid and nome = 'Viveiro 2'),
  'viveiro guarda sistema, área, volume e profundidade');
select pg_temp.ok((current_setting('t.r')::jsonb->>'total_avisos')::int = 2
  and current_setting('t.r')::jsonb->'avisos' @> '["Estoque de \"Milho\" não entrou: produto não cadastrado (inclua na aba Produtos)"]'
  and (current_setting('t.r')::jsonb->'avisos'->>0) like 'Lote "L03" não entrou%',
  'viveiro ocupado e produto inexistente viram aviso');
select pg_temp.ok((select saldo from saldos_produtos s join produtos p on p.id = s.produto_id
                    where p.empresa_id = current_setting('t.emp')::uuid and p.nome = 'Ração engorda') = 1500
  and (select custo_medio_cents from produtos where empresa_id = current_setting('t.emp')::uuid and nome = 'Ração engorda') = 200,
  'estoque inicial com custo médio');

-- reenviar não duplica: lote existente fica, viveiro atualiza, estoque continua 1500
select set_config('t.r', importar_piscicultura(current_setting('t.emp')::uuid,
  jsonb_set(current_setting('t.pacote')::jsonb, '{viveiros,0,capacidade}', '12000'))::text, false);
select pg_temp.ok((current_setting('t.r')::jsonb->>'lotes_existentes')::int = 2 and (current_setting('t.r')::jsonb->>'viveiros_atualizados')::int = 2
  and (select count(*) from lotes where empresa_id = current_setting('t.emp')::uuid) = 2
  and (select capacidade_peixes from viveiros where empresa_id = current_setting('t.emp')::uuid and nome = 'Viveiro 1') = 12000
  and (select saldo from saldos_produtos s join produtos p on p.id = s.produto_id
        where p.empresa_id = current_setting('t.emp')::uuid and p.nome = 'Ração engorda') = 1500,
  'reenviar a planilha não duplica');

reset role;
