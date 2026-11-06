import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { VERSAO_TERMOS } from "../src/lib/termos";
import { gravarDados, hojeManaus, PASTA_ESTADO, type Dados } from "./apoio";
import { codigoTotp, passoTotp } from "./totp";

// Prepara o banco para os testes de ponta a ponta, pelo próprio Supabase Auth e pelas funções do banco
// (as mesmas que o app usa): cria a pessoa dona com app autenticador, a piscicultura com viveiro e lote de
// tambaqui, preço do kg do peixe médio e conta bancária, e uma segunda pessoa com o teste grátis vencido.
// Precisa de NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY e SUPABASE_SECRET_KEY.

function env(nome: string) {
  const v = process.env[nome];
  if (!v) throw new Error(`Defina ${nome} para os testes de ponta a ponta (veja e2e/README.md).`);
  return v;
}

const OPCOES = { auth: { persistSession: false, autoRefreshToken: false } };

// CNPJ com dígitos verificadores válidos e base aleatória, para cada execução ter empresas novas.
function cnpjAleatorio() {
  const base = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10));
  base[8] = 0; base[9] = 0; base[10] = 0; base[11] = 1;
  const dv = (nums: number[]) => {
    const pesos = nums.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const resto = nums.reduce((s, n, i) => s + n * pesos[i], 0) % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  base.push(dv(base));
  base.push(dv(base));
  return base.join("");
}

function exigir<T>(r: { data: T; error: { message: string } | null }, oQue: string): NonNullable<T> {
  if (r.error || r.data === null || r.data === undefined) throw new Error(`Preparo E2E: ${oQue}: ${r.error?.message ?? "sem dados"}`);
  return r.data as NonNullable<T>;
}

function semErro(r: { error: { message: string } | null }, oQue: string) {
  if (r.error) throw new Error(`Preparo E2E: ${oQue}: ${r.error.message}`);
}

function diasAtras(n: number) {
  const d = new Date(`${hojeManaus()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

// Cria a pessoa, entra com senha, cadastra o app autenticador e devolve o cliente já em aal2.
async function criarPessoa(admin: SupabaseClient, nome: string) {
  const sufixo = randomBytes(4).toString("hex");
  const email = `e2e-${nome}-${sufixo}@balbina.test`;
  const senha = `E2e!${randomBytes(9).toString("base64url")}`;
  semErro(await admin.auth.admin.createUser({
    email, password: senha, email_confirm: true,
    user_metadata: { termos_versao: VERSAO_TERMOS, termos_aceitos_em: new Date().toISOString() },
  }), `criar ${email}`);

  const cliente = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), OPCOES);
  semErro(await cliente.auth.signInWithPassword({ email, password: senha }), `entrar como ${email}`);
  const fator = exigir(await cliente.auth.mfa.enroll({ factorType: "totp", friendlyName: "E2E" }), "cadastrar o autenticador");
  exigir(await cliente.auth.mfa.challengeAndVerify({ factorId: fator.id, code: codigoTotp(fator.totp.secret) }), "confirmar o autenticador");
  // o login pelo navegador não pode repetir este código: guarda o passo usado
  mkdirSync(PASTA_ESTADO, { recursive: true });
  writeFileSync(`${PASTA_ESTADO}/totp-${fator.totp.secret.slice(0, 8)}.txt`, String(passoTotp()));
  return { cliente, usuario: { email, senha, totp: fator.totp.secret } };
}

export default async function preparar() {
  rmSync(PASTA_ESTADO, { recursive: true, force: true });
  const admin = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SECRET_KEY"), OPCOES);

  // Pessoa dona da piscicultura, no teste grátis (plano Gestão, tudo liberado)
  const dono = await criarPessoa(admin, "dono");
  const db = dono.cliente;
  const cnpj = cnpjAleatorio();
  const empresaId = exigir(await db.rpc("criar_empresa", { p_cnpj: cnpj, p_razao_social: "Piscicultura E2E Ltda", p_nome_fantasia: "Piscicultura E2E" }), "criar a empresa") as string;

  const setor = exigir(await db.from("setores").insert({ empresa_id: empresaId, nome: "Sede" }).select("id").single(), "criar o setor");
  const viveiro = exigir(await db.from("viveiros").insert({
    empresa_id: empresaId, setor_id: setor.id, nome: "V1", finalidade: "engorda", sistema: "escavado", capacidade_peixes: 20000, area_m2: 5000,
  }).select("id").single(), "criar o viveiro");
  const especie = exigir(await db.from("especies").select("id").is("empresa_id", null).eq("nome", "Tambaqui").single(), "achar a espécie");
  exigir(await db.rpc("povoar_lote", {
    p_empresa: empresaId, p_codigo: "E2E-1", p_especie: especie.id, p_povoamento: diasAtras(60),
    p_viveiro: viveiro.id, p_qtd: 10000, p_peso_inicial_g: 30,
  }), "povoar o lote");

  // classe Médio: a despesca põe kg nela e o PDV vende o produto "Peixe médio (kg)" a R$ 12,00 o kg
  const classe = exigir(await db.from("classes_peixe").select("id").eq("empresa_id", empresaId).eq("nome", "Médio").single(), "achar a classe Médio");
  const produtos = exigir(await db.from("produtos").select("id, nome").eq("empresa_id", empresaId).eq("classe_peixe_id", classe.id).eq("fator_kg", 1).eq("para_venda", true), "achar o kg do peixe médio");
  const kg = produtos.find((p) => p.nome === "Peixe médio (kg)");
  if (!kg) throw new Error(`Preparo E2E: sem o produto "Peixe médio (kg)" (produtos: ${produtos.map((p) => p.nome).join(", ")})`);
  semErro(await db.rpc("definir_preco", { p_produto: kg.id, p_preco_cents: 1200, p_cliente: null, p_desde: diasAtras(1) }), "definir o preço do kg");

  const conta = exigir(await db.from("contas_financeiras").insert({ empresa_id: empresaId, tipo: "corrente", nome: "Banco E2E" }).select("id").single(), "criar a conta bancária");
  exigir(await db.from("contatos").insert({ empresa_id: empresaId, tipos: ["cliente"], nome: "Mercado E2E" }).select("id").single(), "criar o cliente");
  exigir(await db.from("contatos").insert({ empresa_id: empresaId, tipos: ["fornecedor"], nome: "Fornecedor de Ração E2E" }).select("id").single(), "criar o fornecedor");
  await db.auth.signOut({ scope: "local" });

  // Pessoa com o teste grátis vencido: o banco bloqueia e o app leva para a assinatura
  const bloqueado = await criarPessoa(admin, "bloqueado");
  const empresaBloqueada = exigir(await bloqueado.cliente.rpc("criar_empresa", {
    p_cnpj: cnpjAleatorio(), p_razao_social: "Piscicultura Vencida E2E Ltda", p_nome_fantasia: "Piscicultura Vencida E2E",
  }), "criar a empresa bloqueada") as string;
  await bloqueado.cliente.auth.signOut({ scope: "local" });
  const { error: erroAssinatura } = await admin.from("assinaturas").update({ teste_ate: diasAtras(2) }).eq("empresa_id", empresaBloqueada);
  if (erroAssinatura) throw new Error(`Preparo E2E: vencer o teste grátis: ${erroAssinatura.message}`);

  const dados: Dados = {
    dono: { ...dono.usuario, cnpj },
    bloqueado: bloqueado.usuario,
    contaBancoId: conta.id,
    classeMedioId: classe.id,
  };
  gravarDados(dados);
}
