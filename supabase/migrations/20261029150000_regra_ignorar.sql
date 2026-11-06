-- Regra "Ignorar": lançamento do extrato que não deve entrar no financeiro (ex.: aplicação e resgate
-- automáticos do BB Rende Fácil, que saem e voltam na mesma conta) fica ignorado sozinho a cada
-- importação, OFX ou Open Finance. Nada é apagado: o lançamento continua no extrato, na aba
-- "Conciliados e ignorados", e pode voltar para conciliar.
--
-- * tipo 'ignorar' em regras_conciliacao, sem ação; vale para entrada e saída;
-- * as regras de ignorar passam antes das outras (quem pediu para ignorar não quer título criado);
-- * texto da condição compara sem acento ("Rende Fácil" casa com "RENDE FACIL" do banco);
-- * lançamento que volta para conciliar perde a marca da regra (a contagem da tela de regras fica certa).

alter table regras_conciliacao drop constraint regras_conciliacao_tipo_check;
alter table regras_conciliacao add constraint regras_conciliacao_tipo_check
  check (tipo in ('recebimento','pagamento','transferencia','ignorar'));

alter table regras_conciliacao drop constraint acao_presente;
alter table regras_conciliacao add constraint acao_presente check (
  tipo = 'ignorar'
  or (tipo = 'transferencia' and acao_contrapartida_conta_id is not null)
  or (tipo not in ('transferencia','ignorar') and num_nonnulls(acao_contato_id, acao_categoria_id, acao_descricao) >= 1));

create or replace function app.sem_acento(p text) returns text
language sql immutable as $$
  -- maiúsculas acentuadas também no translate: lower() não as converte em banco com collation C
  select lower(translate(coalesce(p, ''), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
                                           'aaaaaeeeeiiiiooooouuuucaaaaaeeeeiiiiooooouuuuc'))
$$;

create or replace function app.condicao_casa(p_cond jsonb, m movimentos_bancarios) returns boolean
language plpgsql immutable as $$
declare
  v_campo text := p_cond->>'campo';
  v_op text := p_cond->>'operador';
  v_alvo text := app.sem_acento(trim(coalesce(p_cond->>'valor', '')));
  v_texto text;
  v_num numeric;
begin
  if v_campo = 'valor' then
    v_num := abs(m.valor_cents) / 100.0;
    return case v_op
      when 'igual' then v_num = replace(v_alvo, ',', '.')::numeric
      when 'maior' then v_num > replace(v_alvo, ',', '.')::numeric
      when 'menor' then v_num < replace(v_alvo, ',', '.')::numeric
      else false end;
  end if;

  v_texto := app.sem_acento(case v_campo when 'cpf_cnpj' then m.cpf_cnpj_contraparte when 'descricao' then m.descricao end);
  if v_campo = 'cpf_cnpj' then v_alvo := regexp_replace(v_alvo, '\D', '', 'g'); end if;
  return case v_op
    when 'vazio' then v_texto = ''
    when 'igual' then v_texto = v_alvo
    when 'comeca_com' then v_alvo <> '' and starts_with(v_texto, v_alvo)
    when 'contem' then v_alvo <> '' and position(v_alvo in v_texto) > 0
    else false end;
exception when invalid_text_representation then
  return false;  -- valor digitado que não é número: a condição simplesmente não casa
end $$;

create or replace function public.aplicar_regras(p_conta uuid, p_importacao uuid default null) returns int
language plpgsql set search_path = public as $$
declare
  m movimentos_bancarios%rowtype;
  r regras_conciliacao%rowtype;
  v_titulo uuid;
  v_n int := 0;
  v_sentido text;
begin
  for m in select * from movimentos_bancarios
           where conta_id = p_conta and status = 'pendente' and (p_importacao is null or importacao_id = p_importacao)
           order by data, id loop
    select * into r from regras_conciliacao x
    where x.empresa_id = m.empresa_id and app.regra_casa(x, m)
    order by case x.tipo when 'ignorar' then 0 when 'transferencia' then 2 else 1 end, x.ordem
    limit 1;
    continue when not found;

    if r.tipo = 'ignorar' then
      update movimentos_bancarios set status = 'ignorado', regra_aplicada_id = r.id where id = m.id;
      v_n := v_n + 1;
      continue;
    end if;

    v_sentido := case when m.valor_cents > 0 then 'entrada' else 'saida' end;
    if r.tipo = 'transferencia' then
      continue when r.acao_contrapartida_conta_id = m.conta_id;
      perform public.conciliar_transferencia(m.id, r.acao_contrapartida_conta_id);
    elsif r.acao_categoria_id is not null then
      continue when not exists (select 1 from categorias where id = r.acao_categoria_id and sentido = v_sentido);
      perform public.conciliar_criando_titulo(m.id, r.acao_categoria_id, r.acao_centro_custo_id, r.acao_contato_id,
                                              coalesce(r.acao_descricao, m.descricao));
    else
      select t.id into v_titulo from titulos t
      where t.empresa_id = m.empresa_id and t.contato_id = r.acao_contato_id
        and t.tipo = case when m.valor_cents > 0 then 'receber' else 'pagar' end
        and t.status in ('aberto', 'parcial') and t.saldo_cents = abs(m.valor_cents)
      order by abs(t.vencimento - m.data)
      limit 1;
      continue when v_titulo is null;
      perform public.conciliar_com_titulo(m.id, v_titulo, 'regra');
    end if;

    update conciliacoes set modo = 'regra' where movimento_id = m.id;
    update movimentos_bancarios set regra_aplicada_id = r.id where id = m.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create or replace function app.limpa_regra_ao_voltar() returns trigger
language plpgsql as $$
begin
  if new.status = 'pendente' and old.status <> 'pendente' then new.regra_aplicada_id := null; end if;
  return new;
end $$;

create trigger limpa_regra_ao_voltar before update of status on movimentos_bancarios
  for each row execute function app.limpa_regra_ao_voltar();
