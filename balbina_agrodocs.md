# Balbina Agro — documentação completa do desenvolvimento e correções

## 1. Visão geral

Este arquivo reúne, em ordem cronológica e técnica, os principais ajustes, diagnósticos e decisões feitas durante a etapa de correção e validação do projeto Balbina Agro.

O objetivo é registrar tudo o que foi feito, mesmo os detalhes pequenos, para que a base do trabalho fique documentada e reutilizável em futuras correções, testes e ajustes no código.

---

## 2. Contexto do projeto

- Projeto: Balbina Agro
- Stack principal: Next.js + React + TypeScript
- Ambiente local: desenvolvimento com Next em localhost
- Banco local: Supabase local via Docker / script `npm run local`
- App principal: `http://localhost:3000`
- Host externo de rede: `http://192.168.100.115:3000`

A aplicação tem menu lateral com grupos de módulos como:
- Produção
- Comercial
- Estoque
- Financeiro
- Gestão
- Cadastros
- Configurações

A correção principal focou em um bug de navegação/expansão do menu lateral e em uma questão de acesso pela rede local no ambiente de desenvolvimento.

---

## 3. Visão do sistema em si

O Balbina é um ERP para gestão de piscicultura, voltado principalmente para o contexto de tambaqui e outras espécies de peixes redondos, com foco em operação de produção, controle financeiro, logística de estoque e gestão de ciclo de cultivo.

Ele não é apenas um painel visual — é um sistema completo para operar a empresa produtiva. A estrutura do produto é organizada em áreas de negócio que refletem o dia a dia da atividade:

### 3.1 Produção

A área de produção cuida do ciclo principal da piscicultura:
- viveiros
- setores
- lotes
- povoamento
- biometria
- apontamento do dia a dia
- acompanhamento de traços, ração, oxigênio, mortalidade e outros indicadores
- despesca e encerramento de lotes

Essa área é a base do sistema, porque centraliza o que acontece no viveiro e o que precisa ser registrado para manter o controle do crescimento e do rendimento da produção.

### 3.2 Comercial

A parte comercial envolve a venda do peixe e o relacionamento com clientes, pontos de venda e canais de faturamento:
- vendas
- pedidos
- PDV
- vendedores
- cobrança e recebimentos
- rotas de comercialização

O sistema busca ligar o que saiu da produção ao que foi vendido, reduzindo a distância entre a operação e o faturamento.

### 3.3 Estoque

A área de estoque cobre:
- produtos
- insumos
- ração
- entradas e saídas
- movimentação de estoque
- controle de saldo
- baixa de material conforme produção e vendas

Essa camada é fundamental para garantir que a produção e o comercial consigam operar sem divergência de saldo, sem perda de rastreabilidade e sem inconsistência no inventário.

### 3.4 Financeiro

A área de financeiro lida com o fluxo monetário do negócio:
- contas a pagar
- contas a receber
- fluxo de caixa
- conciliação
- títulos
- cobranças
- pagamentos e organização do caixa

Essa parte do sistema conecta a operação produtiva ao controle financeiro, evitando que o ERP funcione apenas como ferramenta operacional sem controle patrimonial.

### 3.5 Gestão

A gestão reúne todos os módulos de planejamento, acompanhamento e decisão:
- planejamento de lotes
- previsões
- custo do kg
- relatórios
- indicadores de desempenho
- acompanhamento do negócio como um todo

É a parte do sistema usada para entender tendências, custos, produção real e cenários futuros.

### 3.6 Cadastros e configurações

Essas áreas sustentam o sistema:
- usuários e permissões
- empresas
- configurações gerais
- módulos
- cadastros auxiliares
- segurança e acessos

Sem esse nível de configuração, o ERP não consegue operar com padronização, controle de acesso e rastreabilidade.

### 3.7 Modelo de negócio do sistema

O Balbina é um ERP para uma empresa de piscicultura de engorda, com foco em:
- operação técnica da piscicultura
- controle de reprodução e cultivo por lote
- controle de consumo e logística de insumos
- gestão comercial do pescado
- financeiro e faturamento
- visão estratégica do negócio

Ou seja, o sistema não é apenas uma interface administrativa: ele faz parte do processo produtivo da empresa, registrando o que acontece no viveiro, no estoque, na venda e no caixa, de forma integrada.

### 3.8 Fluxo geral do sistema

Em termos práticos, o fluxo do sistema costuma ser:
1. o produtor cadastra ou organiza os viveiros e lotes;
2. registra o povoamento e o ciclo de produção;
3. faz lançamentos diários de trato, alimentação, biometria e movimentações;
4. controla insumos e estoque;
5. gera vendas e faturamentos;
6. acompanha o dinheiro e o fluxo financeiro;
7. visualiza indicadores de desempenho e previsões.

Esse encadeamento é o que faz o sistema ter valor real: ele conecta a operação do campo com a gestão financeira e a visão de negócio.

---

## 4. Problema da funcionalidade do menu

### Sintoma

O usuário relatou que:
- ao clicar na seta dos grupos do menu (Produção, Comercial, Estoque e outros), nada expandia;
- parecia que o menu estava “travado”;
- em alguns casos era necessário navegar para outra tela e só aí o grupo aparecia como aberto ou o recurso ficava acessível.

### Investigação

Foi verificado que a lógica de estado do menu lateral estava sendo alterada enquanto o componente renderizava, em vez de ser tratada em um efeito de estado reativo.

Isso significa que o `Set` de grupos abertos poderia ser sobrescrito em momentos indevidos, gerando comportamento inconsistente em clique e expansão.

### Arquivos envolvidos

- `src/components/barra-lateral.tsx`
- `src/lib/menu.ts`
- `src/lib/menu.test.ts`

### Correção aplicada

Foi criada uma lógica de sincronização para manter os grupos abertos estáveis sem perder os grupos manualmente abertos:

- `sincronizarGruposAbertos(...)` em `src/lib/menu.ts`
- uso desse helper em `src/components/barra-lateral.tsx`
- remoção do padrão perigoso de atualizar o estado de grupos no corpo do render

Também foi adicionado teste de regressão em `src/lib/menu.test.ts` para verificar o comportamento de abertura de grupos.

### Resultado

A funcionalidade do menu foi validada com sucesso:
- grupos abrem corretamente ao clicar
- a navegação interna do grupo aparece
- não depende de navegar para outro painel para “destravar” o comportamento

### Verificação executada

Comando utilizado:

```bash
node --test --experimental-strip-types src/lib/menu.test.ts
```

Resultado verificado:
- 7 testes passaram
- 0 falharam

Também foi executado:

```bash
npm run typecheck -- --pretty false
```

Resultado verificado:
- sem erros de TypeScript

---

## 4. Problema do host externo 192.168.100.115

### Sintoma

O projeto rodava corretamente em:
- `http://localhost:3000`

Mas o acesso via rede local falhava em:
- `http://192.168.100.115:3000`

A página aparecia quebrada, sem funcionar corretamente, e o terminal mostrava mensagens de bloqueio do ambiente Next em desenvolvimento.

### Diagnóstico

O erro principal era relacionado ao Next.js em ambiente de desenvolvimento:
- a origem do host externo era bloqueada
- os recursos de dev (HMR, bundling e sockets) eram rejeitados

O log explicitava isso:

> Blocked cross-origin request to Next.js dev resource /_next/hmr from "192.168.100.115".

E também orientava:

> add it to allowedDevOrigins

### Arquivo relevante

- `next.config.ts`

### Ajuste realizado

Foi adicionado no arquivo de configuração do Next:

```ts
allowedDevOrigins: ["192.168.100.115"]
```

Isso permite que a origem da rede local seja aceita pelo ambiente de desenvolvimento do Next.

### Observação importante

O host externo foi configurado apenas como ajuste de ambiente; foi deixado em estado de espera/quieto depois da análise, porque a funcionalidade real do projeto e a operação principal funcionavam em localhost.

Em outras palavras:
- o app principal funciona em localhost
- o acesso via rede foi apenas ajustado como suporte futuro
- não foi necessário manter o host externo como prioridade se o objetivo principal era estabilizar a app local

---

## 5. Comandos e rotinas usados

### Rodar localmente

```bash
npm run local
```

Esse script faz o seguinte:
- sobe o banco local Supabase
- aplica migrations
- ajusta `.env.local`
- cria conta de teste local
- inicia o app em localhost:3000

### Rodar o app em modo dev manual

```bash
npx next dev -H 0.0.0.0 -p 3000
```

### Verificar TypeScript

```bash
npm run typecheck -- --pretty false
```

### Teste do menu

```bash
node --test --experimental-strip-types src/lib/menu.test.ts
```

---

## 6. Observações importantes do ambiente

### 3000 é o host principal do projeto

Os arquivos e a lógica de configuração do projeto apontam para 3000 como porta padrão.

O script local escreve no `.env.local`:

```env
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Também inicia o app com Next em porta 3000.

### O 3001 não é o host principal do ambiente

Mesmo que o usuário tente usar 3001, o projeto não foi projetado para ser executado ali como principal. O correto para o ambiente local é o 3000.

### Host externo não é prioridade para o desenvolvimento local

Se a intenção for apenas trabalhar no computador local, o uso de `localhost:3000` é o caminho mais estável e confiável.

---

## 7. Resumo final do que foi concluído

### Corrigido

- bug de expansão do menu lateral
- estado inconsistente dos grupos abertos
- regressão de UI no menu de módulos
- validação por testes do menu
- validação por TypeScript

### Diagnóstico resolvido

- problema do host externo 192.168.100.115 em ambiente Next dev
- liberação local do host foi configurada em `next.config.ts`

### Mantido como referência

- o uso normal do projeto continua em `localhost:3000`
- host externo fica opcional / em manutenção de compatibilidade, mas não é necessário para a operação principal

---

## 8. Arquivos diretamente relacionados

- `next.config.ts`
- `scripts/local.mjs`
- `src/components/barra-lateral.tsx`
- `src/lib/menu.ts`
- `src/lib/menu.test.ts`

---

## 9. Conclusão

O projeto ficou em um estado estável para uso local no localhost, e a funcionalidade principal do menu foi corrigida.

A correção do host externo foi identificada e configurada, mas foi deixada em plano secundário para não atrapalhar a estabilidade do desenvolvimento principal. O foco real e funcional foi manter o app funcionando corretamente em `localhost:3000`, que foi o ambiente validado e confirmado como estável.
