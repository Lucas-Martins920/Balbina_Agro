// Sincronização automática: cada tela que guarda envios no aparelho (campo, vendedor) registra aqui a sua tarefa.
// Com internet, a cada 5 s roda as tarefas que têm algo na fila; também roda na hora em que a internet volta,
// quando a tela volta para a frente e quando o service worker pede (Background Sync, com o app fechado ou em
// segundo plano no Android). Uma tarefa nunca roda duas vezes ao mesmo tempo.
//
// O agendador é uma fábrica com relógio e conexão injetáveis (os testes usam relógio de mentira); a tela usa a
// instância única do navegador, criada sob demanda em sincronizador().

export const INTERVALO_SYNC_MS = 5_000;
export const TAG_SYNC = "balbina-envios";

export type Tarefa = {
  nome: string;
  temPendente: () => boolean;     // algo na fila pronto para ir agora?
  rodar: () => Promise<unknown>;
};

export type Dependencias = {
  online: () => boolean;
  intervalo?: number;
  agendar?: (cb: () => void, ms: number) => unknown;
  cancelar?: (id: unknown) => void;
  pedirSegundoPlano?: () => void;  // registra o Background Sync no service worker
};

export function criarSincronizador(dep: Dependencias) {
  const tarefas = new Map<string, Tarefa>();
  const rodando = new Set<string>();
  const agendar = dep.agendar ?? ((cb, ms) => setInterval(cb, ms));
  const cancelar = dep.cancelar ?? ((id) => clearInterval(id as ReturnType<typeof setInterval>));
  let relogio: unknown = null;

  async function rodarTarefa(t: Tarefa) {
    if (rodando.has(t.nome) || !dep.online() || !t.temPendente()) return;
    rodando.add(t.nome);
    try {
      await t.rodar();
    } catch {
      /* a tarefa trata os próprios erros; um erro solto não pode parar o relógio */
    } finally {
      rodando.delete(t.nome);
    }
  }

  async function rodarTudo() {
    await Promise.all([...tarefas.values()].map(rodarTarefa));
  }

  function ligarRelogio() {
    if (relogio === null && tarefas.size) relogio = agendar(() => void rodarTudo(), dep.intervalo ?? INTERVALO_SYNC_MS);
  }

  function desligarRelogio() {
    if (relogio !== null && !tarefas.size) {
      cancelar(relogio);
      relogio = null;
    }
  }

  return {
    registrar(t: Tarefa): () => void {
      tarefas.set(t.nome, t);
      ligarRelogio();
      return () => {
        if (tarefas.get(t.nome) === t) tarefas.delete(t.nome);
        desligarRelogio();
      };
    },
    // roda agora (internet voltou, item novo na fila, pedido do service worker)
    agora: rodarTudo,
    agoraUma: (nome: string) => {
      const t = tarefas.get(nome);
      return t ? rodarTarefa(t) : Promise.resolve();
    },
    // tem envio esperando: pede ao service worker para sincronizar mesmo com a tela fechada
    pedirSegundoPlano() {
      if ([...tarefas.values()].some((t) => t.temPendente())) dep.pedirSegundoPlano?.();
    },
    rodando: (nome: string) => rodando.has(nome),
    tarefas: () => [...tarefas.keys()],
  };
}

export type Sincronizador = ReturnType<typeof criarSincronizador>;
