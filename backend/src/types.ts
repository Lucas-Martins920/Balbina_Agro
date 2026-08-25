import { z } from "zod";

export const AbrirLoteSchema = z.object({
  action: z.literal("abrir_lote"),
  payload: z.object({
    loteId: z.string().min(1),
    especie: z.string().min(1),
    tanqueId: z.string().min(1),
    dataInicio: z.string().refine(s => !Number.isNaN(Date.parse(s)), { message: "data invalida" }),
    estoqueInicial: z.number().int().nonnegative(),
    unidade: z.string().optional(), // ex: "peixes"
    observacoes: z.string().optional(),
    manejo: z.record(z.any()).optional() // parâmetros sugeridos pela IA (pode ser merge com conhecimento local)
  }),
});

export type AbrirLoteOutput = z.infer<typeof AbrirLoteSchema>;