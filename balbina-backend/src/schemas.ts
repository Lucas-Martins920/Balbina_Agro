import { z } from "zod";

export const AbrirLoteSchema = z.object({
  action: z.literal("abrir_lote"),
  payload: z.object({
    loteId: z.string().min(1),
    especie: z.string().min(1),
    tanqueId: z.string().min(1),
    dataInicio: z.string().refine(s => !Number.isNaN(Date.parse(s))),
    estoqueInicial: z.number().int().nonnegative(),
    unidade: z.string().optional(),
    observacoes: z.string().optional(),
    manejo: z.record(z.string(), z.any()).optional()
  })
});
export type AbrirLoteOutput = z.infer<typeof AbrirLoteSchema>;

export const LancarInsumoSchema = z.object({
  action: z.literal("lancar_insumo"),
  payload: z.object({
    insumoId: z.string().min(1),
    tipo: z.enum(["racao", "alevino", "medicamento", "outro"]),
    descricao: z.string().optional(),
    quantidade: z.number().positive(),
    unidade: z.string().optional(),
    precoUnitario: z.number().nonnegative().optional(),
    fornecedor: z.string().optional(),
    tanqueId: z.string().optional(),
    dataCompra: z.string().refine(s => !Number.isNaN(Date.parse(s)))
  })
});
export type LancarInsumoOutput = z.infer<typeof LancarInsumoSchema>;