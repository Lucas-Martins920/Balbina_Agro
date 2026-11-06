import type { Metadata } from "next";
import Link from "next/link";
import { DocumentoLegal } from "@/components/documento-legal";
import { FORNECEDOR } from "@/lib/termos";
import { CLASSE_BOTAO_TEXTO } from "@/components/ui";

export const metadata: Metadata = { title: "Política de privacidade · Balbina" };

// Texto-base alinhado à LGPD (Lei 13.709/2018). Revise com um advogado antes de vender.
export default function PaginaPrivacidade() {
  const f = FORNECEDOR;
  return (
    <DocumentoLegal titulo="Política de privacidade">
      <p className="mt-6">
        Esta política explica como {f.razaoSocial}, CNPJ {f.cnpj} (&quot;Balbina&quot;), trata dados pessoais no Balbina ERP, conforme a Lei Geral de
        Proteção de Dados (LGPD, Lei 13.709/2018).
      </p>

      <h2>1. Papéis</h2>
      <ul>
        <li>Dados da conta (nome, e-mail, senha cifrada, registros de acesso e de aceite dos termos) e de cobrança da assinatura: o Balbina é o controlador.</li>
        <li>Dados que a piscicultura lança no sistema (clientes, fornecedores, funcionários, produtores rurais, CPF, inscrição estadual, endereço, financeiro): a piscicultura é a controladora e o Balbina é o operador, tratando esses dados só para prestar o serviço.</li>
      </ul>

      <h2>2. Dados que tratamos</h2>
      <ul>
        <li>Cadastro: e-mail, senha (guardada de forma irreversível) e, quando informados, nome e telefone.</li>
        <li>Empresa: CNPJ ou CPF do produtor rural, razão social, inscrição estadual e endereço.</li>
        <li>Uso e segurança: endereço IP, navegador, data e hora de acesso, alterações feitas no sistema e aceites dos termos.</li>
        <li>Lançamentos da piscicultura: o que o Cliente cadastra para operar (contatos, notas, cobranças, extratos bancários).</li>
      </ul>

      <h2>3. Para que usamos e com qual base legal</h2>
      <ul>
        <li>Executar o contrato: dar acesso ao sistema, guardar os lançamentos, emitir cobranças e notas a pedido da piscicultura (art. 7º, V).</li>
        <li>Cobrar a assinatura e cumprir obrigações legais e fiscais (art. 7º, II e V).</li>
        <li>Segurança e prevenção a fraude: registrar acessos e alterações (art. 7º, IX) e guardar registros de acesso pelo prazo do Marco Civil da Internet.</li>
      </ul>
      <p>Não vendemos dados, não usamos os dados da piscicultura para publicidade e não tomamos decisões automatizadas sobre pessoas.</p>

      <h2>4. Com quem compartilhamos</h2>
      <p>Só com os provedores necessários ao serviço: Supabase (banco de dados e login), Vercel (hospedagem), Asaas (cobranças), Focus NFe (notas fiscais) e Pluggy (extratos bancários, só quando a piscicultura conecta o banco), além de autoridades quando a lei exigir. Alguns desses provedores guardam dados fora do Brasil; nesses casos a transferência segue o art. 33 da LGPD, com cláusulas contratuais e garantias de segurança.</p>

      <h2>5. Cookies</h2>
      <p>Usamos só cookies essenciais, para manter a sessão e lembrar preferências. Veja a <Link href="/cookies" className={CLASSE_BOTAO_TEXTO}>Política de cookies</Link>.</p>

      <h2>6. Segurança e guarda</h2>
      <p>O acesso é separado por empresa e por permissão de usuário, com conexão cifrada (HTTPS), senhas guardadas de forma irreversível e cópias de segurança. Os dados ficam guardados enquanto a assinatura estiver ativa e por até 90 dias após o cancelamento, salvo o que a lei obriga a guardar por mais tempo (por exemplo, documentos fiscais por 5 anos e registros de acesso por 6 meses).</p>

      <h2>7. Seus direitos</h2>
      <p>Você pode pedir confirmação, acesso, correção, anonimização, portabilidade ou exclusão dos seus dados, informação sobre compartilhamento e revogação de consentimentos (art. 18), pelo e-mail {f.email}. Respondemos em até 15 dias. Pedidos sobre dados lançados por uma piscicultura são encaminhados a ela, que é a controladora. Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).</p>

      <h2>8. Encarregado e incidentes</h2>
      <p>Encarregado pelo tratamento de dados (DPO): {f.email}. Incidentes de segurança que possam causar risco ou dano relevante serão comunicados aos afetados e à ANPD nos prazos da regulamentação.</p>

      <h2>9. Público e alterações</h2>
      <p>O Balbina é destinado a empresas e produtores rurais e não deve ser usado por menores de 18 anos. Esta política pode mudar; a versão nova é avisada no sistema e pede novo aceite.</p>
    </DocumentoLegal>
  );
}
