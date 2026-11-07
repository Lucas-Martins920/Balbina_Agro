import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import {
  LOJA, NOME_BANCO, _reiniciarArmazem, abrirArmazem, armazemPronto, assinarArmazem, deveMigrar, gravarItem, gravarJson, lerItem, lerJson, usandoIndexedDB,
} from "./indexeddb.ts";

// localStorage de mentira (o node não tem)
class Armazenamento {
  dados = new Map<string, string>();
  get length() { return this.dados.size; }
  key(i: number) { return [...this.dados.keys()][i] ?? null; }
  getItem(k: string) { return this.dados.get(k) ?? null; }
  setItem(k: string, v: string) { this.dados.set(k, String(v)); }
  removeItem(k: string) { this.dados.delete(k); }
  clear() { this.dados.clear(); }
}

let ls: Armazenamento;
beforeEach(() => {
  _reiniciarArmazem();
  globalThis.indexedDB = new IDBFactory();
  ls = new Armazenamento();
  (globalThis as { localStorage?: unknown }).localStorage = ls;
});
afterEach(() => _reiniciarArmazem());

async function lerDoBanco(chave: string): Promise<unknown> {
  const db = await new Promise<IDBDatabase>((ok) => { const r = indexedDB.open(NOME_BANCO); r.onsuccess = () => ok(r.result); });
  const v = await new Promise((ok) => { const r = db.transaction(LOJA).objectStore(LOJA).get(chave); r.onsuccess = () => ok(r.result); });
  db.close();
  return v;
}

test("só as filas e preferências do campo e do vendedor migram; tema, lateral e PDV ficam no localStorage", () => {
  assert.equal(deveMigrar("balbina:campo:envios:emp"), true);
  assert.equal(deveMigrar("balbina:vendedor:fila:emp"), true);
  assert.equal(deveMigrar("balbina.pdv.conta.emp"), false);
  assert.equal(deveMigrar("balbina-tema"), false);
  assert.equal(deveMigrar("balbina.lateral"), false);
});

test("na primeira abertura a fila sai do localStorage e vai para o IndexedDB", async () => {
  ls.setItem("balbina:campo:envios:e1", '[{"client_id":"a"}]');
  ls.setItem("balbina-tema", "escuro");
  await abrirArmazem();
  assert.equal(usandoIndexedDB(), true);
  assert.equal(lerItem("balbina:campo:envios:e1"), '[{"client_id":"a"}]');
  assert.equal(ls.getItem("balbina:campo:envios:e1"), null, "saiu do localStorage");
  assert.equal(ls.getItem("balbina-tema"), "escuro", "o tema não é migrado");
  assert.equal(await lerDoBanco("balbina:campo:envios:e1"), '[{"client_id":"a"}]');
});

test("gravação aparece na hora na memória e fica no banco depois de reabrir", async () => {
  await abrirArmazem();
  gravarJson("balbina:vendedor:fila:e1", [{ client_id: "p1" }]);
  assert.deepEqual(lerJson("balbina:vendedor:fila:e1", []), [{ client_id: "p1" }]);
  await new Promise((r) => setTimeout(r, 20));
  const banco = globalThis.indexedDB;
  _reiniciarArmazem();
  globalThis.indexedDB = banco; // mesmo "aparelho", app aberto de novo
  await abrirArmazem();
  assert.deepEqual(lerJson("balbina:vendedor:fila:e1", []), [{ client_id: "p1" }]);
});

test("o que a tela grava antes do banco abrir não se perde nem é sobrescrito pelo banco", async () => {
  gravarItem("balbina:campo:aba:e1", '"racao"');
  assert.equal(lerItem("balbina:campo:aba:e1"), '"racao"');
  await abrirArmazem();
  assert.equal(lerItem("balbina:campo:aba:e1"), '"racao"');
  assert.equal(await lerDoBanco("balbina:campo:aba:e1"), '"racao"');
});

test("avisa quem assina quando o banco termina de abrir e a cada gravação", async () => {
  let vezes = 0;
  const parar = assinarArmazem(() => vezes++);
  await abrirArmazem();
  assert.equal(armazemPronto(), true);
  const depoisDeAbrir = vezes;
  assert.ok(depoisDeAbrir >= 1);
  gravarItem("balbina:campo:x", "1");
  assert.equal(vezes, depoisDeAbrir + 1);
  parar();
  gravarItem("balbina:campo:x", "2");
  assert.equal(vezes, depoisDeAbrir + 1);
});

test("sem IndexedDB cai para o localStorage", async () => {
  delete (globalThis as { indexedDB?: unknown }).indexedDB;
  await abrirArmazem();
  assert.equal(usandoIndexedDB(), false);
  assert.equal(gravarItem("balbina:campo:envios:e1", "[]"), true);
  assert.equal(ls.getItem("balbina:campo:envios:e1"), "[]");
});

test("apagar remove da memória", async () => {
  await abrirArmazem();
  gravarItem("balbina:campo:y", "1");
  gravarItem("balbina:campo:y", null);
  assert.equal(lerItem("balbina:campo:y"), null);
});
