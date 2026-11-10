# Ambiente leve (notebook de 8 GB no Linux)

VS Code + Docker com o Supabase + `next dev` + Chrome passam de 8 GB. O Linux vai para o swap, os processos ficam
esperando o disco e o load average sobe para 40 (o load conta quem espera disco, não só quem usa CPU). O que resolve
é caber na RAM. Este guia junta o que o repositório já faz e o que você liga no Ubuntu, uma vez só.

## Uso diário

```bash
npm run dev:iniciar            # liga o Docker, o Supabase enxuto (com limites) e o next dev
npm run dev:iniciar -- --studio  # o mesmo, com o Supabase Studio (mais ~400 MB)
npm run dev:iniciar -- --code    # também abre o VS Code
npm run dev:status             # quanto cada contêiner está usando, contra o limite
npm run dev:parar              # desliga next dev, Supabase, contêineres, docker.service, docker.socket e VS Code
npm run dev:parar -- --manter-code     # tudo menos o VS Code
npm run dev:parar -- --manter-docker   # só o next dev e o Supabase
```

O `dev:parar` pede a senha do sudo no começo (para desligar o Docker) e fecha o VS Code por último. Se você rodar
de dentro do terminal do VS Code, o terminal fecha junto; o resto já terminou antes.

## O que o repositório faz

| Onde | O quê | Ganho |
|---|---|---|
| `src/components/offline.tsx` | No `next dev` o service worker fica desligado. Ele "aquecia" até 80 telas do menu, e no dev cada tela obriga o Turbopack a compilar a rota. | O maior: minutos de CPU a 100% e GBs de RAM a cada 12 h e a cada aba nova. Para testar o offline no dev: `NEXT_PUBLIC_SW_DEV=1` no `.env.local`. |
| `src/lib/auth.ts` | As claims da sessão são lidas uma vez por requisição (`cache()` do React). | O Supabase local assina com HS256, e cada `getClaims()` ia ao Auth. O layout fazia 3 idas por tela; agora faz 1 (mais a do proxy). |
| `supabase/config.toml` `[db.settings]` | Postgres com `max_connections = 50`, 4 processos de fundo, 2 workers paralelos, `shared_buffers = 128MB`. | Menos processos e menos RAM reservada no banco. |
| `scripts/limites-docker.mjs` | Depois do `supabase start`, `docker update` com teto de RAM (sem swap) e CPU em cada contêiner: db 1 GB / 1,5 CPU, kong 256 MB, auth e rest 128 MB, studio 512 MB, postgres-meta 256 MB. | Nenhum contêiner passa do teto. O `config.toml` não tem campo para isso e o `supabase stop` apaga os contêineres, por isso roda a cada início. |
| `scripts/local.mjs` no modo leve | Sem Studio, postgres-meta e Mailpit; heap do `next dev` com teto de 2,5 GB; tudo com `nice`/`ionice` (prioridade baixa). | ~400 MB a menos, e o desktop continua respondendo durante a compilação. |
| `next.config.ts` (só com `BALBINA_DEV_LEVE=1`) | `turbopackMemoryEviction: "full"` e loaders em threads. | O Turbopack devolve memória depois de cada compilação. |
| `.vscode/settings.json` | O vigia de arquivos e a busca ignoram `.next`, `node_modules`, `graphify-out`, `docs/mapa-codigo`; TS server com teto de 2 GB. | Menos CPU no VS Code a cada compilação. |

Medido em 2026-11-10: o Supabase completo parado usa ~600 MB; no modo leve, ~200 MB.

## No Ubuntu (uma vez)

```bash
# 1. Docker só quando você pedir (o dev:iniciar liga). Economiza ~150 MB e o boot fica mais rápido.
sudo systemctl disable docker.service docker.socket containerd.service

# 2. zram: swap comprimido na RAM, muito mais rápido que o swap em disco (o que gera o load 40)
sudo apt install zram-tools
echo -e "ALGO=zstd\nPERCENT=50" | sudo tee /etc/default/zramswap
sudo systemctl restart zramswap

# 3. Swap só em último caso, e sem jogar fora o cache de arquivos cedo demais
echo -e "vm.swappiness=10\nvm.vfs_cache_pressure=50" | sudo tee /etc/sysctl.d/99-dev.conf
sudo sysctl --system

# 4. Quando a RAM acabar, fecha o processo mais pesado em vez de congelar a máquina
sudo apt install earlyoom
sudo systemctl enable --now earlyoom

# 5. Vigias de arquivo: o VS Code e o Turbopack precisam de mais que o padrão
echo "fs.inotify.max_user_watches=524288" | sudo tee /etc/sysctl.d/99-inotify.conf
sudo sysctl --system
```

No Chrome: Configurações > Desempenho > **Economia de memória** ligada (abas paradas dormem). Uma aba do
Balbina aberta por vez no dev: cada aba é uma conexão de HMR e uma compilação a mais.

No VS Code: desligue as extensões que não usa neste projeto (botão direito > "Desativar (Espaço de Trabalho)"),
principalmente as de Java, Python e Docker.

## Diagnóstico rápido

```bash
uptime                     # load average (1, 5 e 15 min). Acima do número de núcleos (nproc) = fila
free -h                    # "disponível" perto de zero e swap cheio = é memória, não CPU
vmstat 2 5                 # colunas si/so acima de zero o tempo todo = trocando com o disco
npm run dev:status         # consumo de cada contêiner do Supabase contra o limite
ps -eo pid,rss,pcpu,comm --sort=-rss | head -15   # os 15 processos que mais usam RAM
```

Se o `next dev` parar com "JavaScript heap out of memory", rode `npm run dev:iniciar` de novo; é o teto de 2,5 GB
fazendo o trabalho dele em vez de travar o Linux.
