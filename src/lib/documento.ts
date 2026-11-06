// CPF e CNPJ: dígitos verificadores e máscara de exibição.

function digito(numeros: string, pesos: number[]) {
  const soma = pesos.reduce((s, p, i) => s + Number(numeros[i]) * p, 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function cpfValido(cpf: string) {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  return digito(d, [10, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(d[9]) && digito(d, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(d[10]);
}

export function cnpjValido(cnpj: string) {
  const d = cnpj.replace(/\D/g, "");
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  return digito(d, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(d[12]) && digito(d, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(d[13]);
}

export function formatarDocumento(doc: string | null | undefined) {
  const d = (doc ?? "").replace(/\D/g, "");
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return doc ?? "";
}
