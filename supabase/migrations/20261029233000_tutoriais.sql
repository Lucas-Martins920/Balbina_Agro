-- Tutoriais guiados por tela (balões): guarda, por pessoa, as telas cujo tutorial ela já viu.
--
-- Pedido do Nicolas (2026-10-29): cada tela tem o seu tutorial, mostrado só no primeiro acesso de cada
-- funcionário, com opção de refazer. Vale para a pessoa em qualquer aparelho e em qualquer empresa dela,
-- por isso fica por usuário (sem empresa_id). A tela '*' marca que a pessoa desligou o tutorial automático.
-- Os textos e os passos ficam no app (src/lib/tutoriais.ts); aqui só o "já viu".

create table tutoriais_vistos (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tela text not null check (tela ~ '^(\*|geral|/[a-z0-9/_\[\]-]{0,80})$'),
  visto_em timestamptz not null default now(),
  primary key (user_id, tela)
);
alter table tutoriais_vistos enable row level security;
create policy proprios_ver on tutoriais_vistos for select using (user_id = auth.uid());
create policy proprios_marcar on tutoriais_vistos for insert with check (user_id = auth.uid());
create policy proprios_refazer on tutoriais_vistos for delete using (user_id = auth.uid());
revoke update on tutoriais_vistos from anon, authenticated;
