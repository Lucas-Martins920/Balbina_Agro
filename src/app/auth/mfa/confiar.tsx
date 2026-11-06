import type { ComponentProps } from "react";

// "Confiar neste dispositivo": nos próximos 14 dias, o login neste navegador pede só a senha.
export function CaixaConfiar(props: ComponentProps<"input">) {
  return (
    <label className="flex items-start gap-2.5 text-sm text-texto-suave">
      <input type="checkbox" name="confiar" className="mt-0.5 size-4 accent-marca" {...props} />
      <span>Confiar neste dispositivo por 14 dias. Não marque em computador compartilhado.</span>
    </label>
  );
}
