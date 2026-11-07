import type { Metadata } from "next";
import Link from "next/link";
import { DocumentoLegal } from "@/components/documento-legal";
import { FORNECEDOR } from "@/lib/termos";
import { CLASSE_BOTAO_TEXTO } from "@/components/ui";

export const metadata: Metadata = { title: "Política de cookies · Balbina" };

// Texto-base. Revise com um advogado antes de vender. Ao criar ou trocar um cookie, atualize esta lista e VERSAO_TERMOS.
export default function PaginaCookies() {
  const f = FORNECEDOR;
  return (
    <DocumentoLegal titulo="Política de cookies">
      <p className="mt-6">
        Esta política explica quais cookies e dados de navegador o Balbina ERP usa e por quê. Ela completa a{" "}
        <Link href="/privacidade" className={CLASSE_BOTAO_TEXTO}>Política de privacidade</Link>.
      </p>

      <h2>1. O que são</h2>
      <p>Cookies são pequenos arquivos que o site guarda no seu navegador. O armazenamento local (localStorage) funciona de forma parecida, mas os dados ficam só no seu aparelho e não são enviados ao servidor a cada acesso.</p>

      <h2>2. O que o Balbina usa</h2>
      <p>O Balbina usa apenas cookies e dados <strong>estritamente necessários</strong> para o sistema funcionar. Não usamos cookies de publicidade, de rastreamento nem de análise de terceiros. Por isso eles não dependem de consentimento (LGPD, art. 7º, V e IX), mas você pode conhecê-los aqui.</p>
      <ul>
        <li><strong>Sessão de login</strong> (cookies <code>sb-…-auth-token</code>, do Supabase): mantém você conectado e protege o acesso aos dados. Duram enquanto a sessão estiver ativa e são apagados ao sair.</li>
        <li><strong>Empresa escolhida</strong> (cookie <code>empresa_id</code>): lembra qual piscicultura você está usando quando tem acesso a mais de uma. Apagado ao fechar o navegador.</li>
        <li><strong>Aparência</strong> (localStorage <code>balbina-tema</code>): lembra se você prefere o modo dia ou noturno.</li>
        <li><strong>Lançamentos sem internet</strong> (IndexedDB <code>balbina</code>, no app de campo e no do vendedor): guarda os apontamentos, pedidos e a conversa do chat feitos sem sinal até que sejam enviados.</li>
        <li><strong>Telas para abrir sem internet</strong> (cache do service worker): guarda as telas já abertas para consultar sem sinal; é apagado ao sair da conta.</li>
        <li><strong>Caixa do PDV</strong> (localStorage <code>balbina.pdv.conta</code>): lembra a conta de caixa usada no balcão.</li>
        <li><strong>Aviso de cookies</strong> (localStorage <code>balbina.aviso-cookies</code>): registra que você já viu o aviso.</li>
      </ul>

      <h2>3. Serviços de terceiros</h2>
      <p>Quando você conecta um banco (Pluggy) ou abre uma fatura (Asaas), a janela ou página desses serviços pode usar cookies próprios, regidos pelas políticas deles.</p>

      <h2>4. Como controlar</h2>
      <p>Você pode apagar ou bloquear cookies nas configurações do navegador. Se bloquear os cookies de sessão, não será possível entrar no sistema. Apagar o armazenamento local pode descartar apontamentos do app de campo que ainda não foram enviados.</p>

      <h2>5. Contato</h2>
      <p>Dúvidas sobre esta política: {f.email}.</p>
    </DocumentoLegal>
  );
}
