-- Unidade em que as quantidades de ovos aparecem nas telas: cartela (30), caixa (360) ou dúzia (12).
-- Independe da unidade de venda (empresas.unidade_ovo), que decide os produtos e a digitação do
-- apontamento. Quem já usava dúzia continua vendo dúzia.

alter table empresas add column exibir_ovos text not null default 'cartela'
  check (exibir_ovos in ('cartela', 'caixa', 'duzia'));

update empresas set exibir_ovos = unidade_ovo where unidade_ovo = 'duzia';

select app.travar_referencias();
