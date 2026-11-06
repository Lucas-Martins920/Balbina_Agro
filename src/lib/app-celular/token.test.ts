import { test } from "node:test";
import assert from "node:assert/strict";
import { tokenDoCabecalho } from "./token.ts";

test("tokenDoCabecalho lê o token do Bearer", () => {
  assert.equal(tokenDoCabecalho("Bearer abc.def-ghi_jk"), "abc.def-ghi_jk");
  assert.equal(tokenDoCabecalho("bearer xyz"), "xyz");
});

test("tokenDoCabecalho recusa cabeçalho ausente ou fora do formato", () => {
  assert.equal(tokenDoCabecalho(null), null);
  assert.equal(tokenDoCabecalho(""), null);
  assert.equal(tokenDoCabecalho("Basic abc"), null);
  assert.equal(tokenDoCabecalho("Bearer "), null);
  assert.equal(tokenDoCabecalho("Bearer a b"), null);
});
