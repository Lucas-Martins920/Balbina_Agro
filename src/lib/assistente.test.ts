import { test } from "node:test";
import assert from "node:assert/strict";
import { mostrarNoPainel, passosConhecidos, progresso, proximoPasso, textoFaltam, type SituacaoAssistente } from "./assistente.ts";

const situacao = (over: Partial<SituacaoAssistente> = {}): SituacaoAssistente => ({
  passos: [
    { id: "piscicultura", feito: true, pulado: false },
    { id: "lotes", feito: false, pulado: true },
    { id: "estoque", feito: false, pulado: false },
    { id: "apontamento", feito: false, pulado: false },
  ],
  faltam: 2,
  escondido: false,
  concluido: false,
  ...over,
});

test("texto de quantos passos faltam", () => {
  assert.equal(textoFaltam(3), "Faltam 3 passos");
  assert.equal(textoFaltam(1), "Falta 1 passo");
  assert.equal(textoFaltam(0), "Tudo pronto");
});

test("próximo passo pula os feitos e os pulados", () => {
  assert.equal(proximoPasso(situacao())?.id, "estoque");
  assert.equal(proximoPasso(situacao({ passos: [{ id: "piscicultura", feito: true, pulado: false }], faltam: 0 })), null);
});

test("painel mostra o assistente só enquanto falta passo e não foi escondido", () => {
  assert.equal(mostrarNoPainel(situacao()), true);
  assert.equal(mostrarNoPainel(situacao({ escondido: true })), false);
  assert.equal(mostrarNoPainel(situacao({ concluido: true })), false);
  assert.equal(mostrarNoPainel(situacao({ faltam: 0 })), false);
  assert.equal(mostrarNoPainel(null), false);
});

test("progresso conta feitos e pulados", () => {
  assert.equal(progresso(situacao()), 0.5);
  assert.equal(progresso(situacao({ passos: [], faltam: 0 })), 1);
});

test("passo que o app não conhece fica de fora", () => {
  const s = situacao({ passos: [{ id: "novo", feito: false, pulado: false }, { id: "piscicultura", feito: false, pulado: false }] });
  assert.deepEqual(passosConhecidos(s).map((p) => p.id), ["piscicultura"]);
  assert.equal(passosConhecidos(s)[0].href, "/piscicultura");
});
