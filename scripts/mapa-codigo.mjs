#!/usr/bin/env node
// Gera o mapa do código do Balbina: onde fica cada tela, função, componente, rota de API,
// função/tabela/view/trigger do banco, teste, workflow e script, e quem usa cada coisa.
// Uso: npm run mapa  (regera a pasta docs/mapa-codigo/: mapa.html com busca + páginas .md)
//      npm run mapa -- --conferir  (só confere se a pasta gerada está em dia; sai com erro se não)
// O conteúdo é lido do próprio código; as descrições de pastas e domínios ficam nas tabelas abaixo.

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from "node:fs";
import { join, relative, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASTA_SAIDA = "docs/mapa-codigo";
const GITHUB = "https://github.com/Lucas-Martins920/Balbina_Agro/blob/Teste-Desevolvimento/";

// ---------------------------------------------------------------------------
// Domínios: a primeira regra que casar com o caminho (ou com o nome do objeto do banco) vence.
// ---------------------------------------------------------------------------
const DOMINIOS = [
  { id: "importacao", nome: "Importação (NIBO, LC, planilha modelo)", re: /importa|nibo/ },
  { id: "api", nome: "API pública, webhooks e rotinas agendadas", re: /api\/v1|lib\/api\/|webhook|integracoes|api_chave|api_webhook|\/cron\/|configuracoes\/api/ },
  { id: "fiscal", nome: "Fiscal (NF-e e NFC-e via Focus)", re: /notas|nfe|nfce|focus|inutilizac|emitir-nfce|botao-nfe/ },
  { id: "cobranca", nome: "Cobrança (Asaas) e assinatura do Balbina", re: /cobranca|asaas|assinatura|niveis_plano|(^|[/_])planos?([/_.]|$)|cnab|perfis_cobranca/ },
  { id: "rh", nome: "RH e cartão de ponto", re: /(^|[/_-])rh([/_.-]|$)|(^|[/_-])ponto([/_.-]|$)|funcionario|escala|feriado/ },
  { id: "manutencao", nome: "Manutenções (equipamentos, preventiva, checklist)", re: /manuten|equipamento|planos_manutencao|checklist_itens/ },
  { id: "producao", nome: "Produção (piscicultura, lotes, apontamento, sanidade, indicadores)", re: /piscicultura|lote|aloca|mortal|apontamento|indicador|sanidade|zootecnic|crescimento|classifica|causas?-mort|causas?_mort|ovos?([/_.-]|$)|campo|medica|linhag|galp|setor|curva|pesage|carencia|eventos_sanitarios|classes_peixe/ },
  { id: "vendas", nome: "Vendas, PDV, estoque, produtos e ração", re: /venda|pdv|vendedor|pedido|estoque|deposito|pontos|produto|preco|racao|formula|ordens_producao|transferencia|caixa_pdv|margem_cliente|clientes_compras|compras_grupo/ },
  { id: "gestao", nome: "Planejamento, previsões, custo do kg e relatórios", re: /planejamento|previs|relatorio|analise-periodo|apresentacao|custo|orcamento|orcado|dre|grafico|alertas|aging/ },
  { id: "seguranca", nome: "Login, segurança, usuários e permissões", re: /auth|login|mfa|segur|captcha|cripto|permiss|termos|aceite|cookies|convite|usuario|cargo|2fa|dispositivo|historico|audit|proxy\.ts|sessoes|privacidade|documento-legal|sem-acesso|codigo-mfa/ },
  { id: "financeiro", nome: "Financeiro (contas, títulos, conciliação, fluxo de caixa)", re: /conta|titulo|concilia|ofx|open-finance|open_finance|conexoes_bancarias|movimento|fluxo|categoria|centro|cart(ao|oes)|regras|baixa|recorrencia|agendamento|rateio|periodos_fechados|resultado|saldo|zerar|lancamento|extrato|acoes-movimento/ },
  { id: "inicio", nome: "Início, painel, ajuda e configurações", re: /onboarding|primeiros-passos|assistente|tutoria|configurac|empresa|fuso|painel|ambiente|versao|online|layout|loading|not-found|manifest|page\.tsx$|globals/ },
  { id: "comum", nome: "Comum (interface e infraestrutura)", re: /.*/ },
];
// Exceções que vêm antes das regras gerais (ex.: "custo-do-kg" casaria com outra regra antes).
const EXCECOES = [
  [/centros-de-custo|centros_custo|categorias_custo/, "financeiro"],
  [/custo-do-kg|custo_ovo|custos_lote|planejamento/, "gestao"],
  [/pontos-de-venda|pontos_venda/, "vendas"],
  [/planos_manutencao/, "manutencao"],
  [/ponto_importacoes/, "rh"],
  [/estoque_peixe_ponto/, "vendas"],
];
const dominioDe = (texto) => {
  const t = texto.toLowerCase();
  const excecao = EXCECOES.find(([re]) => re.test(t));
  return excecao ? excecao[1] : DOMINIOS.find((d) => d.re.test(t)).id;
};
const nomeDominio = Object.fromEntries(DOMINIOS.map((d) => [d.id, d.nome]));

// ---------------------------------------------------------------------------
// Pastas: o que cada área faz (pastas sem entrada aqui recebem descrição automática).
// ---------------------------------------------------------------------------
const PASTAS = {
  "src": "Todo o código do app Next.js (telas, componentes, regras em TypeScript).",
  "src/app": "Rotas do Next.js: cada pasta é um endereço; page.tsx é a tela, route.ts é API, actions.ts são as ações de formulário (server actions).",
  "src/app/(app)": "Telas do sistema logado (com menu lateral). O nome entre parênteses não aparece na URL.",
  "src/app/(app)/_titulos": "Código compartilhado por Contas a pagar e Contas a receber (lista, página e ações).",
  "src/app/api": "Rotas de API do servidor (JSON).",
  "src/app/api/v1": "API pública /api/v1 (chave gerada pelo master em Configurações > API).",
  "src/app/api/cron": "Rotas chamadas por agendador (Open Finance, fila de webhooks).",
  "src/app/api/webhooks": "Recebe avisos de fora (Asaas, Focus NFe, Pluggy).",
  "src/app/auth": "Fluxos de autenticação: MFA, convite, primeiro acesso, nova senha.",
  "src/app/login": "Tela de login (entrar, criar conta, esqueci a senha).",
  "src/app/campo": "Apontamento pelo celular, versão simples (funciona offline).",
  "src/app/vendedor": "App do vendedor (pedidos no celular).",
  "src/app/onboarding": "Criação da primeira empresa depois do cadastro.",
  "src/app/assinatura": "Tela de assinatura/plano do Balbina.",
  "src/components": "Componentes React reutilizados pelas telas. ui.tsx tem os primitivos visuais (botões, cartões, tabelas).",
  "src/components/vendas": "Componentes de vendas: PDV, nova venda, NFC-e, app do vendedor.",
  "src/lib": "Regras e utilitários em TypeScript (cálculos puros, consultas, integrações). Arquivo .test.ts ao lado = teste.",
  "src/lib/api": "Setor da API pública: catálogo de endpoints, consultas, regras e envio de webhooks.",
  "src/lib/supabase": "Clientes do Supabase: server.ts (servidor com sessão), client.ts (navegador), admin.ts (chave de serviço), proxy.ts (sessão no proxy).",
  "supabase": "Banco de dados Supabase (Postgres).",
  "supabase/migrations": "Migrations SQL em ordem de data. Tabelas, views, funções, triggers e policies (RLS). Nunca editar uma antiga: criar outra.",
  "supabase/tests": "Testes do banco (npm run test:db): regras de negócio, triggers e isolamento entre empresas.",
  "e2e": "Testes de ponta a ponta com Playwright (npm run test:e2e).",
  "scripts": "Scripts de apoio: rodar local, backup, testes do banco, aplicar migrations, este mapa.",
  "docs": "Documentação do projeto (fluxo de trabalho, guias, estudos, auditorias).",
  ".github/workflows": "GitHub Actions: Verificação (lint, tipos, testes, build, test:db, E2E e NF-e), migrations, backup e webhooks.",
  "public": "Arquivos estáticos (ícones, service worker do modo offline).",
  ".github": "Configuração do GitHub (workflows do Actions, Dependabot).",
  "docs/codigo": "Documentação do código: arquitetura, convenções, banco, módulos, integrações, testes e operação.",
  "docs/legado": "Referência que não vale mais: o código antigo do Balbina e os documentos do FINAVI (plano original e troca de servidor).",
  "docs/mapa-codigo": "Este mapa do código (gerado por npm run mapa).",
};

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------
const rel = (p) => relative(RAIZ, p).split("\\").join("/");
const ler = (p) => readFileSync(join(RAIZ, p), "utf8");
const IGNORAR = new Set(["node_modules", ".next", ".git", "graphify-out", ".claude", "out", "build", "coverage"]);

function listar(dir, filtro) {
  const abs = join(RAIZ, dir);
  if (!existsSync(abs)) return [];
  const saida = [];
  for (const nome of readdirSync(abs).sort()) {
    if (IGNORAR.has(nome)) continue;
    const p = join(abs, nome);
    if (statSync(p).isDirectory()) saida.push(...listar(rel(p), filtro));
    else if (!filtro || filtro(nome)) saida.push(rel(p));
  }
  return saida;
}

function limparComentario(texto) {
  return texto
    .replace(/^\/\*+|\*+\/$/g, "")
    .split("\n")
    .map((l) => l.replace(/^\s*(\/\/+|\*|--)\s?/, "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
const resumir = (t, max = 220) => (t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t);

// ---------------------------------------------------------------------------
// Menu (src/lib/modulos.ts): nome e descrição de cada tela.
// ---------------------------------------------------------------------------
const MENU = {};
{
  const fonte = ler("src/lib/modulos.ts");
  let grupo = "";
  for (const linha of fonte.split("\n")) {
    const g = linha.match(/^\s*nome: "([^"]+)",\s*$/);
    if (g) grupo = g[1];
    const m = linha.match(/slug: "([^"]+)".*?nome: "([^"]+)", descricao: "([^"]+)"/);
    if (m) MENU["/" + m[1]] = { grupo, nome: m[2], descricao: m[3] };
  }
}

// ---------------------------------------------------------------------------
// TypeScript: símbolos, comentários e importações (via compilador do TypeScript).
// ---------------------------------------------------------------------------
const arquivosTs = listar("src", (n) => /\.(ts|tsx)$/.test(n) && !n.endsWith(".d.ts"));
const arquivosE2e = listar("e2e", (n) => /\.(ts|tsx)$/.test(n));
const todosTs = [...arquivosTs, ...arquivosE2e];

function resolverImport(de, especificador) {
  let base;
  if (especificador.startsWith("@/")) base = "src/" + especificador.slice(2);
  else if (especificador.startsWith(".")) base = rel(join(RAIZ, dirname(de), especificador));
  else return null;
  for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const p = base + ext;
    if (existsSync(join(RAIZ, p)) && statSync(join(RAIZ, p)).isFile()) return p;
  }
  return null;
}

function comentarioAcima(texto, no) {
  const faixas = ts.getLeadingCommentRanges(texto, no.getFullStart()) || [];
  if (!faixas.length) return "";
  return limparComentario(faixas.map((f) => texto.slice(f.pos, f.end)).join("\n"));
}

function cabecalhoDoArquivo(texto) {
  const linhas = texto.split("\n");
  let i = 0;
  const pular = (l) => /^#!/.test(l) || /^\s*["']use (server|client)["'];?\s*$/.test(l) || /^\s*$/.test(l);
  while (i < linhas.length && pular(linhas[i])) i++;
  const bloco = [];
  if (/^\s*\/\*/.test(linhas[i] || "")) {
    while (i < linhas.length) {
      bloco.push(linhas[i]);
      if (/\*\//.test(linhas[i++])) break;
    }
  } else {
    while (i < linhas.length && /^\s*\/\//.test(linhas[i])) bloco.push(linhas[i++]);
  }
  if (!bloco.length) return "";
  const seguinte = linhas[i] || "";
  // Só é cabeçalho do arquivo se vier seguido de linha em branco ou de import (senão é comentário da 1ª declaração).
  if (!/^\s*$/.test(seguinte) && !/^\s*import\b/.test(seguinte)) return "";
  return limparComentario(bloco.join("\n"));
}

const modulos = new Map(); // caminho -> info
const usos = new Map(); // "caminho#nome" -> Set(caminhos que importam)
const importadoPor = new Map(); // caminho -> Set
const chamadasRpc = new Map(); // nome da função SQL -> Set(caminhos)
const tabelasUsadas = new Map(); // nome da tabela/view -> Set(caminhos)

function tipoDe(nome, arquivo, ehFuncao, ehServer) {
  if (!ehFuncao) return "constante";
  if (/^use[A-Z]/.test(nome)) return "hook";
  if (/^[A-Z]/.test(nome) && arquivo.endsWith(".tsx")) return "componente";
  if (ehServer) return "ação";
  return "função";
}

for (const arquivo of todosTs) {
  const texto = ler(arquivo);
  const fonte = ts.createSourceFile(arquivo, texto, ts.ScriptTarget.Latest, true, arquivo.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const ehServer = /^\s*["']use server["']/m.test(texto.split("\n").slice(0, 3).join("\n"));
  const ehClient = /^\s*["']use client["']/m.test(texto.split("\n").slice(0, 3).join("\n"));
  const simbolos = [];
  const linhaDe = (no) => fonte.getLineAndCharacterOfPosition(no.getStart(fonte)).line + 1;
  const exportado = (no) => !!(ts.getCombinedModifierFlags(no) & ts.ModifierFlags.Export);
  const padrao = (no) => !!(ts.getCombinedModifierFlags(no) & ts.ModifierFlags.Default);

  for (const st of fonte.statements) {
    if (ts.isImportDeclaration(st)) {
      const alvo = resolverImport(arquivo, st.moduleSpecifier.text);
      if (!alvo) continue;
      if (!importadoPor.has(alvo)) importadoPor.set(alvo, new Set());
      importadoPor.get(alvo).add(arquivo);
      const cl = st.importClause;
      const nomes = [];
      if (cl?.name) nomes.push("default");
      if (cl?.namedBindings && ts.isNamedImports(cl.namedBindings)) {
        for (const el of cl.namedBindings.elements) nomes.push((el.propertyName || el.name).text);
      }
      for (const n of nomes) {
        const chave = alvo + "#" + n;
        if (!usos.has(chave)) usos.set(chave, new Set());
        usos.get(chave).add(arquivo);
      }
      continue;
    }
    if (ts.isFunctionDeclaration(st) && st.name) {
      simbolos.push({ nome: st.name.text, tipo: tipoDe(st.name.text, arquivo, true, ehServer && exportado(st)), linha: linhaDe(st), exportado: exportado(st), padrao: padrao(st), desc: comentarioAcima(texto, st) });
    } else if (ts.isFunctionDeclaration(st) && padrao(st)) {
      simbolos.push({ nome: "default", tipo: "componente", linha: linhaDe(st), exportado: true, padrao: true, desc: comentarioAcima(texto, st) });
    } else if (ts.isVariableStatement(st)) {
      const desc = comentarioAcima(texto, st);
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name)) continue;
        const ini = d.initializer;
        const ehFuncao = !!ini && (ts.isArrowFunction(ini) || ts.isFunctionExpression(ini) || (ts.isCallExpression(ini) && /^(cache|memo|forwardRef)$/.test(ini.expression.getText(fonte)) && ini.arguments.some((a) => ts.isArrowFunction(a) || ts.isFunctionExpression(a))));
        if (!exportado(st) && !ehFuncao) continue;
        simbolos.push({ nome: d.name.text, tipo: tipoDe(d.name.text, arquivo, ehFuncao, ehServer && exportado(st)), linha: linhaDe(d), exportado: exportado(st), padrao: false, desc });
      }
    } else if (ts.isTypeAliasDeclaration(st) || ts.isInterfaceDeclaration(st) || ts.isEnumDeclaration(st)) {
      if (exportado(st)) simbolos.push({ nome: st.name.text, tipo: "tipo", linha: linhaDe(st), exportado: true, padrao: false, desc: comentarioAcima(texto, st) });
    } else if (ts.isClassDeclaration(st) && st.name) {
      simbolos.push({ nome: st.name.text, tipo: "classe", linha: linhaDe(st), exportado: exportado(st), padrao: padrao(st), desc: comentarioAcima(texto, st) });
    } else if (ts.isExportAssignment(st) && ts.isIdentifier(st.expression)) {
      const alvo = simbolos.find((s) => s.nome === st.expression.text);
      if (alvo) { alvo.exportado = true; alvo.padrao = true; }
    }
  }

  for (const m of texto.matchAll(/\.rpc\(\s*["'`](\w+)["'`]/g)) {
    if (!chamadasRpc.has(m[1])) chamadasRpc.set(m[1], new Set());
    chamadasRpc.get(m[1]).add(arquivo);
  }
  for (const m of texto.matchAll(/\.from\(\s*["'`](\w+)["'`]\s*\)/g)) {
    if (!tabelasUsadas.has(m[1])) tabelasUsadas.set(m[1], new Set());
    tabelasUsadas.get(m[1]).add(arquivo);
  }

  // Rota (tela ou API) a partir do caminho dentro de src/app.
  let rota = null;
  let metodos = [];
  const nomeArq = basename(arquivo);
  if (arquivo.startsWith("src/app/") && /^(page|route)\.tsx?$/.test(nomeArq)) {
    rota = "/" + dirname(arquivo).slice("src/app".length).split("/").filter((s) => s && !/^\(.*\)$/.test(s)).join("/");
    if (nomeArq.startsWith("route")) metodos = simbolos.filter((s) => s.exportado && /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(s.nome)).map((s) => s.nome);
  }

  modulos.set(arquivo, {
    caminho: arquivo,
    pasta: dirname(arquivo),
    cabecalho: cabecalhoDoArquivo(texto),
    linhas: texto.split("\n").length,
    server: ehServer,
    client: ehClient,
    rota,
    tipoRota: rota ? (nomeArq.startsWith("route") ? "api" : "tela") : null,
    metodos,
    simbolos,
    teste: /\.(test|spec)\.tsx?$/.test(arquivo) || arquivo.startsWith("e2e/"),
  });
}

// Usos por símbolo e descrição final de cada arquivo.
for (const m of modulos.values()) {
  for (const s of m.simbolos) {
    const chave = m.caminho + "#" + (s.padrao ? "default" : s.nome);
    const lista = new Set([...(usos.get(chave) || []), ...(s.padrao ? usos.get(m.caminho + "#" + s.nome) || [] : [])]);
    s.usadoEm = [...lista].sort();
  }
  m.importadoPor = [...(importadoPor.get(m.caminho) || [])].sort();
  const menu = m.rota ? MENU[m.rota] : null;
  m.menu = menu ? `${menu.grupo} > ${menu.nome}` : "";
  m.desc = m.cabecalho || (menu ? menu.descricao : "") || descricaoAutomatica(m);
  m.dominio = dominioDe(m.caminho);
}

function descricaoAutomatica(m) {
  const n = basename(m.caminho);
  if (m.teste) {
    const alvo = m.caminho.replace(/\.test\.tsx?$/, ".ts");
    return modulos.has(alvo) ? `Testes de ${alvo}.` : "Testes.";
  }
  if (m.tipoRota === "tela") return `Tela ${m.rota}.`;
  if (m.tipoRota === "api") return `API ${m.metodos.join("/")} ${m.rota}.`;
  if (n === "actions.ts") return `Ações de formulário (server actions) da tela /${m.pasta.split("/").filter((s) => !/^\(.*\)$/.test(s)).slice(2).join("/")}.`;
  if (n === "layout.tsx") return "Moldura comum das telas desta pasta.";
  if (n === "loading.tsx") return "Esqueleto mostrado enquanto a tela carrega.";
  const primeiro = m.simbolos.find((s) => s.exportado && s.desc);
  return primeiro ? primeiro.desc : "";
}

// ---------------------------------------------------------------------------
// Banco: varre as migrations em ordem; a última definição de cada objeto é a que vale.
// ---------------------------------------------------------------------------
const migrations = listar("supabase/migrations", (n) => n.endsWith(".sql"));
const banco = { funcao: new Map(), tabela: new Map(), view: new Map(), trigger: new Map(), policy: new Map() };

function semComentarios(sql) {
  return sql.replace(/--[^\n]*/g, (m) => " ".repeat(m.length)).replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}
function comentarioSqlAcima(linhasOrig, linha) {
  const bloco = [];
  let i = linha - 2;
  if (i >= 0 && /^\s*$/.test(linhasOrig[i])) i--; // aceita uma linha em branco entre o comentário e o create
  for (; i >= 0 && /^\s*--/.test(linhasOrig[i]); i--) bloco.unshift(linhasOrig[i]);
  // Tira linhas só de traços/iguais (separadores de seção).
  return limparComentario(bloco.filter((l) => !/^\s*--\s*[-=─*]*\s*$/.test(l)).join("\n"));
}
// Versão nova com comentário do tipo "Mesmo corpo de..., agora com X": mantém a descrição original e anexa a mudança.
function juntarDescricao(antiga, nova) {
  if (!nova) return antiga;
  if (!antiga || antiga === nova) return nova;
  if (/^(mesm|igual|agora|antes|como |a mesma|o mesmo|só muda|corrige|correção)/i.test(nova)) return `${antiga.split(" Última mudança: ")[0]} Última mudança: ${nova}`;
  return nova;
}
const semSchema = (n) => n.replace(/"/g, "").replace(/^public\./, "");

for (const arquivo of migrations) {
  const original = ler(arquivo);
  const sql = semComentarios(original);
  const linhasOrig = original.split("\n");
  const linhaDe = (i) => sql.slice(0, i).split("\n").length;
  const registrar = (tipo, chave, extra, i) => {
    const linha = linhaDe(i);
    const atual = banco[tipo].get(chave);
    banco[tipo].set(chave, {
      ...(atual || {}),
      ...extra,
      arquivo,
      linha,
      criadoEm: atual?.criadoEm || `${arquivo}:${linha}`,
      versoes: (atual?.versoes || 0) + 1,
      desc: juntarDescricao(atual?.desc || "", comentarioSqlAcima(linhasOrig, linha)),
      removido: false,
    });
  };
  const remover = (tipo, chave) => { const a = banco[tipo].get(chave); if (a) { a.removido = true; a.removidoEm = arquivo; } };

  for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+([\w."]+)\s*\(/gi)) registrar("funcao", semSchema(m[1]), { nome: semSchema(m[1]) }, m.index);
  for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?(materialized\s+)?view\s+(?:if\s+not\s+exists\s+)?([\w."]+)/gi)) registrar("view", semSchema(m[2]), { nome: semSchema(m[2]) }, m.index);
  for (const m of sql.matchAll(/create\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?([\w."]+)/gi)) registrar("tabela", semSchema(m[1]), { nome: semSchema(m[1]) }, m.index);
  for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?(?:constraint\s+)?trigger\s+(\w+)[\s\S]{0,300}?\bon\s+([\w."]+)[\s\S]{0,400}?execute\s+(?:function|procedure)\s+([\w."]+)/gi)) {
    registrar("trigger", `${m[1]} on ${semSchema(m[2])}`, { nome: m[1], tabela: semSchema(m[2]), executa: semSchema(m[3]) }, m.index);
  }
  for (const m of sql.matchAll(/create\s+policy\s+"?([\w ]+?)"?\s+on\s+([\w."]+)(?:\s+as\s+\w+)?(?:\s+for\s+(\w+))?/gi)) {
    registrar("policy", `${m[1]} on ${semSchema(m[2])}`, { nome: m[1], tabela: semSchema(m[2]), comando: (m[3] || "all").toLowerCase() }, m.index);
  }
  for (const m of sql.matchAll(/drop\s+function\s+(?:if\s+exists\s+)?([\w."]+)/gi)) {
    // Só conta como removida se não for recriada depois no mesmo arquivo.
    const nome = semSchema(m[1]);
    const recriada = new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+(?:public\\.)?${nome.replace(".", "\\.")}\\s*\\(`, "i").test(sql.slice(m.index));
    if (!recriada) remover("funcao", nome);
  }
  for (const m of sql.matchAll(/drop\s+(materialized\s+)?view\s+(?:if\s+exists\s+)?([\w."]+)/gi)) {
    const nome = semSchema(m[2]);
    if (!new RegExp(`create\\s+(?:or\\s+replace\\s+)?(?:materialized\\s+)?view\\s+(?:public\\.)?${nome.replace(".", "\\.")}\\b`, "i").test(sql.slice(m.index))) remover("view", nome);
  }
  for (const m of sql.matchAll(/drop\s+table\s+(?:if\s+exists\s+)?([\w."]+)/gi)) remover("tabela", semSchema(m[1]));
  for (const m of sql.matchAll(/drop\s+trigger\s+(?:if\s+exists\s+)?(\w+)\s+on\s+([\w."]+)/gi)) {
    const chave = `${m[1]} on ${semSchema(m[2])}`;
    const re = new RegExp(`create\\s+(?:or\\s+replace\\s+)?(?:constraint\\s+)?trigger\\s+${m[1]}\\b`, "i");
    if (!re.test(sql.slice(m.index + 5))) remover("trigger", chave);
  }
  for (const m of sql.matchAll(/drop\s+policy\s+(?:if\s+exists\s+)?"?([\w ]+?)"?\s+on\s+([\w."]+)/gi)) {
    const chave = `${m[1]} on ${semSchema(m[2])}`;
    const re = new RegExp(`create\\s+policy\\s+"?${m[1]}"?\\s+on\\s+(?:public\\.)?${semSchema(m[2]).replace(".", "\\.")}\\b`, "i");
    if (!re.test(sql.slice(m.index + 5))) remover("policy", chave);
  }
}

const vivos = (tipo) => [...banco[tipo].values()].filter((o) => !o.removido).sort((a, b) => a.nome.localeCompare(b.nome));
const funcoesSql = vivos("funcao").map((f) => ({ ...f, chamadaPor: [...(chamadasRpc.get(f.nome.replace(/^public\./, "")) || [])].sort(), dominio: dominioDe(f.nome) }));
const tabelasSql = vivos("tabela").map((t) => ({ ...t, usadaPor: [...(tabelasUsadas.get(t.nome) || [])].sort(), dominio: dominioDe(t.nome) }));
const viewsSql = vivos("view").map((t) => ({ ...t, usadaPor: [...(tabelasUsadas.get(t.nome) || [])].sort(), dominio: dominioDe(t.nome) }));
const triggersSql = vivos("trigger");
const policiesSql = vivos("policy");

// ---------------------------------------------------------------------------
// Outros: testes do banco, workflows, scripts, docs.
// ---------------------------------------------------------------------------
const primeiraLinhaComentario = (p) => {
  const linhas = ler(p).split("\n").slice(0, 8);
  const l = linhas.find((x) => /^\s*(--|#(?!!)|\/\/)\s*\S/.test(x) && !/^\s*#\s*(See|!)/.test(x));
  return l ? resumir(l.replace(/^\s*(--|#|\/\/)\s*/, ""), 200) : "";
};
const testesBanco = listar("supabase/tests", (n) => n.endsWith(".sql")).map((p) => ({ caminho: p, desc: primeiraLinhaComentario(p) }));
const workflows = listar(".github/workflows", (n) => /\.ya?ml$/.test(n)).map((p) => {
  const texto = ler(p);
  const nome = (texto.match(/^name:\s*(.+)$/m) || [])[1] || basename(p);
  const quando = [];
  if (/\bpull_request\b/.test(texto)) quando.push("PR");
  if (/\bpush:/.test(texto)) quando.push("push");
  if (/\bschedule:/.test(texto)) quando.push("agendado");
  if (/\bworkflow_dispatch\b/.test(texto)) quando.push("manual");
  if (/\bworkflow_run\b/.test(texto)) quando.push("depois de outro workflow");
  return { caminho: p, nome: nome.replace(/["']/g, ""), quando: quando.join(", "), desc: primeiraLinhaComentario(p) };
});
const scripts = listar("scripts", (n) => /\.(mjs|js|ts|sh)$/.test(n)).map((p) => ({ caminho: p, desc: primeiraLinhaComentario(p) }));
const npmScripts = JSON.parse(ler("package.json")).scripts;
const docs = listar("docs", (n) => /\.(md|html)$/.test(n)).filter((p) => !p.startsWith(PASTA_SAIDA + "/")).map((p) => {
  const texto = ler(p);
  const titulo = (texto.match(/^#\s+(.+)$/m) || texto.match(/<title>([^<]+)<\/title>/) || [])[1] || basename(p);
  return { caminho: p, desc: titulo.trim() };
});

// ---------------------------------------------------------------------------
// Pastas (árvore) com contagem de arquivos.
// ---------------------------------------------------------------------------
const todosArquivos = [...listar("src"), ...listar("supabase"), ...listar("e2e"), ...listar("scripts"), ...listar("docs"), ...listar(".github/workflows"), ...listar("public"), ...listar("plans")].filter((p) => !p.startsWith(PASTA_SAIDA + "/"));
const contagemPasta = new Map();
for (const p of todosArquivos) {
  let d = dirname(p);
  while (d && d !== ".") { contagemPasta.set(d, (contagemPasta.get(d) || 0) + 1); d = dirname(d); }
}
const pastas = [...contagemPasta.keys()].sort().map((p) => {
  let desc = PASTAS[p];
  if (!desc && p.startsWith("src/app/")) {
    const url = "/" + p.slice("src/app/".length).split("/").filter((s) => !/^\(.*\)$/.test(s)).join("/");
    const menu = MENU[url];
    desc = menu ? `Tela ${url} (${menu.grupo} > ${menu.nome}).` : (p.includes("/api/") ? `API ${url}.` : `Endereço ${url}.`);
  }
  return { caminho: p, arquivos: contagemPasta.get(p), desc: desc || "" };
});

// ---------------------------------------------------------------------------
// Índice único (tudo que tem nome) para busca.
// ---------------------------------------------------------------------------
const indice = [];
for (const m of modulos.values()) {
  for (const s of m.simbolos) {
    if (m.teste && !s.exportado) continue;
    indice.push({ nome: s.nome === "default" ? `${basename(m.caminho)} (padrão)` : s.nome, tipo: s.tipo, onde: m.caminho, linha: s.linha, dominio: m.dominio, desc: resumir(s.desc || ""), exportado: s.exportado, usos: s.usadoEm, rota: m.rota || "" });
  }
}
for (const f of funcoesSql) indice.push({ nome: f.nome, tipo: "função SQL", onde: f.arquivo, linha: f.linha, dominio: f.dominio, desc: resumir(f.desc), exportado: true, usos: f.chamadaPor, rota: "", versoes: f.versoes, criadoEm: f.criadoEm });
for (const t of tabelasSql) indice.push({ nome: t.nome, tipo: "tabela", onde: t.arquivo, linha: t.linha, dominio: t.dominio, desc: resumir(t.desc), exportado: true, usos: t.usadaPor, rota: "" });
for (const t of viewsSql) indice.push({ nome: t.nome, tipo: "view", onde: t.arquivo, linha: t.linha, dominio: t.dominio, desc: resumir(t.desc), exportado: true, usos: t.usadaPor, rota: "", versoes: t.versoes, criadoEm: t.criadoEm });
for (const t of triggersSql) indice.push({ nome: t.nome, tipo: "trigger", onde: t.arquivo, linha: t.linha, dominio: dominioDe(t.tabela), desc: resumir(`Na tabela ${t.tabela}; executa ${t.executa}. ${t.desc}`), exportado: true, usos: [], rota: "" });
indice.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }) || a.onde.localeCompare(b.onde));

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------
const linkMd = (p, linha) => `[${p}${linha ? ":" + linha : ""}](${"../../" + p.split("/").map(encodeURIComponent).join("/")}${linha ? "#L" + linha : ""})`;
const cod = (p, linha) => "`" + p + (linha ? ":" + linha : "") + "`";
const esc = (t) => String(t ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const listaCurta = (arr, max = 4) => (arr.length ? arr.slice(0, max).map((p) => "`" + p + "`").join(", ") + (arr.length > max ? ` e mais ${arr.length - max}` : "") : "—");

const telas = [...modulos.values()].filter((m) => m.tipoRota === "tela").sort((a, b) => a.rota.localeCompare(b.rota));
const apis = [...modulos.values()].filter((m) => m.tipoRota === "api").sort((a, b) => a.rota.localeCompare(b.rota));
const acoesDaPasta = (pasta) => [...modulos.values()].filter((m) => m.pasta === pasta && m.server && !m.teste);

const paginas = { "README.md": [], "codigo-por-dominio.md": [], "banco.md": [], "testes-e-scripts.md": [], "indice.md": [] };
let md = paginas["README.md"];
const cabecalhoPagina = (titulo) => {
  md.push(`# ${titulo}`);
  md.push("");
  md.push("> Parte do [mapa do código](README.md). Gerado por `scripts/mapa-codigo.mjs`; não edite à mão, rode `npm run mapa`.");
  md.push("");
};
md.push("# Mapa do código do Balbina");
md.push("");
md.push("> Gerado automaticamente por `scripts/mapa-codigo.mjs`. **Não edite à mão**: depois de mudar o código, rode `npm run mapa` e a pasta `docs/mapa-codigo/` é refeita. Em conflito de merge nesses arquivos, rode `npm run mapa` de novo e aceite o resultado.");
md.push("");
md.push(`Resumo: ${arquivosTs.length} arquivos TypeScript em \`src/\`, ${telas.length} telas, ${apis.length} rotas de API, ${indice.filter((i) => !/SQL|tabela|view|trigger/.test(i.tipo)).length} funções/componentes/tipos, ${funcoesSql.length} funções do banco, ${tabelasSql.length} tabelas, ${viewsSql.length} views, ${triggersSql.length} triggers, ${policiesSql.length} policies, ${migrations.length} migrations.`);
md.push("");
md.push("**Versão com busca (recomendada):** abra [mapa.html](mapa.html) no navegador (duplo clique no arquivo `docs/mapa-codigo/mapa.html`). Nas páginas Markdown, use Ctrl+F.");
md.push("");
md.push("## Sumário");
md.push("");
md.push("- [Como usar (achar e renomear)](#como-usar-achar-e-renomear)");
md.push("- [Pastas](#pastas)");
md.push("- [Telas (menu → arquivo)](#telas-menu--arquivo)");
md.push("- [Rotas de API](#rotas-de-api)");
md.push("- [Código por domínio](codigo-por-dominio.md): cada arquivo, o que faz e as funções/componentes que define, por área do sistema");
md.push("- [Banco de dados](banco.md): funções, tabelas, views, triggers, policies e migrations");
md.push("- [Testes, workflows, scripts e docs](testes-e-scripts.md)");
md.push("- [Índice alfabético](indice.md): todo nome exportado → `arquivo:linha`");
md.push("");
md.push("## Como usar (achar e renomear)");
md.push("");
md.push("- **Achar uma função ou componente:** procure o nome no [índice alfabético](indice.md) (ou na busca do HTML). A coluna *Onde* diz `arquivo:linha`; no VS Code, Ctrl+P e cole o caminho, ou Ctrl+clique no caminho dentro do terminal.");
md.push("- **Achar a tela de um item do menu:** veja [Telas](#telas-menu--arquivo). A tela é o `page.tsx`; o que os botões e formulários gravam fica no `actions.ts` da mesma pasta.");
md.push("- **Renomear uma função/componente em TypeScript:** no VS Code, clique no nome e aperte **F2** (Renomear símbolo): ele troca na definição e em todos os arquivos que importam. A coluna *Usado em* mostra quais arquivos vão mudar. Depois rode `npm run typecheck`, `npm test` e `npm run mapa`.");
md.push("- **Renomear uma função do banco (SQL):** nunca edite uma migration antiga. Crie uma migration nova em `supabase/migrations/` com `alter function antigo rename to novo;` (ou recrie com o novo nome), e troque o nome nos arquivos listados em *Chamada por* (`supabase.rpc(\"nome\")`) e em `supabase/tests/`. Rode `npm run test:db`.");
md.push("- **Renomear uma tabela:** igual ao SQL acima (`alter table ... rename to ...`), mais os arquivos em *Usada por* (`.from(\"tabela\")`), as views que a usam e os testes do banco.");
md.push("- **Tipos:** *ação* = server action (roda no servidor, chamada por formulário); *componente* = pedaço de tela React; *função* = regra ou utilitário; *hook* = função React `use...`; *tipo* = tipo do TypeScript; *constante* = valor fixo exportado. Itens *internos* (não exportados) só são usados dentro do próprio arquivo.");
md.push("");
md.push("## Pastas");
md.push("");
md.push("| Pasta | Arquivos | O que tem |");
md.push("|---|---:|---|");
for (const p of pastas) md.push(`| \`${p.caminho}\` | ${p.arquivos} | ${esc(p.desc)} |`);
md.push("");
md.push("## Telas (menu → arquivo)");
md.push("");
md.push("| Endereço | Menu | Tela (page.tsx) | Ações do servidor |");
md.push("|---|---|---|---|");
for (const t of telas) {
  const acoes = acoesDaPasta(t.pasta);
  md.push(`| \`${t.rota}\` | ${esc(t.menu || "")} | ${linkMd(t.caminho)} | ${acoes.map((a) => linkMd(a.caminho)).join(", ") || "—"} |`);
}
md.push("");
md.push("## Rotas de API");
md.push("");
md.push("| Métodos | Endereço | Arquivo | O que faz |");
md.push("|---|---|---|---|");
for (const a of apis) md.push(`| ${a.metodos.join(", ")} | \`${a.rota}\` | ${linkMd(a.caminho)} | ${esc(resumir(a.cabecalho || ""))} |`);
md.push("");
md = paginas["codigo-por-dominio.md"];
cabecalhoPagina("Código por domínio");
md.push("Cada arquivo com o que ele faz e os nomes que ele define (`nome` *tipo* linha). Testes ficam na seção de testes.");
md.push("");
for (const d of DOMINIOS) {
  const arquivos = [...modulos.values()].filter((m) => m.dominio === d.id && !m.teste && !m.caminho.startsWith("e2e/")).sort((a, b) => a.caminho.localeCompare(b.caminho));
  if (!arquivos.length) continue;
  md.push(`## ${d.nome}`);
  md.push("");
  for (const m of arquivos) {
    const extras = [m.server ? "servidor" : "", m.client ? "navegador" : "", m.rota ? `rota \`${m.rota}\`` : ""].filter(Boolean).join(", ");
    md.push(`- **${linkMd(m.caminho)}**${extras ? ` (${extras})` : ""}${m.desc ? ` — ${esc(resumir(m.desc))}` : ""}`);
    const exp = m.simbolos.filter((s) => s.exportado);
    const internas = m.simbolos.filter((s) => !s.exportado);
    if (exp.length) md.push(`  - ${exp.map((s) => `\`${s.nome}\` *${s.tipo}* L${s.linha}${s.usadoEm.length ? ` (usado em ${s.usadoEm.length})` : ""}`).join(" · ")}`);
    if (internas.length) md.push(`  - internas: ${internas.map((s) => `\`${s.nome}\` L${s.linha}`).join(" · ")}`);
  }
  md.push("");
}
md = paginas["banco.md"];
cabecalhoPagina("Banco de dados");
md.push("As migrations rodam em ordem de nome. Aqui aparece a **última** migration que (re)definiu cada objeto, que é a versão em vigor. Objetos apagados por migration posterior não aparecem.");
md.push("");
md.push("## Funções do banco");
md.push("");
md.push("| Função | Versão atual | Criada em | Chamada pelo app (rpc) | O que faz |");
md.push("|---|---|---|---|---|");
for (const f of funcoesSql) md.push(`| \`${f.nome}\` | ${cod(f.arquivo, f.linha)} | ${f.versoes > 1 ? `\`${f.criadoEm}\` (${f.versoes} versões)` : "—"} | ${listaCurta(f.chamadaPor)} | ${esc(resumir(f.desc, 160))} |`);
md.push("");
md.push("## Tabelas");
md.push("");
md.push("| Tabela | Criada em | Usada pelo app (.from) | O que guarda |");
md.push("|---|---|---|---|");
for (const t of tabelasSql) md.push(`| \`${t.nome}\` | ${cod(t.arquivo, t.linha)} | ${listaCurta(t.usadaPor)} | ${esc(resumir(t.desc, 160))} |`);
md.push("");
md.push("## Views");
md.push("");
md.push("| View | Versão atual | Usada pelo app (.from) | O que mostra |");
md.push("|---|---|---|---|");
for (const t of viewsSql) md.push(`| \`${t.nome}\` | ${cod(t.arquivo, t.linha)} | ${listaCurta(t.usadaPor)} | ${esc(resumir(t.desc, 160))} |`);
md.push("");
md.push("## Triggers");
md.push("");
md.push("| Trigger | Tabela | Executa | Definida em |");
md.push("|---|---|---|---|");
for (const t of triggersSql) md.push(`| \`${t.nome}\` | \`${t.tabela}\` | \`${t.executa}\` | ${cod(t.arquivo, t.linha)} |`);
md.push("");
md.push("## Policies (RLS) por tabela");
md.push("");
const porTabela = new Map();
for (const p of policiesSql) { if (!porTabela.has(p.tabela)) porTabela.set(p.tabela, []); porTabela.get(p.tabela).push(p); }
md.push("| Tabela | Policies (comando, onde) |");
md.push("|---|---|");
for (const [tab, ps] of [...porTabela].sort((a, b) => a[0].localeCompare(b[0]))) md.push(`| \`${tab}\` | ${ps.map((p) => `\`${p.nome}\` (${p.comando}, ${cod(p.arquivo, p.linha)})`).join("; ")} |`);
md.push("");
md.push("## Migrations");
md.push("");
for (const m of migrations) md.push(`- ${linkMd(m)}${primeiraLinhaComentario(m) ? " — " + esc(primeiraLinhaComentario(m)) : ""}`);
md.push("");
md = paginas["testes-e-scripts.md"];
cabecalhoPagina("Testes, workflows, scripts e docs");
md.push("## Testes do banco (`npm run test:db`)");
md.push("");
for (const t of testesBanco) md.push(`- ${linkMd(t.caminho)}${t.desc ? " — " + esc(t.desc) : ""}`);
md.push("");
md.push("## Testes de unidade (`npm test`)");
md.push("");
for (const m of [...modulos.values()].filter((x) => x.teste && x.caminho.startsWith("src/")).sort((a, b) => a.caminho.localeCompare(b.caminho))) md.push(`- ${linkMd(m.caminho)} — ${esc(m.desc)}`);
md.push("");
md.push("## Testes E2E (`npm run test:e2e`)");
md.push("");
for (const m of [...modulos.values()].filter((x) => x.caminho.startsWith("e2e/")).sort((a, b) => a.caminho.localeCompare(b.caminho))) md.push(`- ${linkMd(m.caminho)}${m.desc ? " — " + esc(resumir(m.desc)) : ""}`);
md.push("");
md.push("## Workflows do GitHub Actions");
md.push("");
md.push("| Workflow | Arquivo | Quando roda | Nota |");
md.push("|---|---|---|---|");
for (const w of workflows) md.push(`| ${esc(w.nome)} | ${linkMd(w.caminho)} | ${w.quando || "—"} | ${esc(w.desc)} |`);
md.push("");
md.push("## Comandos (`npm run ...`)");
md.push("");
md.push("| Comando | Executa |");
md.push("|---|---|");
for (const [k, v] of Object.entries(npmScripts)) md.push(`| \`npm run ${k}\` | \`${esc(v)}\` |`);
md.push("");
md.push("## Scripts");
md.push("");
for (const s of scripts) md.push(`- ${linkMd(s.caminho)}${s.desc ? " — " + esc(s.desc) : ""}`);
md.push("");
md.push("## Documentação");
md.push("");
for (const d of docs) md.push(`- ${linkMd(d.caminho)} — ${esc(d.desc)}`);
md.push("");
md = paginas["indice.md"];
cabecalhoPagina("Índice alfabético");
md.push("Só os nomes exportados (usáveis por outros arquivos). Os internos aparecem em [Código por domínio](codigo-por-dominio.md) e na busca do mapa.html.");
md.push("");
md.push("| Nome | Tipo | Onde | Domínio | Usado em |");
md.push("|---|---|---|---|---|");
for (const i of indice.filter((x) => x.exportado)) md.push(`| \`${esc(i.nome)}\` | ${i.tipo}${i.exportado ? "" : " (interna)"} | ${cod(i.onde, i.linha)} | ${nomeDominio[i.dominio].split(" (")[0]} | ${i.usos.length ? i.usos.length + " arquivo" + (i.usos.length > 1 ? "s" : "") : "—"} |`);
md.push("");


// ---------------------------------------------------------------------------
// HTML (um arquivo só, sem dependências; os dados vão embutidos como JSON)
// ---------------------------------------------------------------------------
const dados = {
  github: GITHUB,
  dominios: DOMINIOS.map((d) => ({ id: d.id, nome: d.nome })),
  pastas,
  telas: telas.map((t) => ({ rota: t.rota, menu: t.menu, caminho: t.caminho, desc: resumir(t.desc), acoes: acoesDaPasta(t.pasta).map((a) => a.caminho) })),
  apis: apis.map((a) => ({ rota: a.rota, metodos: a.metodos, caminho: a.caminho, desc: resumir(a.cabecalho || "") })),
  arquivos: [...modulos.values()].filter((m) => !m.teste).sort((a, b) => a.caminho.localeCompare(b.caminho)).map((m) => ({
    caminho: m.caminho, dominio: m.dominio, desc: resumir(m.desc), rota: m.rota || "", server: m.server, client: m.client, importadoPor: m.importadoPor,
    simbolos: m.simbolos.map((s) => ({ nome: s.nome, tipo: s.tipo, linha: s.linha, exportado: s.exportado, usos: s.usadoEm, desc: resumir(s.desc || "") })),
  })),
  indice,
  banco: {
    funcoes: funcoesSql.map((f) => ({ nome: f.nome, caminho: f.arquivo, linha: f.linha, criadoEm: f.criadoEm, versoes: f.versoes, usos: f.chamadaPor, desc: resumir(f.desc), dominio: f.dominio })),
    tabelas: tabelasSql.map((t) => ({ nome: t.nome, caminho: t.arquivo, linha: t.linha, usos: t.usadaPor, desc: resumir(t.desc), dominio: t.dominio, policies: (porTabela.get(t.nome) || []).map((p) => `${p.nome} (${p.comando})`), triggers: triggersSql.filter((g) => g.tabela === t.nome).map((g) => `${g.nome} → ${g.executa}`) })),
    views: viewsSql.map((t) => ({ nome: t.nome, caminho: t.arquivo, linha: t.linha, usos: t.usadaPor, desc: resumir(t.desc), dominio: t.dominio })),
    triggers: triggersSql.map((t) => ({ nome: t.nome, tabela: t.tabela, executa: t.executa, caminho: t.arquivo, linha: t.linha })),
    migrations,
  },
  testes: {
    banco: testesBanco,
    unidade: [...modulos.values()].filter((x) => x.teste && x.caminho.startsWith("src/")).map((m) => ({ caminho: m.caminho, desc: m.desc })),
    e2e: [...modulos.values()].filter((x) => x.caminho.startsWith("e2e/")).map((m) => ({ caminho: m.caminho, desc: resumir(m.desc) })),
  },
  workflows,
  npmScripts,
  scripts,
  docs,
};

const textoHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mapa do código do Balbina</title>
<!-- Gerado por scripts/mapa-codigo.mjs (npm run mapa). Não edite à mão. -->
<style>
:root { --papel:#fbf8f2; --papel-2:#f3eee3; --tinta:#24211b; --tinta-2:#5d574b; --linha:#e2dacb; --gema:#c77a06; --gema-forte:#9a5c00; --gema-fundo:#fcefd6; --verde:#2f7d4f; --azul:#2c5d9a; --mono: ui-monospace, "JetBrains Mono", Menlo, Consolas, monospace; }
@media (prefers-color-scheme: dark) { :root { --papel:#1b1915; --papel-2:#25221c; --tinta:#f1ebdf; --tinta-2:#b8ae9c; --linha:#3a352c; --gema:#f0a531; --gema-forte:#ffc266; --gema-fundo:#3a2a10; --verde:#6cc191; --azul:#86b2ea; } }
* { box-sizing: border-box; }
body { margin:0; font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background:var(--papel); color:var(--tinta); }
header { position: sticky; top:0; z-index:5; background:var(--papel); border-bottom:1px solid var(--linha); padding:12px 20px; }
h1 { font-size:20px; margin:0 0 8px; } h1 span { color:var(--gema-forte); }
.busca { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
#q { flex:1; min-width:220px; font-size:16px; padding:10px 12px; border:2px solid var(--linha); border-radius:10px; background:var(--papel-2); color:var(--tinta); }
#q:focus { outline:none; border-color:var(--gema); }
select { padding:9px; border-radius:10px; border:1px solid var(--linha); background:var(--papel-2); color:var(--tinta); }
nav.abas { display:flex; gap:6px; flex-wrap:wrap; margin-top:10px; }
nav.abas button { border:1px solid var(--linha); background:var(--papel-2); color:var(--tinta); padding:6px 12px; border-radius:999px; cursor:pointer; font-size:14px; }
nav.abas button.ativo { background:var(--gema); border-color:var(--gema); color:#fff; }
main { padding:16px 20px 60px; max-width:1400px; margin:0 auto; }
.contagem { color:var(--tinta-2); font-size:13px; margin:4px 0 12px; }
table { width:100%; border-collapse:collapse; font-size:14px; }
th, td { text-align:left; vertical-align:top; padding:7px 8px; border-bottom:1px solid var(--linha); }
th { position: sticky; top:0; background:var(--papel-2); font-weight:600; }
code, .cam { font-family:var(--mono); font-size:13px; }
.nome { font-family:var(--mono); font-weight:600; word-break:break-all; }
a { color:var(--azul); } a.cam { text-decoration:none; word-break:break-all; } a.cam:hover { text-decoration:underline; }
.tipo { display:inline-block; font-size:12px; padding:1px 8px; border-radius:999px; background:var(--gema-fundo); color:var(--gema-forte); white-space:nowrap; }
.tipo.interna { background:transparent; border:1px dashed var(--linha); color:var(--tinta-2); }
.desc { color:var(--tinta-2); }
details summary { cursor:pointer; color:var(--azul); font-size:13px; }
details ul { margin:4px 0 0; padding-left:18px; }
.cartao { border:1px solid var(--linha); border-radius:12px; padding:10px 14px; margin-bottom:10px; background:var(--papel-2); }
.cartao h3 { margin:0 0 4px; font-size:15px; }
.dom h2 { font-size:17px; margin:22px 0 8px; color:var(--gema-forte); }
.simb { margin:6px 0 0; display:flex; flex-wrap:wrap; gap:4px 12px; font-size:13px; }
.copiar { border:none; background:none; cursor:pointer; color:var(--tinta-2); font-size:12px; padding:0 4px; }
.ajuda { background:var(--gema-fundo); border-radius:12px; padding:10px 14px; margin-bottom:14px; font-size:14px; }
.ajuda li { margin:2px 0; }
@media (max-width: 700px) { .so-largo { display:none; } th, td { padding:6px 4px; } }
</style>
</head>
<body>
<header>
  <h1>Mapa do código do <span>Balbina</span></h1>
  <div class="busca">
    <input id="q" type="search" placeholder="Procure uma função, tela, tabela, arquivo... (ex.: formatarMoeda, contas-a-pagar, lotes)" autofocus>
    <select id="dom"><option value="">Todos os domínios</option></select>
    <select id="tipo"><option value="">Todos os tipos</option></select>
  </div>
  <nav class="abas" id="abas"></nav>
</header>
<main id="conteudo"></main>
<script id="dados" type="application/json">${JSON.stringify(dados).replace(/</g, "\\u003c")}</script>
<script>
const D = JSON.parse(document.getElementById("dados").textContent);
const $ = (s) => document.querySelector(s);
const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));
const nomeDom = Object.fromEntries(D.dominios.map((d) => [d.id, d.nome]));
const url = (p, l) => D.github + p.split("/").map(encodeURIComponent).join("/") + (l ? "#L" + l : "");
const cam = (p, l) => '<a class="cam" target="_blank" rel="noopener" href="' + url(p, l) + '">' + esc(p + (l ? ":" + l : "")) + '</a><button class="copiar" title="Copiar caminho" data-copiar="' + esc(p + (l ? ":" + l : "")) + '">⧉</button>';
const usos = (arr, rotulo) => !arr || !arr.length ? '<span class="desc">—</span>' : '<details><summary>' + arr.length + ' ' + (arr.length === 1 ? rotulo.replace(/^arquivos/, "arquivo").replace(/ importam /, " importa ") : rotulo) + '</summary><ul>' + arr.map((p) => '<li>' + cam(p) + '</li>').join("") + '</ul></details>';
const norm = (t) => String(t ?? "").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase();
const ABAS = [["indice","Índice (tudo)"],["telas","Telas"],["dominios","Por domínio"],["banco","Banco"],["api","API"],["pastas","Pastas"],["outros","Testes e scripts"],["ajuda","Como usar"]];
let aba = location.hash.slice(1) || "indice";
for (const d of D.dominios) $("#dom").insertAdjacentHTML("beforeend", '<option value="' + d.id + '">' + esc(d.nome) + '</option>');
for (const t of [...new Set(D.indice.map((i) => i.tipo))].sort()) $("#tipo").insertAdjacentHTML("beforeend", '<option>' + esc(t) + '</option>');
function desenharAbas() { $("#abas").innerHTML = ABAS.map(([id, n]) => '<button data-aba="' + id + '" class="' + (id === aba ? "ativo" : "") + '">' + n + '</button>').join(""); }
function casa(item, campos) {
  const q = norm($("#q").value.trim());
  const dom = $("#dom").value;
  if (dom && item.dominio && item.dominio !== dom) return false;
  if (!q) return true;
  const alvo = norm(campos.map((c) => item[c]).join(" "));
  return q.split(/\\s+/).every((p) => alvo.includes(p));
}
const LIMITE = 600;
function render() {
  desenharAbas();
  const c = $("#conteudo");
  const tipo = $("#tipo").value;
  if (aba === "indice") {
    const itens = D.indice.filter((i) => (!tipo || i.tipo === tipo) && casa(i, ["nome","onde","desc","tipo","rota"]));
    c.innerHTML = '<div class="contagem">' + itens.length + ' de ' + D.indice.length + ' nomes' + (itens.length > LIMITE ? ' (mostrando os primeiros ' + LIMITE + '; refine a busca)' : '') + '</div>' +
      '<table><thead><tr><th>Nome</th><th>Tipo</th><th>Onde (arquivo:linha)</th><th class="so-largo">Domínio</th><th>Usado em</th></tr></thead><tbody>' +
      itens.slice(0, LIMITE).map((i) => '<tr><td><div class="nome">' + esc(i.nome) + '</div>' + (i.desc ? '<div class="desc">' + esc(i.desc) + '</div>' : '') + '</td><td><span class="tipo' + (i.exportado ? '' : ' interna') + '">' + esc(i.tipo) + (i.exportado ? '' : ' interna') + '</span></td><td>' + cam(i.onde, i.linha) + (i.versoes > 1 ? '<div class="desc">' + i.versoes + ' versões; criada em ' + esc(i.criadoEm) + '</div>' : '') + '</td><td class="so-largo desc">' + esc(nomeDom[i.dominio].split(" (")[0]) + '</td><td>' + usos(i.usos, "arquivos") + '</td></tr>').join("") + '</tbody></table>';
  } else if (aba === "telas") {
    const itens = D.telas.filter((t) => casa(t, ["rota","menu","caminho","desc"]));
    c.innerHTML = '<div class="contagem">' + itens.length + ' telas. A tela é o page.tsx; o que ela grava fica nas ações do servidor (actions.ts).</div><table><thead><tr><th>Endereço</th><th>Menu</th><th>Tela</th><th>Ações do servidor</th></tr></thead><tbody>' +
      itens.map((t) => '<tr><td><code>' + esc(t.rota) + '</code><div class="desc">' + esc(t.desc) + '</div></td><td>' + esc(t.menu) + '</td><td>' + cam(t.caminho) + '</td><td>' + (t.acoes.map((a) => cam(a)).join("<br>") || "—") + '</td></tr>').join("") + '</tbody></table>';
  } else if (aba === "dominios") {
    let h = "";
    for (const d of D.dominios) {
      const arqs = D.arquivos.filter((a) => a.dominio === d.id && !a.caminho.startsWith("e2e/") && casa({ ...a, nomes: a.simbolos.map((s) => s.nome).join(" ") }, ["caminho","desc","rota","nomes"]));
      if (!arqs.length) continue;
      h += '<section class="dom"><h2>' + esc(d.nome) + ' <small class="desc">(' + arqs.length + ' arquivos)</small></h2>' + arqs.map((a) =>
        '<div class="cartao"><h3>' + cam(a.caminho) + (a.rota ? ' <code>' + esc(a.rota) + '</code>' : '') + (a.server ? ' <span class="tipo">servidor</span>' : '') + (a.client ? ' <span class="tipo">navegador</span>' : '') + '</h3>' + (a.desc ? '<div class="desc">' + esc(a.desc) + '</div>' : '') +
        '<div class="simb">' + a.simbolos.map((s) => '<span title="' + esc(s.desc) + '"><a class="cam" target="_blank" rel="noopener" href="' + url(a.caminho, s.linha) + '"><b>' + esc(s.nome) + '</b></a> <span class="tipo' + (s.exportado ? '' : ' interna') + '">' + esc(s.tipo) + '</span>' + (s.usos.length ? ' <small class="desc">×' + s.usos.length + '</small>' : '') + '</span>').join("") + '</div>' +
        (a.importadoPor.length ? '<div style="margin-top:6px">' + usos(a.importadoPor, "arquivos importam este") + '</div>' : '') + '</div>').join("") + '</section>';
    }
    c.innerHTML = h || '<p>Nada encontrado.</p>';
  } else if (aba === "banco") {
    const f = D.banco.funcoes.filter((x) => casa(x, ["nome","desc","caminho"]));
    const t = D.banco.tabelas.filter((x) => casa(x, ["nome","desc","caminho"]));
    const v = D.banco.views.filter((x) => casa(x, ["nome","desc","caminho"]));
    const g = D.banco.triggers.filter((x) => casa(x, ["nome","tabela","executa","caminho"]));
    c.innerHTML = '<div class="ajuda">Mostra a <b>última</b> migration que definiu cada objeto (a versão em vigor). Para mudar, crie uma migration nova; nunca edite uma antiga.</div>' +
      '<h2>Funções (' + f.length + ')</h2><table><thead><tr><th>Função</th><th>Versão atual</th><th>Chamada pelo app (rpc)</th></tr></thead><tbody>' +
      f.map((x) => '<tr><td><div class="nome">' + esc(x.nome) + '</div><div class="desc">' + esc(x.desc) + '</div></td><td>' + cam(x.caminho, x.linha) + (x.versoes > 1 ? '<div class="desc">' + x.versoes + ' versões; criada em ' + esc(x.criadoEm) + '</div>' : '') + '</td><td>' + usos(x.usos, "arquivos") + '</td></tr>').join("") + '</tbody></table>' +
      '<h2>Tabelas (' + t.length + ')</h2><table><thead><tr><th>Tabela</th><th>Criada em</th><th>Usada pelo app</th><th class="so-largo">Policies e triggers</th></tr></thead><tbody>' +
      t.map((x) => '<tr><td><div class="nome">' + esc(x.nome) + '</div><div class="desc">' + esc(x.desc) + '</div></td><td>' + cam(x.caminho, x.linha) + '</td><td>' + usos(x.usos, "arquivos") + '</td><td class="so-largo desc"><small>' + esc(x.policies.join(", ")) + (x.triggers.length ? '<br>⚙ ' + esc(x.triggers.join(", ")) : '') + '</small></td></tr>').join("") + '</tbody></table>' +
      '<h2>Views (' + v.length + ')</h2><table><thead><tr><th>View</th><th>Versão atual</th><th>Usada pelo app</th></tr></thead><tbody>' +
      v.map((x) => '<tr><td><div class="nome">' + esc(x.nome) + '</div><div class="desc">' + esc(x.desc) + '</div></td><td>' + cam(x.caminho, x.linha) + '</td><td>' + usos(x.usos, "arquivos") + '</td></tr>').join("") + '</tbody></table>' +
      '<h2>Triggers (' + g.length + ')</h2><table><thead><tr><th>Trigger</th><th>Tabela</th><th>Executa</th><th>Onde</th></tr></thead><tbody>' +
      g.map((x) => '<tr><td class="nome">' + esc(x.nome) + '</td><td><code>' + esc(x.tabela) + '</code></td><td><code>' + esc(x.executa) + '</code></td><td>' + cam(x.caminho, x.linha) + '</td></tr>').join("") + '</tbody></table>' +
      '<h2>Migrations (' + D.banco.migrations.length + ')</h2><ul>' + D.banco.migrations.filter((m) => casa({ m }, ["m"])).map((m) => '<li>' + cam(m) + '</li>').join("") + '</ul>';
  } else if (aba === "api") {
    const itens = D.apis.filter((a) => casa(a, ["rota","caminho","desc","metodos"]));
    c.innerHTML = '<table><thead><tr><th>Métodos</th><th>Endereço</th><th>Arquivo</th><th>O que faz</th></tr></thead><tbody>' + itens.map((a) => '<tr><td><code>' + esc(a.metodos.join(", ")) + '</code></td><td><code>' + esc(a.rota) + '</code></td><td>' + cam(a.caminho) + '</td><td class="desc">' + esc(a.desc) + '</td></tr>').join("") + '</tbody></table>';
  } else if (aba === "pastas") {
    const itens = D.pastas.filter((p) => casa(p, ["caminho","desc"]));
    c.innerHTML = '<table><thead><tr><th>Pasta</th><th>Arquivos</th><th>O que tem</th></tr></thead><tbody>' + itens.map((p) => '<tr><td><code style="padding-left:' + (p.caminho.split("/").length - 1) * 14 + 'px">' + esc(p.caminho) + '</code></td><td>' + p.arquivos + '</td><td class="desc">' + esc(p.desc) + '</td></tr>').join("") + '</tbody></table>';
  } else if (aba === "outros") {
    const lista = (arr) => '<ul>' + arr.filter((x) => casa(x, ["caminho","desc","nome"])).map((x) => '<li>' + cam(x.caminho) + (x.nome ? ' <b>' + esc(x.nome) + '</b>' : '') + (x.quando ? ' <span class="tipo">' + esc(x.quando) + '</span>' : '') + (x.desc ? ' <span class="desc">— ' + esc(x.desc) + '</span>' : '') + '</li>').join("") + '</ul>';
    c.innerHTML = '<h2>Comandos npm</h2><table><tbody>' + Object.entries(D.npmScripts).map(([k, v]) => '<tr><td><code>npm run ' + esc(k) + '</code></td><td><code>' + esc(v) + '</code></td></tr>').join("") + '</tbody></table>' +
      '<h2>Workflows do GitHub Actions</h2>' + lista(D.workflows) + '<h2>Scripts</h2>' + lista(D.scripts) +
      '<h2>Testes do banco (npm run test:db)</h2>' + lista(D.testes.banco) + '<h2>Testes de unidade (npm test)</h2>' + lista(D.testes.unidade) + '<h2>Testes E2E (npm run test:e2e)</h2>' + lista(D.testes.e2e) + '<h2>Documentação</h2>' + lista(D.docs);
  } else {
    c.innerHTML = '<div class="ajuda"><ul>' +
      '<li><b>Achar qualquer coisa:</b> digite na busca (nome de função, pedaço do caminho, nome da tela, tabela). Acentos e maiúsculas não importam; várias palavras = todas precisam aparecer.</li>' +
      '<li><b>Abrir no código:</b> clique no caminho (abre no GitHub, na linha certa) ou em ⧉ para copiar <code>arquivo:linha</code>. No VS Code: Ctrl+P, cole o caminho.</li>' +
      '<li><b>Tela do menu:</b> aba Telas. O desenho é o <code>page.tsx</code>; o que grava no banco é o <code>actions.ts</code> da mesma pasta.</li>' +
      '<li><b>Renomear função/componente (TypeScript):</b> no VS Code, clique no nome e aperte <b>F2</b>. Ele troca em todos os arquivos da coluna "Usado em". Depois: <code>npm run typecheck</code>, <code>npm test</code>, <code>npm run mapa</code>.</li>' +
      '<li><b>Renomear função ou tabela do banco:</b> crie migration nova em <code>supabase/migrations/</code> com <code>alter function ... rename to ...</code> (ou <code>alter table</code>), troque o nome nos arquivos de "Chamada pelo app"/"Usada pelo app" e nos testes de <code>supabase/tests/</code>, e rode <code>npm run test:db</code>.</li>' +
      '<li><b>Tipos:</b> ação = server action (formulário, roda no servidor); componente = pedaço de tela; função = regra/utilitário; hook = <code>use...</code> do React; tipo = tipo do TypeScript; interna = só usada dentro do próprio arquivo.</li>' +
      '<li><b>Atualizar este mapa:</b> <code>npm run mapa</code> (gera de novo a pasta <code>docs/mapa-codigo/</code>).</li>' +
      '</ul></div>';
  }
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-aba]");
  if (b) { aba = b.dataset.aba; history.replaceState(null, "", "#" + aba); render(); return; }
  const cp = e.target.closest("[data-copiar]");
  if (cp) { navigator.clipboard?.writeText(cp.dataset.copiar); cp.textContent = "✓"; setTimeout(() => (cp.textContent = "⧉"), 900); }
});
let tempo; $("#q").addEventListener("input", () => { clearTimeout(tempo); tempo = setTimeout(render, 120); });
$("#dom").addEventListener("change", render); $("#tipo").addEventListener("change", render);
render();
</script>
</body>
</html>
`;

// ---------------------------------------------------------------------------
// Gravar ou conferir
// ---------------------------------------------------------------------------
const conferir = process.argv.includes("--conferir");
let desatualizado = false;
const saidas = [...Object.entries(paginas).map(([n, linhas]) => [`${PASTA_SAIDA}/${n}`, linhas.join("\n")]), [`${PASTA_SAIDA}/mapa.html`, textoHtml]];
if (!conferir) mkdirSync(join(RAIZ, PASTA_SAIDA), { recursive: true });
for (const [p, conteudo] of saidas) {
  const abs = join(RAIZ, p);
  const atual = existsSync(abs) ? readFileSync(abs, "utf8") : "";
  if (atual === conteudo) continue;
  if (conferir) { desatualizado = true; console.error(`${p} está desatualizado: rode npm run mapa`); }
  else { writeFileSync(abs, conteudo); console.log(`gerado ${p} (${(conteudo.length / 1024).toFixed(0)} KB)`); }
}
if (conferir && desatualizado) process.exit(1);
if (!conferir) console.log(`${modulos.size} arquivos TS, ${indice.length} nomes, ${funcoesSql.length} funções SQL, ${tabelasSql.length} tabelas, ${viewsSql.length} views.`);
