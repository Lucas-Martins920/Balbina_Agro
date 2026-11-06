-- Plano de categorias da piscicultura de engorda em todas as empresas que já existem (decisão do Nicolas, 2026-11-02).
-- Mesma regra do botão "Aplicar plano padrão": cria o que falta, move as categorias do plano antigo para dentro
-- das novas principais (os lançamentos continuam nelas) e não apaga nada. Empresa nova já nasce com o plano.
select app.aplicar_plano_categorias(id) from empresas order by created_at;
