-- Balbina: o chat do app de campo (/api/chat/manejo) conta no uso de IA da empresa, como a leitura de boleto e
-- nota e a contagem de mortes por foto. Quem chama a IA chama registrar_uso_ia antes.
-- O chat tem limite próprio (ia_chat_limite_mes, padrão 300 perguntas por mês): numa conversa a equipe pergunta
-- muito mais vezes do que lê documentos, e um limite não pode esgotar o outro. Zero desliga o chat com IA, e o
-- celular passa a responder só pela base de manejo que já leva consigo.

alter table automacoes_empresa
  add column ia_chat_limite_mes int not null default 300 check (ia_chat_limite_mes between 0 and 5000);
comment on column automacoes_empresa.ia_chat_limite_mes is 'Perguntas ao chat do app de campo por mês (custo da IA). Zero desliga o chat com IA';

alter table ia_uso drop constraint ia_uso_tipo_check;
alter table ia_uso add constraint ia_uso_tipo_check check (tipo in ('documento', 'mortalidade', 'chat'));

-- Anota um uso da IA, ou recusa se a empresa passou do limite do mês. O chat conta no limite dele; documento e
-- mortalidade dividem o das leituras. Pelo app (membro da empresa) ou pelo servidor (caixa de e-mail).
create or replace function public.registrar_uso_ia(p_empresa uuid, p_tipo text)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_chat boolean := p_tipo = 'chat';
  v_limite int;
  v_usadas int;
  v_fuso text;
begin
  if auth.uid() is not null and p_empresa not in (select app.minhas_empresas()) then
    raise exception 'Empresa não encontrada' using errcode = 'insufficient_privilege';
  end if;
  if not app.empresa_liberada(p_empresa) then
    raise exception 'Assinatura da empresa suspensa' using errcode = 'insufficient_privilege';
  end if;
  select fuso into v_fuso from empresas where id = p_empresa;
  select case when v_chat then coalesce((select ia_chat_limite_mes from automacoes_empresa where empresa_id = p_empresa), 300)
              else coalesce((select ia_limite_mes from automacoes_empresa where empresa_id = p_empresa), 200) end
    into v_limite;
  select count(*) into v_usadas from ia_uso
  where empresa_id = p_empresa and (tipo = 'chat') = v_chat
    and created_at >= date_trunc('month', now() at time zone v_fuso) at time zone v_fuso;
  if v_usadas >= v_limite then
    if v_chat then
      raise exception 'A empresa já usou as % perguntas ao chat do campo deste mês', v_limite using errcode = 'check_violation';
    end if;
    raise exception 'A empresa já usou as % leituras por IA deste mês', v_limite using errcode = 'check_violation';
  end if;
  insert into ia_uso (empresa_id, tipo, user_id) values (p_empresa, p_tipo, auth.uid());
  return v_limite - v_usadas - 1;
end $$;

select app.travar_referencias();
