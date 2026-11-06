import { createHmac } from "node:crypto";

// Código de 6 dígitos do app autenticador (RFC 6238, SHA-1, 30 s), a partir do segredo em base32.
export function codigoTotp(segredo: string, quando = Date.now()) {
  const alfabeto = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of segredo.replace(/=+$/, "").toUpperCase()) {
    const v = alfabeto.indexOf(c);
    if (v < 0) throw new Error("Segredo TOTP fora do base32");
    bits += v.toString(2).padStart(5, "0");
  }
  const chave = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const passo = Buffer.alloc(8);
  passo.writeBigUInt64BE(BigInt(Math.floor(quando / 1000 / 30)));
  const hmac = createHmac("sha1", chave).update(passo).digest();
  const desloc = hmac[hmac.length - 1] & 0xf;
  const numero = (hmac.readUInt32BE(desloc) & 0x7fffffff) % 1_000_000;
  return numero.toString().padStart(6, "0");
}

export function passoTotp(quando = Date.now()) {
  return Math.floor(quando / 1000 / 30);
}
