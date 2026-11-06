import type { Metadata } from "next";
import Link from "next/link";
import { DocumentoLegal } from "@/components/documento-legal";
import { FORNECEDOR } from "@/lib/termos";
import { CLASSE_BOTAO_TEXTO } from "@/components/ui";

export const metadata: Metadata = { title: "Termos de uso · Balbina" };

// Texto-base. Revise com um advogado antes de vender (veja docs/seguranca-e-assinatura.md).
export default function PaginaTermos() {
  const f = FORNECEDOR;
  return (
    <DocumentoLegal titulo="Termos de uso">
      <p className="mt-6">
        Estes termos regem o uso do Balbina ERP, sistema de gestão para pisciculturas de engorda oferecido por {f.razaoSocial}, CNPJ {f.cnpj}
        (&quot;Balbina&quot;). Ao criar uma conta, aceitar um convite ou usar o sistema, você declara que leu e aceita estes termos, a{" "}
        <Link href="/privacidade" className={CLASSE_BOTAO_TEXTO}>Política de privacidade</Link> e a{" "}
        <Link href="/cookies" className={CLASSE_BOTAO_TEXTO}>Política de cookies</Link>. O aceite é eletrônico e fica registrado
        com a versão dos documentos, a data e o endereço IP.
      </p>

      <h2>1. O serviço</h2>
      <p>O Balbina é oferecido pela internet, por assinatura, para empresas e produtores rurais (&quot;Cliente&quot;). O Cliente cadastra a sua empresa e os usuários que vão acessá-la, e é responsável pelos dados que lança e pelas permissões que concede. Quem cria a empresa é o usuário master e declara ter poderes para contratar em nome dela.</p>

      <h2>2. Teste grátis e assinatura</h2>
      <ul>
        <li>Cada empresa nova tem 14 dias de teste grátis, sem compromisso.</li>
        <li>Depois do teste, o acesso depende de assinatura ativa no plano escolhido, cobrada de forma recorrente (mensal ou anual) por Pix, boleto ou cartão, por meio do Asaas.</li>
        <li>Com a mensalidade em atraso por mais de 5 dias, o acesso é suspenso até a confirmação do pagamento. Os dados não são apagados durante a suspensão.</li>
        <li>Os valores podem ser reajustados com aviso prévio de 30 dias por e-mail.</li>
      </ul>

      <h2>3. Cancelamento</h2>
      <p>O usuário master pode cancelar a assinatura a qualquer momento na tela Assinatura. O acesso continua até o fim do período já pago, sem reembolso proporcional, salvo o direito de arrependimento previsto em lei. Depois do cancelamento, o Cliente pode pedir a exportação dos seus dados em até 90 dias; após esse prazo os dados podem ser excluídos, ressalvadas as obrigações legais de guarda.</p>

      <h2>4. Obrigações do Cliente</h2>
      <ul>
        <li>Manter as senhas em sigilo, não compartilhar contas entre pessoas e avisar o Balbina sobre qualquer acesso indevido.</li>
        <li>Lançar apenas dados que tem o direito de tratar, informando os titulares quando a lei exigir, e usar o sistema conforme a lei.</li>
        <li>Conferir os documentos fiscais e cobranças emitidos pelo sistema; a responsabilidade fiscal e tributária é do Cliente.</li>
      </ul>

      <h2>5. Uso não permitido</h2>
      <p>É proibido: tentar acessar dados de outras empresas ou contornar as permissões e a cobrança; testar a segurança do sistema sem autorização por escrito; copiar, descompilar ou revender o sistema; usar robôs para extrair dados ou sobrecarregar o serviço; e usar o Balbina para fraude ou atividade ilegal. A violação permite suspender o acesso imediatamente e encerrar o contrato, sem prejuízo das medidas legais. Falhas de segurança encontradas de boa-fé podem ser comunicadas para {f.email}.</p>

      <h2>6. Dados pessoais</h2>
      <p>Nos dados que lança no sistema (clientes, fornecedores, funcionários), o Cliente é o controlador e o Balbina é o operador, nos termos da LGPD. O Balbina trata esses dados só para prestar o serviço e conforme as instruções do Cliente, mantém sigilo, usa apenas os provedores listados na Política de privacidade, comunica incidentes de segurança relevantes e, ao fim do contrato, devolve ou exclui os dados nos prazos do item 3.</p>

      <h2>7. Integrações</h2>
      <p>Cobranças (Asaas), notas fiscais (Focus NFe) e extratos bancários (Open Finance pela Pluggy) dependem desses provedores e dos contratos que o Cliente mantém com eles. O Balbina não responde por indisponibilidade ou erro desses serviços.</p>

      <h2>8. Propriedade intelectual</h2>
      <p>O sistema, a marca e o conteúdo do Balbina pertencem ao Balbina. A assinatura dá ao Cliente uma licença de uso pessoal, não exclusiva e intransferível, enquanto estiver ativa. Os dados lançados pelo Cliente continuam sendo do Cliente.</p>

      <h2>9. Disponibilidade e responsabilidade</h2>
      <p>O Balbina se empenha para manter o sistema disponível e com cópias de segurança, mas não garante funcionamento ininterrupto. Paradas programadas serão avisadas com antecedência sempre que possível. A responsabilidade do Balbina fica limitada ao valor pago pelo Cliente nos 12 meses anteriores ao evento, exceto nos casos em que a lei não permite essa limitação.</p>

      <h2>10. Comunicações</h2>
      <p>Avisos sobre a conta, cobrança, segurança e mudanças nestes termos são enviados ao e-mail do usuário master ou mostrados no sistema.</p>

      <h2>11. Alterações, lei e foro</h2>
      <p>Estes termos podem mudar; a versão nova vale a partir do aviso no sistema ou por e-mail, e o sistema pede um novo aceite. Aplica-se a lei brasileira. Fica eleito o foro de {f.foro}, ressalvado o foro do domicílio do consumidor quando a lei o garantir. Dúvidas: {f.email}.</p>
    </DocumentoLegal>
  );
}
