// Reconhecimento de voz do navegador do celular (Chrome no Android, Safari no iPhone). A fala vira texto no
// próprio aparelho; quem interpreta o texto é o app (fala-apontamento.ts) ou o chat de manejo.

export type Reconhecimento = {
  lang: string; interimResults: boolean; maxAlternatives: number; start(): void; stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null;
};

export function classeReconhecimento(): (new () => Reconhecimento) | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as Record<string, (new () => Reconhecimento) | undefined>;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function mensagemErroVoz(erro: string) {
  if (erro === "not-allowed" || erro === "service-not-allowed") return "Libere o microfone para o Balbina no navegador.";
  if (erro === "no-speech") return "Não ouvi nada. Toque no microfone e fale perto do celular.";
  if (erro === "network") return "O reconhecimento de voz deste celular precisa de internet. Escreva a mensagem.";
  return "Não deu para ouvir. Tente de novo.";
}
