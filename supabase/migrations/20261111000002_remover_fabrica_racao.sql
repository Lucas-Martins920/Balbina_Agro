-- Limpeza da herança da granja: o Balbina não fabrica ração. A piscicultura compra ração extrusada pronta
-- (estoque de ração com entradas numeradas, lote e validade). Saem a fábrica própria (fórmula, composição,
-- ordem de produção) e o tipo de produto "insumo de ração" (matéria-prima usada só pela fábrica).
--
-- Dados preservados: as tabelas formulas_racao, formula_itens e ordens_producao_racao continuam no banco
-- (histórico, backup e custo das ordens antigas), só deixam de receber escrita. Produtos do tipo insumo_racao
-- viram "outro", com saldo, movimentos e custo intactos. Medicamentos continuam na Sanidade e o pescado no
-- estoque de pescado. Reversão: recriar as funções a partir de 20261103040000/20261028070000 e o check antigo.

-- 1. Fábrica desativada (mesmas assinaturas, para quem ainda chamar receber uma mensagem clara)
create or replace function salvar_formula(p_racao uuid, p_fase text, p_itens jsonb) returns uuid
language plpgsql set search_path = public as $$
begin
  raise exception 'A fábrica de ração foi desativada: o Balbina controla a ração comprada pronta, por entrada, lote e validade.';
end $$;

create or replace function produzir_racao(p_formula uuid, p_data date, p_toneladas numeric, p_deposito_insumos uuid, p_deposito_destino uuid) returns uuid
language plpgsql set search_path = public as $$
begin
  raise exception 'A fábrica de ração foi desativada: o Balbina controla a ração comprada pronta, por entrada, lote e validade.';
end $$;

revoke insert, update on formulas_racao, formula_itens, ordens_producao_racao from authenticated;
comment on table formulas_racao is 'Legado da fábrica de ração (desativada em 2026-11-11). Só leitura; mantida pelo histórico.';
comment on table formula_itens is 'Legado da fábrica de ração (desativada em 2026-11-11). Só leitura; mantida pelo histórico.';
comment on table ordens_producao_racao is 'Legado da fábrica de ração (desativada em 2026-11-11). Só leitura; mantida pelo histórico.';
comment on column automacoes_empresa.producao_dias is 'Legado da fábrica de ração; não é mais usado.';

-- 2. Matéria-prima de ração vira "outro" (sem perder saldo nem histórico) e o tipo sai do cadastro
update produtos set tipo = 'outro', updated_at = now() where tipo = 'insumo_racao';
alter table produtos drop constraint produtos_tipo_check;
alter table produtos add constraint produtos_tipo_check
  check (tipo in ('peixe', 'alevino', 'racao', 'corretivo', 'embalagem', 'medicamento', 'vacina', 'outro'));

-- 3. Planilha antiga com "insumo_racao" ainda importa, como "outro"
do $$
declare v_def text; v_novo text;
begin
  v_def := pg_get_functiondef('importar_pacote(uuid,jsonb)'::regprocedure);
  v_novo := replace(v_def, $a$values (p_empresa, r->>'tipo', left(trim(r->>'nome'), 200)$a$,
                           $a$values (p_empresa, case when r->>'tipo' = 'insumo_racao' then 'outro' else r->>'tipo' end, left(trim(r->>'nome'), 200)$a$);
  if v_novo = v_def then raise exception 'importar_pacote: trecho do insert de produtos não encontrado'; end if;
  execute v_novo;
end $$;

select app.travar_referencias();
