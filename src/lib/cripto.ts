import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

// Cifra as chaves de API das pisciculturas antes de gravar no banco (AES-256-GCM).
// O segredo mestre fica só na Vercel (BALBINA_CHAVE_CRIPTO); sem ele, o que está no banco não serve para nada.
function chaveMestra(segredo: string | undefined) {
  if (!segredo || segredo.length < 32) throw new Error("Defina BALBINA_CHAVE_CRIPTO (pelo menos 32 caracteres) no servidor.");
  return createHash("sha256").update(segredo).digest();
}

export function cifrar(texto: string, segredo = process.env.BALBINA_CHAVE_CRIPTO) {
  const iv = randomBytes(12);
  const cifra = createCipheriv("aes-256-gcm", chaveMestra(segredo), iv);
  const dados = Buffer.concat([cifra.update(texto, "utf8"), cifra.final()]);
  return ["v1", iv.toString("base64"), cifra.getAuthTag().toString("base64"), dados.toString("base64")].join(":");
}

export function decifrar(guardado: string, segredo = process.env.BALBINA_CHAVE_CRIPTO) {
  const [versao, iv, tag, dados] = guardado.split(":");
  if (versao !== "v1" || !iv || !tag || !dados) throw new Error("Credencial guardada em formato desconhecido.");
  const decifra = createDecipheriv("aes-256-gcm", chaveMestra(segredo), Buffer.from(iv, "base64"));
  decifra.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decifra.update(Buffer.from(dados, "base64")), decifra.final()]).toString("utf8");
}

// Token de webhook: guardamos só o hash; o Asaas manda o token e comparamos os hashes.
export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function tokenConfereHash(recebido: string | null, hashEsperado: string | null | undefined) {
  if (!recebido || !hashEsperado) return false;
  const a = Buffer.from(hashToken(recebido), "hex");
  const b = Buffer.from(hashEsperado, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function novoToken() {
  return randomBytes(32).toString("base64url"); // 43 caracteres; o Asaas pede de 32 a 255
}
