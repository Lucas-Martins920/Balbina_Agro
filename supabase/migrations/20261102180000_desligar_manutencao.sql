-- Tira o módulo de Manutenções do uso (pedido do Nicolas em 2026-11-02: "assim como o RH, tirar toda a parte de manutenção").
-- Fase reversível: as telas /manutencao, /manutencao/checklist e /relatorios/manutencao saíram do app no mesmo commit;
-- aqui saem do banco só os pontos que levavam a elas. Nenhum dado é apagado: equipamentos, planos e histórico continuam
-- nas tabelas até a migration de remoção (DROP), que só entra com o "pode" do Nicolas.
--
-- 1. Alertas do painel: a view volta a ser a de antes de 20261029200000_equipamentos_manutencao.sql (sem preventiva
--    vencida/próxima, problema do checklist, equipamento parado e fim da vida útil, que apontavam para /manutencao).
-- 2. Tela de início do login local: quem só tinha manutenção caía em /manutencao/checklist; agora cai no painel.

create or replace view public.alertas with (security_invoker = true) as
 SELECT s.empresa_id,
        CASE
            WHEN s.pct_engorda < (s.padrao_pct_engorda - 10::numeric) THEN 'critico'::text
            ELSE 'atencao'::text
        END AS nivel,
    'engorda'::text AS tipo,
    format('Engorda do lote %s abaixo do padrão'::text, a.lote_codigo) AS titulo,
    format('Semana %s: %s%% contra %s%% da curva'::text, s.semana, s.pct_engorda, s.padrao_pct_engorda) AS detalhe,
    '/lotes/'::text || a.lote_id AS link,
    s.fim AS data
   FROM alocacoes_atuais a
     JOIN LATERAL ( SELECT i.empresa_id,
            i.lote_id,
            i.semana,
            i.inicio,
            i.fim,
            i.dias,
            i.peixes_medios,
            i.ovos,
            i.pct_engorda,
            i.consumo_g_peixe_dia,
            i.kg_racao_por_duzia,
            i.baixas,
            i.mortalidade_acum_pct,
            i.ovos_peixe_povoada_acum,
            i.padrao_pct_engorda,
            i.padrao_consumo_g,
            i.padrao_sobrevivencia_pct
           FROM indicadores_lote_semana i
          WHERE i.lote_id = a.lote_id AND i.dias >= 3
          ORDER BY i.semana DESC
         LIMIT 1) s ON true
  WHERE a.fase = 'producao'::text AND s.padrao_pct_engorda IS NOT NULL AND s.pct_engorda < (s.padrao_pct_engorda - 5::numeric)
UNION ALL
 SELECT a.empresa_id,
        CASE
            WHEN m.pct > 0.3 THEN 'critico'::text
            ELSE 'atencao'::text
        END AS nivel,
    'mortalidade'::text AS tipo,
    format('Mortalidade alta no lote %s (%s)'::text, a.lote_codigo, a.viveiro_nome) AS titulo,
    format('%s peixes nos últimos 3 dias (%s%% ao dia)'::text, m.baixas, m.pct) AS detalhe,
    '/lotes/'::text || a.lote_id AS link,
    app.hoje(a.empresa_id) AS data
   FROM alocacoes_atuais a
     JOIN LATERAL ( SELECT sum(d.mortes + d.descartes) AS baixas,
            round(100.0 * sum(d.mortes + d.descartes)::numeric / NULLIF(sum(d.peixes_inicio_dia), 0)::numeric, 2) AS pct
           FROM apontamentos_diarios d
          WHERE d.lote_id = a.lote_id AND d.viveiro_id = a.viveiro_id AND d.data > (app.hoje(a.empresa_id) - 3)) m ON true
  WHERE m.pct > 0.1
UNION ALL
 SELECT a.empresa_id,
    'atencao'::text AS nivel,
    'apontamento'::text AS tipo,
    format('Falta apontamento do %s'::text, a.viveiro_nome) AS titulo,
        CASE
            WHEN a.ultimo_apontamento IS NULL THEN format('Lote %s ainda sem nenhum apontamento'::text, a.lote_codigo)
            ELSE format('Último apontamento em %s'::text, to_char(a.ultimo_apontamento::timestamp with time zone, 'DD/MM'::text))
        END AS detalhe,
    '/apontamentos'::text AS link,
    app.hoje(a.empresa_id) AS data
   FROM alocacoes_atuais a
     JOIN lote_alocacoes al ON al.id = a.id
  WHERE lower(al.periodo) < (app.hoje(a.empresa_id) - 1) AND COALESCE(a.ultimo_apontamento, '-infinity'::date) < (app.hoje(a.empresa_id) - 1)
UNION ALL
 SELECT e.empresa_id,
    'info'::text AS nivel,
    'carencia'::text AS tipo,
    format('Ovos do lote %s em carência'::text, l.codigo) AS titulo,
    format('Não vender ovos postos até %s'::text, to_char((e.data + e.carencia_dias::integer - 1)::timestamp with time zone, 'DD/MM'::text)) AS detalhe,
    '/sanidade'::text AS link,
    e.data
   FROM eventos_sanitarios e
     JOIN lotes l ON l.id = e.lote_id
  WHERE e.status = 'realizado'::text AND e.carencia_dias > 0 AND (e.data + e.carencia_dias::integer) > app.hoje(e.empresa_id)
UNION ALL
 SELECT e.empresa_id,
        CASE
            WHEN e.data < app.hoje(e.empresa_id) THEN 'atencao'::text
            ELSE 'info'::text
        END AS nivel,
    'sanidade'::text AS tipo,
    format('%s %s do lote %s'::text,
        CASE
            WHEN e.data < app.hoje(e.empresa_id) THEN 'Atrasado:'::text
            ELSE 'Programado:'::text
        END, initcap(e.tipo), l.codigo) AS titulo,
    concat_ws(' · '::text, to_char(e.data::timestamp with time zone, 'DD/MM'::text), e.dose, e.via) AS detalhe,
    '/sanidade'::text AS link,
    e.data
   FROM eventos_sanitarios e
     JOIN lotes l ON l.id = e.lote_id
  WHERE e.status = 'planejado'::text AND e.data <= (app.hoje(e.empresa_id) + 7)
UNION ALL
 SELECT t.empresa_id,
    'atencao'::text AS nivel,
    'financeiro'::text AS tipo,
    format('%s conta(s) a %s vencida(s)'::text, count(*), t.tipo) AS titulo,
    format('Total de R$ %s'::text, to_char(sum(t.saldo_cents) / 100.0, 'FM999G999G990D00'::text)) AS detalhe,
        CASE
            WHEN t.tipo = 'pagar'::text THEN '/contas-a-pagar?situacao=vencido'::text
            ELSE '/contas-a-receber?situacao=vencido'::text
        END AS link,
    min(t.vencimento) AS data
   FROM titulos t
  WHERE t.situacao = 'vencido'::text
  GROUP BY t.empresa_id, t.tipo
UNION ALL
 SELECT estoque_peixe.empresa_id,
    'critico'::text AS nivel,
    'estoque'::text AS tipo,
    format('Estoque negativo de ovos %s'::text, estoque_peixe.classe) AS titulo,
    format('%s ovos: confira apontamentos e pedidos'::text, estoque_peixe.saldo) AS detalhe,
    '/estoque'::text AS link,
    app.hoje(estoque_peixe.empresa_id) AS data
   FROM estoque_peixe
  WHERE estoque_peixe.saldo < 0
;

create or replace function public.meu_login_local() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('login', l.login, 'trocar_senha', l.trocar_senha,
    'dispensa_2fa', l.dispensa_2fa and app.pode_dispensar_2fa(l.user_id),
    'inicio', case
      when not app.pode_dispensar_2fa(l.user_id) then null
      when 'apontamentos.editar' = any (c.chaves) then '/campo'
      when 'racao.editar' = any (c.chaves) then '/racao'
    end)
  from logins_locais l
  left join lateral (
    select app.chaves_membro(u.perfil, u.cargo_id, u.permissoes) chaves
    from usuarios_empresa u where u.user_id = l.user_id and u.empresa_id = l.empresa_id and u.ativo
  ) c on true
  where l.user_id = auth.uid()
$$;
revoke all on function public.meu_login_local() from public, anon;
