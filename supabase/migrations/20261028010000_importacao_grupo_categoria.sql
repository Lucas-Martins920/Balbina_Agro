-- Importação do NIBO: o grupo "DESPESAS OPERACIONAIS E OUTRAS RECEITAS" era lido como receita
-- (o nome contém "receita"), e as despesas operacionais caíam em Receitas no DRE. O app passou a
-- reconhecer o grupo certo; aqui a importação passa a corrigir o grupo de categorias que já existem,
-- então reimportar conserta a conta.

create or replace function app.importar_categoria(p_empresa uuid, p_nome text, p_sentido text, p_pai text default null,
                                                  p_grupo text default null, p_codigo text default null) returns uuid
language plpgsql as $$
declare
  v_pai uuid;
  v_id uuid;
  v_grupo text := coalesce(p_grupo, case p_sentido when 'entrada' then 'receita_operacional' else 'despesa_operacional' end);
begin
  if nullif(trim(p_pai), '') is not null then
    select id into v_pai from categorias
     where empresa_id = p_empresa and sentido = p_sentido and parent_id is null and app.nome_chave(nome) = app.nome_chave(p_pai)
     order by ativa desc, created_at limit 1;
    if v_pai is null then
      insert into categorias (empresa_id, grupo, sentido, nome) values (p_empresa, v_grupo, p_sentido, trim(p_pai))
      returning id into v_pai;
    end if;
  end if;

  select id into v_id from categorias
   where empresa_id = p_empresa and sentido = p_sentido and app.nome_chave(nome) = app.nome_chave(p_nome)
     and (parent_id is not distinct from v_pai or v_pai is null)
   order by (parent_id is not distinct from v_pai) desc, ativa desc, created_at limit 1;
  if v_id is null then
    -- subcategoria herda grupo e sentido do pai (trigger de categorias)
    insert into categorias (empresa_id, grupo, sentido, parent_id, nome, codigo)
    values (p_empresa, coalesce((select grupo from categorias where id = v_pai), v_grupo), p_sentido, v_pai, trim(p_nome),
            nullif(trim(p_codigo), ''))
    returning id into v_id;
  else
    update categorias set ativa = true, codigo = coalesce(codigo, nullif(trim(p_codigo), ''))
     where id = v_id and (not ativa or (codigo is null and nullif(trim(p_codigo), '') is not null));
  end if;
  -- O grupo do sistema de origem manda: corrige o que entrou com o grupo errado (e as subcategorias).
  if p_grupo is not null then
    update categorias set grupo = p_grupo, updated_at = now()
     where id = coalesce(v_pai, v_id) and parent_id is null and not sistema and grupo <> p_grupo;
    update categorias set grupo = p_grupo, updated_at = now()
     where parent_id = coalesce(v_pai, v_id) and not sistema and grupo <> p_grupo;
  end if;
  return v_id;
end $$;
