-- A data do saldo inicial nasce no dia de Manaus (fuso padrão das empresas), não no dia UTC do banco.
-- Com "saldo só ao lançar" (20261103180000) o extrato anterior a essa data fica de fora; entre 20h e 24h
-- de Manaus o current_date do banco já é o dia seguinte, e a conta recém-criada (o "Caixa da piscicultura" da
-- empresa nova, ou uma conta criada sem data) recusava os lançamentos de hoje.
alter table contas_financeiras alter column saldo_inicial_data set default (now() at time zone 'America/Manaus')::date;
