import { Activity, BatteryMedium, Droplets, Signal, Thermometer, type LucideIcon } from "lucide-react";
import { Etiqueta, Titulo, Vazio, type TomEtiqueta } from "@/components/ui";
import { getEmpresaAtual } from "@/lib/empresa";
import { exigirAcesso } from "@/lib/permissoes";
import { createClient } from "@/lib/supabase/server";

type Leitura = {
  sonda_id: string; empresa_id: string; sonda_nome: string; modelo: string | null; ativo: boolean;
  viveiro_id: string | null; viveiro_nome: string | null; leitura_id: string | null; lido_em: string | null;
  oxigenio_mg_l: number | null; temperatura_c: number | null; ph: number | null; amonia_mg_l: number | null;
  bateria_pct: number | null; sinal_dbm: number | null; nivel: string;
};

const br = (n: number | null, casas = 1) => n == null ? "–" : new Intl.NumberFormat("pt-BR", { maximumFractionDigits: casas }).format(n);

function tempoAtras(iso: string | null): string {
  if (!iso) return "sem leituras";
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min atrás`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

function corNivel(nivel: string): TomEtiqueta {
  if (nivel === "critico") return "perigo";
  if (nivel === "atencao") return "alerta";
  return "positivo";
}

function Medida({ icone: Icone, nome, valor, unidade }: { icone: LucideIcon; nome: string; valor: string; unidade: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icone size={16} className="shrink-0 text-texto-suave" />
      <span className="text-texto-suave">{nome}</span>
      <span className="ml-auto font-display tabular-nums font-semibold">{valor}</span>
      {unidade && <span className="text-xs text-texto-suave">{unidade}</span>}
    </div>
  );
}

export default async function PaginaSondas() {
  await exigirAcesso("lotes");
  const { atual } = await getEmpresaAtual();
  const supabase = await createClient();

  const { data: sondas } = await supabase
    .from("ultimas_leituras")
    .select("*")
    .eq("empresa_id", atual.id)
    .order("sonda_nome");

  const lista = (sondas ?? []) as Leitura[];

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <Titulo descricao="Leituras em tempo real das sondas de qualidade da água instaladas nos viveiros.">
        Sondas IoT
      </Titulo>

      {lista.length === 0 ? (
        <Vazio>Nenhuma sonda cadastrada. Cadastre uma sonda em Configurações &gt; API para começar a receber leituras.</Vazio>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {lista.map((s) => (
            <div key={s.sonda_id} className="vidro flex flex-col gap-4 rounded-2xl border border-borda p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-display text-[17px] font-semibold">{s.sonda_nome}</p>
                  <p className="text-xs text-texto-suave">
                    {s.viveiro_nome ?? "Sem viveiro"} · {tempoAtras(s.lido_em)}
                  </p>
                </div>
                <Etiqueta tom={corNivel(s.nivel)}>
                  {s.nivel === "critico" ? "Crítico" : s.nivel === "atencao" ? "Atenção" : "Normal"}
                </Etiqueta>
              </div>

              {s.leitura_id ? (
                <div className="flex flex-col gap-2">
                  <Medida icone={Droplets} nome="O₂" valor={br(s.oxigenio_mg_l)} unidade="mg/L" />
                  <Medida icone={Thermometer} nome="Temp" valor={br(s.temperatura_c)} unidade="°C" />
                  <Medida icone={Activity} nome="pH" valor={br(s.ph)} unidade="" />
                  {s.amonia_mg_l != null && (
                    <Medida icone={Droplets} nome="NH₃" valor={br(s.amonia_mg_l, 3)} unidade="mg/L" />
                  )}
                  <div className="mt-1 flex items-center gap-4 border-t border-linha pt-2 text-xs text-texto-suave">
                    {s.bateria_pct != null && (
                      <span className="flex items-center gap-1"><BatteryMedium size={14} /> {s.bateria_pct}%</span>
                    )}
                    {s.sinal_dbm != null && (
                      <span className="flex items-center gap-1"><Signal size={14} /> {s.sinal_dbm} dBm</span>
                    )}
                    {s.modelo && <span className="ml-auto">{s.modelo}</span>}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-texto-suave">Aguardando primeira leitura.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
