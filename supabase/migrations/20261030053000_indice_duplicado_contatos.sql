-- contatos (empresa_id, cpf_cnpj) tinha dois índices iguais: o único da criação da tabela
-- (contatos_empresa_id_cpf_cnpj_idx) e um comum criado depois para a importação. O único já serve
-- às mesmas buscas; o segundo só custava espaço e uma escrita a mais em cada contato gravado.
drop index if exists public.contatos_cpf_cnpj;
