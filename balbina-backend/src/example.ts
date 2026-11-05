import { ChatService } from "./chatService";
import { loadConhecimento } from "./knowledgeLoader";
import { handleAbrirLote } from "./structuredOutputHandler";

// inicialização (supply API key via env)
const apiKey = process.env.IA_API_KEY!;
if (!apiKey) throw new Error("Defina IA_API_KEY no ambiente.");

async function run() {
  const conhecimento = await loadConhecimento(process.cwd());
  const chat = new ChatService(apiKey);
  // mensagem do usuário que corresponde à US-001
  const userMsg = "Abrir um novo lote L-2026-08 com 500 alevinos de tambaqui no tanque TQ-1 a partir de 2026-09-01. Volume do tanque 10 m3.";
  const parsed = await chat.sendAbrirLoteRequest(userMsg);
  const cmd = handleAbrirLote(parsed, conhecimento);
  console.log("Comando abrir lote:", cmd);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});