import { exigirAceiteTermos } from "@/lib/aceite-termos";
import { exigirSegundoFator } from "@/lib/mfa";
import { TelaAcesso } from "@/components/tela-acesso";
import { FormEmpresa } from "./form";

export default async function PaginaOnboarding() {
  await exigirAceiteTermos("/onboarding");
  await exigirSegundoFator("/onboarding");
  return (
    <TelaAcesso
      titulo="Cadastre sua piscicultura"
      descricao="A empresa já nasce com plano de categorias, classes de peixe por peso, depósitos e centros de custo de uma piscicultura de tambaqui. Tudo pode ser ajustado depois."
    >
      <FormEmpresa />
    </TelaAcesso>
  );
}
