-- Escalas em ciclo e calendário de feriados do RH.
--
-- 1. Escala tipo 'ciclo': uma sequência de 2 a 84 dias (horário ou folga) que se repete a partir de inicio_ciclo
--    (o dia 1). Cobre a 5x2 com folgas que giram toda semana (7 semanas), 6x2, 4x2 e qualquer escala montada dia a dia.
-- 2. funcionarios.escala_deslocamento: em que posição do ciclo o funcionário entra, para a equipe não folgar toda no
--    mesmo dia (quem está na semana 1 folga segunda e terça, quem está na semana 2 folga terça e quarta). Na 12x36,
--    0 é a turma A e 1 a turma B.
-- 3. feriados.esfera (estadual, municipal ou da empresa) e feriados.recorrente (repete todo ano no mesmo dia).
--    Os nacionais o sistema calcula (src/lib/ponto.ts); os estaduais e municipais a piscicultura traz de uma lista sugerida
--    pela UF e cidade (src/lib/feriados.ts) e confere.
-- 4. rh_parametros.uf e municipio: de onde são os feriados (padrão: o endereço da empresa).

alter table escalas drop constraint escalas_tipo_check;
alter table escalas add constraint escalas_tipo_check check (tipo in ('semanal', '12x36', 'ciclo'));
alter table escalas add constraint escala_ciclo check (tipo <> 'ciclo' or (
  jsonb_typeof(dias) = 'array' and jsonb_array_length(dias) between 2 and 84 and inicio_ciclo is not null));

create or replace function app.escala_conferir() returns trigger
language plpgsql set search_path = public as $$
begin
  new.nome := trim(new.nome);
  new.updated_at := now();
  if new.tipo in ('semanal', 'ciclo') then
    new.horario := null;
    if new.tipo = 'semanal' then new.inicio_ciclo := null; end if;
    if exists (select 1 from jsonb_array_elements(new.dias) d where jsonb_typeof(d) <> 'null' and not app.horario_valido(d)) then
      raise exception 'Horário inválido na escala: use entrada e saída em HH:MM e o intervalo em minutos' using errcode = 'check_violation';
    end if;
    if not exists (select 1 from jsonb_array_elements(new.dias) d where jsonb_typeof(d) <> 'null') then
      raise exception 'A escala precisa de pelo menos um dia de trabalho' using errcode = 'check_violation';
    end if;
  else
    new.dias := null;
  end if;
  return new;
end $$;

alter table funcionarios add column escala_deslocamento integer not null default 0 check (escala_deslocamento between 0 and 83);

alter table feriados add column esfera text not null default 'municipal' check (esfera in ('estadual', 'municipal', 'empresa'));
alter table feriados add column recorrente boolean not null default false;

alter table rh_parametros add column uf text check (uf ~ '^[A-Z]{2}$');
alter table rh_parametros add column municipio text check (length(municipio) <= 80);

select app.travar_referencias();
