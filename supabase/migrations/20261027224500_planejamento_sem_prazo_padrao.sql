-- Planejamento: o manejo é sempre o que a piscicultura informa. Tira os prazos pré-preenchidos (8 + 8 semanas, descarte
-- com 80, lote a cada 12, vazios de 28/15/30 dias) para que nenhum registro nasça com um manejo que não é o da piscicultura.
-- O vazio sanitário mínimo de 15 dias continua travado pelos checks da tabela.
alter table planejamento_parametros
  alter column semanas_alevinagem drop default,
  alter column semanas_recria drop default,
  alter column semanas_cultivo drop default,
  alter column vazio_alevinagem_dias drop default,
  alter column vazio_recria_dias drop default,
  alter column vazio_engorda_dias drop default,
  alter column intervalo_lotes_semanas drop default;
