PRAGMA foreign_keys = ON;

CREATE TABLE usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  email TEXT UNIQUE,
  senha_hash TEXT,
  criado_em TEXT DEFAULT (datetime('now'))
);

CREATE TABLE lotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  tipo_producao TEXT NOT NULL DEFAULT 'peixe' CHECK(tipo_producao = 'peixe'),
  usuario_id INTEGER NOT NULL,
  quantidade_inicial INTEGER NOT NULL DEFAULT 0,
  peso_estimado_kg REAL DEFAULT 0,
  data_abertura TEXT NOT NULL DEFAULT (date('now')),
  data_fechamento TEXT,
  status TEXT NOT NULL DEFAULT 'aberto',
  custo_inicial REAL DEFAULT 0,
  custo_total REAL DEFAULT 0,
  criado_em TEXT DEFAULT (datetime('now')),
  atualizado_em TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

CREATE TABLE colheitas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lote_id INTEGER NOT NULL,
  data TEXT NOT NULL DEFAULT (date('now')),
  quantidade INTEGER NOT NULL,
  peso_total_kg REAL NOT NULL,
  receita_total REAL DEFAULT 0,
  criado_em TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (lote_id) REFERENCES lotes(id)
);

CREATE TABLE transacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL CHECK(tipo IN ('receita','despesa')),
  descricao TEXT,
  valor REAL NOT NULL,
  data TEXT NOT NULL DEFAULT (datetime('now')),
  usuario_id INTEGER,
  lote_id INTEGER,
  categoria TEXT,
  criado_em TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  FOREIGN KEY (lote_id) REFERENCES lotes(id)
);

CREATE TABLE estoque (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL CHECK(tipo IN ('peixe','racao')),
  produto TEXT NOT NULL,
  quantidade REAL NOT NULL DEFAULT 0,
  unidade TEXT NOT NULL DEFAULT 'un',
  custo_unitario REAL DEFAULT 0,
  criado_em TEXT DEFAULT (datetime('now')),
  atualizado_em TEXT DEFAULT (datetime('now'))
);

CREATE TABLE movimentos_estoque (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  estoque_id INTEGER NOT NULL,
  tipo TEXT NOT NULL CHECK(tipo IN ('entrada','saida')),
  quantidade REAL NOT NULL,
  data TEXT NOT NULL DEFAULT (datetime('now')),
  referencia TEXT,
  transacao_id INTEGER,
  criado_em TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (estoque_id) REFERENCES estoque(id),
  FOREIGN KEY (transacao_id) REFERENCES transacoes(id)
);

CREATE TABLE contas_a_pagar (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  descricao TEXT NOT NULL,
  valor REAL NOT NULL,
  vencimento TEXT NOT NULL,
  pago INTEGER NOT NULL DEFAULT 0,
  data_pagamento TEXT,
  alerta_dias INTEGER DEFAULT 3,
  criado_em TEXT DEFAULT (datetime('now')),
  usuario_id INTEGER,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);