-- Desconciliar com regras (pedido do Nicolas em 2026-10-29), no espírito do NIBO mas mais prático:
--
-- desconciliar(movimento, motivo, manter_titulo) — quem tem conciliacao.editar:
--   * motivo obrigatório, gravado no histórico junto com o que foi desfeito;
--   * mês fechado bloqueia (reabra o mês antes);
--   * o que a conciliação CRIOU é desfeito: a baixa sai (o título volta a aberto/parcial), a transferência
--     sai quando nenhuma outra perna do extrato está ligada a ela, e o título criado na própria conciliação
--     é cancelado (ou fica em aberto, se pedirem para manter);
--   * o que JÁ EXISTIA (baixa ou transferência vinda da importação) fica intacto: só o vínculo sai;
--   * lançamento ignorado volta para "para conciliar".
--
-- apagar_conciliacao(movimento, motivo) — só o master, com o código do autenticador de agora:
--   desfaz tudo, inclusive o pagamento importado, apaga o título criado na conciliação e devolve
--   as outras pernas de uma transferência para "para conciliar".
--
-- apagar_movimento_extrato(movimento, motivo) — só o master, com o código do autenticador de agora:
--   apaga a conciliação (como acima) e o lançamento do extrato. O id do banco fica guardado em
--   movimentos_apagados para a próxima leitura do Open Finance ou o mesmo OFX não trazê-lo de volta.

-- ---------------------------------------------------------------------------
-- Lançamentos do extrato apagados à mão: não voltam numa nova importação
-- ---------------------------------------------------------------------------

create table movimentos_apagados (
  empresa_id uuid not null references empresas(id) on delete cascade,
  conta_id uuid not null references contas_financeiras(id) on delete cascade,
  id_externo text not null,
  data date,
  descricao text,
  valor_cents bigint,
  motivo text,
  apagado_por uuid default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (conta_id, id_externo)
);
create index on movimentos_apagados (empresa_id);
alter table movimentos_apagados enable row level security;
-- só leitura: quem grava é apagar_movimento_extrato (security definer)
create policy membros on movimentos_apagados for select using (empresa_id in (select app.minhas_empresas()));
grant select on movimentos_apagados to authenticated;

create or replace function app.pula_movimento_apagado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.id_externo is not null
     and exists (select 1 from movimentos_apagados where conta_id = new.conta_id and id_externo = new.id_externo) then
    return null;
  end if;
  return new;
end $$;

create trigger pula_movimento_apagado before insert on movimentos_bancarios
  for each row execute function app.pula_movimento_apagado();

-- ---------------------------------------------------------------------------
-- Setor: solta a conciliação de um lançamento do extrato
-- ---------------------------------------------------------------------------

-- Baixa ou transferência que veio de uma importação (NIBO etc.) existia antes da conciliação.
create or replace function app.veio_de_importacao(p_empresa uuid, p_entidade text, p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from importacao_vinculos where empresa_id = p_empresa and entidade = p_entidade and registro_id = p_id)
$$;

-- p_forcar: apaga também o que já existia (só para o master). Devolve o que foi feito, em texto.
create or replace function app.soltar_conciliacao(p_movimento uuid, p_forcar boolean, p_manter_titulo boolean) returns text[]
language plpgsql security definer set search_path = public as $$
declare
  v movimentos_bancarios%rowtype;
  c record;
  v_desc text;
  v_feito text[] := '{}';
  n int;
begin
  select * into v from movimentos_bancarios where id = p_movimento for update;
  if not found then raise exception 'Lançamento do extrato não encontrado' using errcode = 'no_data_found'; end if;
  if exists (select 1 from periodos_fechados where empresa_id = v.empresa_id and mes = date_trunc('month', v.data)::date) then
    raise exception 'Mês % está fechado: reabra o mês para mexer neste lançamento', to_char(v.data, 'MM/YYYY') using errcode = 'check_violation';
  end if;

  if v.status = 'ignorado' then
    v_feito := v_feito || 'lançamento ignorado voltou para conciliar'::text;
  end if;

  for c in select * from conciliacoes where movimento_id = p_movimento loop
    delete from conciliacoes where id = c.id;
    if c.baixa_id is not null then
      select coalesce(a.descricao, 'título') into v_desc from baixas b join agendamentos a on a.id = b.agendamento_id where b.id = c.baixa_id;
      if p_forcar or not app.veio_de_importacao(v.empresa_id, 'baixa', c.baixa_id) then
        delete from baixas where id = c.baixa_id;
        v_feito := v_feito || format('baixa de "%s" apagada', v_desc);
      else
        v_feito := v_feito || format('baixa importada de "%s" mantida', v_desc);
      end if;
    elsif p_forcar then
      -- as outras pernas perdem a transferência: voltam para conciliar
      update movimentos_bancarios set status = 'pendente'
      where id in (select movimento_id from conciliacoes where transferencia_id = c.transferencia_id);
      delete from transferencias where id = c.transferencia_id;
      v_feito := v_feito || 'transferência apagada'::text;
    elsif not exists (select 1 from conciliacoes where transferencia_id = c.transferencia_id)
          and not app.veio_de_importacao(v.empresa_id, 'transferencia', c.transferencia_id) then
      delete from transferencias where id = c.transferencia_id;
      v_feito := v_feito || 'transferência apagada'::text;
    else
      v_feito := v_feito || 'transferência mantida (a outra conta segue conciliada nela)'::text;
    end if;
  end loop;

  -- título criado na própria conciliação (sem outro pagamento)
  if p_forcar then
    delete from agendamentos a where a.origem = 'conciliacao' and a.origem_id = p_movimento
      and not exists (select 1 from baixas b where b.agendamento_id = a.id);
    get diagnostics n = row_count;
    if n > 0 then v_feito := v_feito || 'título criado na conciliação apagado'::text; end if;
  elsif not coalesce(p_manter_titulo, false) then
    update agendamentos set status = 'cancelado', updated_at = now()
    where origem = 'conciliacao' and origem_id = p_movimento and pago_cents = 0 and status <> 'cancelado';
    get diagnostics n = row_count;
    if n > 0 then v_feito := v_feito || 'título criado na conciliação cancelado'::text; end if;
  else
    perform 1 from agendamentos where origem = 'conciliacao' and origem_id = p_movimento and status in ('aberto', 'parcial');
    if found then v_feito := v_feito || 'título criado na conciliação ficou em aberto'::text; end if;
  end if;

  update movimentos_bancarios set status = 'pendente' where id = p_movimento and status <> 'pendente';
  return v_feito;
end $$;

create or replace function app.motivo_valido(p_motivo text) returns text
language plpgsql immutable as $$
declare v text := btrim(regexp_replace(coalesce(p_motivo, ''), '\s+', ' ', 'g'));
begin
  if length(v) < 3 then raise exception 'Diga o motivo' using errcode = 'check_violation'; end if;
  return left(v, 300);
end $$;

create or replace function app.registrar_desconciliacao(v movimentos_bancarios, p_acao text, p_titulo text, p_motivo text, p_feito text[])
returns void language sql security definer set search_path = public as $$
  insert into audit_log (empresa_id, user_id, usuario, tabela, registro_id, acao, resumo, antes)
  values (v.empresa_id, auth.uid(),
          coalesce((select lower(email) from auth.users where id = auth.uid()), auth.uid()::text),
          'desconciliacao', v.id::text, p_acao,
          format('%s: "%s" de %s, R$ %s. Motivo: %s.%s', p_titulo, v.descricao, to_char(v.data, 'DD/MM/YYYY'),
                 replace(to_char(v.valor_cents / 100.0, 'FM999999999990.00'), '.', ','), p_motivo,
                 case when cardinality(p_feito) > 0 then ' Feito: ' || array_to_string(p_feito, '; ') || '.' else '' end),
          to_jsonb(v))
$$;

-- ---------------------------------------------------------------------------
-- Ações
-- ---------------------------------------------------------------------------

create or replace function public.desconciliar(p_movimento uuid, p_motivo text, p_manter_titulo boolean default false) returns text[]
language plpgsql security definer set search_path = public as $$
declare
  v movimentos_bancarios%rowtype;
  v_motivo text := app.motivo_valido(p_motivo);
  v_feito text[];
begin
  select * into v from movimentos_bancarios where id = p_movimento;
  if not found or not app.pode(v.empresa_id, 'conciliacao.editar') then
    raise exception 'Sem permissão para desconciliar' using errcode = 'insufficient_privilege';
  end if;
  if v.status = 'pendente' then
    raise exception 'Este lançamento não está conciliado' using errcode = 'check_violation';
  end if;
  v_feito := app.soltar_conciliacao(p_movimento, false, p_manter_titulo);
  perform app.registrar_desconciliacao(v, 'update', 'Desconciliou', v_motivo, v_feito);
  return v_feito;
end $$;

create or replace function app.exigir_master_com_codigo(p_empresa uuid, p_o_que text) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not app.e_master(p_empresa) then
    raise exception 'Só o master da empresa pode %', p_o_que using errcode = 'insufficient_privilege';
  end if;
  if not app.mfa_recente(5) then
    raise exception 'Confirme com o código do autenticador para %', p_o_que using errcode = 'insufficient_privilege';
  end if;
end $$;

create or replace function public.apagar_conciliacao(p_movimento uuid, p_motivo text) returns text[]
language plpgsql security definer set search_path = public as $$
declare
  v movimentos_bancarios%rowtype;
  v_motivo text := app.motivo_valido(p_motivo);
  v_feito text[];
begin
  select * into v from movimentos_bancarios where id = p_movimento;
  if not found then raise exception 'Lançamento do extrato não encontrado' using errcode = 'no_data_found'; end if;
  perform app.exigir_master_com_codigo(v.empresa_id, 'apagar conciliações');
  if v.status = 'pendente' then
    raise exception 'Este lançamento não está conciliado' using errcode = 'check_violation';
  end if;
  v_feito := app.soltar_conciliacao(p_movimento, true, false);
  perform app.registrar_desconciliacao(v, 'delete', 'Apagou a conciliação', v_motivo, v_feito);
  return v_feito;
end $$;

create or replace function public.apagar_movimento_extrato(p_movimento uuid, p_motivo text) returns text[]
language plpgsql security definer set search_path = public as $$
declare
  v movimentos_bancarios%rowtype;
  v_motivo text := app.motivo_valido(p_motivo);
  v_feito text[] := '{}';
begin
  select * into v from movimentos_bancarios where id = p_movimento;
  if not found then raise exception 'Lançamento do extrato não encontrado' using errcode = 'no_data_found'; end if;
  perform app.exigir_master_com_codigo(v.empresa_id, 'apagar lançamentos do extrato');
  if v.status <> 'pendente' then
    v_feito := app.soltar_conciliacao(p_movimento, true, false);
  elsif exists (select 1 from periodos_fechados where empresa_id = v.empresa_id and mes = date_trunc('month', v.data)::date) then
    raise exception 'Mês % está fechado: reabra o mês para mexer neste lançamento', to_char(v.data, 'MM/YYYY') using errcode = 'check_violation';
  end if;
  if v.id_externo is not null then
    insert into movimentos_apagados (empresa_id, conta_id, id_externo, data, descricao, valor_cents, motivo)
    values (v.empresa_id, v.conta_id, v.id_externo, v.data, v.descricao, v.valor_cents, v_motivo)
    on conflict (conta_id, id_externo) do nothing;
  end if;
  delete from movimentos_bancarios where id = p_movimento;
  v_feito := v_feito || 'lançamento do extrato apagado'::text;
  perform app.registrar_desconciliacao(v, 'delete', 'Apagou do extrato', v_motivo, v_feito);
  return v_feito;
end $$;

-- O botão antigo "Desfazer" passa pelas mesmas regras.
create or replace function public.desfazer_conciliacao(p_movimento uuid) returns void
language sql set search_path = public as $$
  select public.desconciliar(p_movimento, 'Desfeito pela conciliação', false);
$$;

revoke all on function public.desconciliar(uuid, text, boolean) from public;
revoke all on function public.apagar_conciliacao(uuid, text) from public;
revoke all on function public.apagar_movimento_extrato(uuid, text) from public;
revoke all on function app.soltar_conciliacao(uuid, boolean, boolean) from public;
revoke all on function app.registrar_desconciliacao(movimentos_bancarios, text, text, text, text[]) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.desconciliar(uuid, text, boolean) to authenticated;
    grant execute on function public.apagar_conciliacao(uuid, text) to authenticated;
    grant execute on function public.apagar_movimento_extrato(uuid, text) to authenticated;
    grant execute on function app.veio_de_importacao(uuid, text, uuid) to authenticated;
    grant execute on function app.motivo_valido(text) to authenticated;
    grant execute on function app.exigir_master_com_codigo(uuid, text) to authenticated;
  end if;
end $$;

select app.travar_referencias();
