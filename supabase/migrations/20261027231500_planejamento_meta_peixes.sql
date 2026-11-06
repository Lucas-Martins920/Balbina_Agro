-- Planejamento: meta de peixes em engorda que a piscicultura quer manter. Serve só para sugerir tamanho de lote, cadência e
-- vida útil (2 anos como ponto de partida); nada é aplicado sem a piscicultura confirmar.
alter table planejamento_parametros
  add column if not exists meta_peixes int check (meta_peixes is null or meta_peixes > 0);
