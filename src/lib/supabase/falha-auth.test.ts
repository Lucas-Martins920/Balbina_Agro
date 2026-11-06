import { test } from "node:test";
import assert from "node:assert/strict";
import { AuthApiError, AuthInvalidJwtError, AuthRetryableFetchError, AuthSessionMissingError } from "@supabase/supabase-js";
import { falhaTemporaria } from "./falha-auth.ts";

test("rede, timeout e 5xx do Auth são temporários (503, tenta de novo)", () => {
  assert.equal(falhaTemporaria(new AuthRetryableFetchError("fetch failed", 0)), true);
  assert.equal(falhaTemporaria(new AuthApiError("erro interno", 500, "unexpected_failure")), true);
  assert.equal(falhaTemporaria(new AuthApiError("gateway", 502, undefined)), true);
});

test("sessão vencida ou recusada não é temporária (vai para o login)", () => {
  assert.equal(falhaTemporaria(new AuthApiError("Invalid Refresh Token: Refresh Token Not Found", 400, "refresh_token_not_found")), false);
  assert.equal(falhaTemporaria(new AuthApiError("JWT expired", 403, "bad_jwt")), false);
  assert.equal(falhaTemporaria(new AuthInvalidJwtError("Invalid JWT structure")), false);
  assert.equal(falhaTemporaria(new AuthSessionMissingError()), false);
});
