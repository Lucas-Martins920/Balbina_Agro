-- Importação: a busca de contatos, categorias e contas pelo nome normalizado varria a tabela
-- inteira a cada linha e estourava o tempo limite com ~1.500 contatos (planilha do LC depois do NIBO).
create index if not exists contatos_nome_chave on contatos (empresa_id, app.nome_chave(nome));
create index if not exists contatos_cpf_cnpj on contatos (empresa_id, cpf_cnpj) where cpf_cnpj is not null;
create index if not exists categorias_nome_chave on categorias (empresa_id, sentido, app.nome_chave(nome));
create index if not exists centros_custo_nome_chave on centros_custo (empresa_id, app.nome_chave(nome));
create index if not exists importacao_vinculos_registro on importacao_vinculos (registro_id);

-- Com RLS o Postgres não usa esses índices (as funções de texto não são leakproof, então o filtro
-- só roda depois da policy). A importação passa a rodar como dona das tabelas: a função já exige
-- que o usuário seja master da empresa, e toda consulta dela filtra por p_empresa.
alter function public.importar_pacote(uuid, jsonb) security definer;
alter function public.criar_regras_do_historico(uuid) security definer;
