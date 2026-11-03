import { AbrirLoteSchema, LancarInsumoSchema, AbrirLoteOutput, LancarInsumoOutput } from "./schemas";
import { z } from "zod";

type ModelResponse = { choices?: any[]; };

export class ChatService {
  apiKey: string;
  apiUrl: string;
  model: string;

  constructor(
    apiKey: string,
    apiUrl = "http://localhost:11434/v1/chat/completions",
    model = "qwen2.5:0.5b"
  ) {
    this.apiKey = apiKey;
    this.apiUrl = apiUrl;
    this.model = model;
  }

  private buildSystemPrompt(action: "abrir_lote" | "lancar_insumo") {
    if (action === "abrir_lote") {
      return [
        { role: "system", content: "Responda SOMENTE com JSON válido para action 'abrir_lote' seguindo o schema esperado." },
        { role: "system", content: `Formato: { "action":"abrir_lote", "payload":{ "loteId":"", "especie":"", "tanqueId":"", "dataInicio":"YYYY-MM-DD", "estoqueInicial":0, "unidade":"peixes", "observacoes":"", "manejo": {...} } }` }
      ];
    }
    return [
      { role: "system", content: "Responda SOMENTE com JSON válido para action 'lancar_insumo' seguindo o schema esperado." },
      { role: "system", content: `Formato: { "action":"lancar_insumo", "payload":{ "insumoId":"", "tipo":"racao|alevino|medicamento|outro", "quantidade": 0, "unidade":"kg", "precoUnitario":0, "fornecedor":"", "tanqueId":"", "dataCompra":"YYYY-MM-DD" } }` }
    ];
  }

  private extractJson(text: string): any {
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first !== -1 && last !== -1 && last > first) {
      const candidate = text.slice(first, last+1);
      try { return JSON.parse(candidate); } catch {}
      try { return JSON.parse(candidate.replace(/'/g, '"')); } catch {}
    }
    throw new Error("Não foi possível extrair JSON da resposta do modelo.");
  }

  private extractAbrirLoteFromMessage(userMessage: string): AbrirLoteOutput {
    const message = userMessage.trim();
    const normalized = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const dateMatch = message.match(/\b(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})\b/);
    const dataInicio = dateMatch
      ? dateMatch[1].includes("/")
        ? dateMatch[1].split("/").reverse().join("-")
        : dateMatch[1]
      : new Date().toISOString().slice(0, 10);

    const quantityMatch = normalized.match(/\b(?:com|de)\s+(\d+)\s+(?:alevinos?|peixes?)/i);
    const speciesMatch = normalized.match(/\b(?:de|da especie)\s+([a-z][a-z ]*?)(?=(?:\s+(?:no|na|em|a partir|para))|$)/i);
    const explicitLoteMatch = normalized.match(/\blote\s+([\w-]+(?:\s+\d+)?)/i);
    const tankMatch = normalized.match(/\b(?:no|na|em)\s+(?:tanque|viveiro)\s+([\w-]+(?:\s+\d+)?)/i);

    const tanqueId = tankMatch?.[1].trim() ||
      (explicitLoteMatch && /^viveiro\b/i.test(explicitLoteMatch[1])
        ? explicitLoteMatch[1].trim()
        : undefined);

    if (!quantityMatch || !speciesMatch || !tanqueId) {
      throw new Error(
        "Não foi possível interpretar o lote. Informe tanque, quantidade, espécie e, opcionalmente, a data."
      );
    }

    const loteId = explicitLoteMatch && !/^viveiro\b/i.test(explicitLoteMatch[1])
      ? explicitLoteMatch[1].trim()
      : `LOTE-${dataInicio}-${tanqueId.replace(/\s+/g, "-")}`;

    return {
      action: "abrir_lote",
      payload: {
        loteId,
        especie: speciesMatch[1].trim(),
        tanqueId,
        dataInicio,
        estoqueInicial: Number(quantityMatch[1]),
        unidade: "peixes",
        observacoes: "Interpretado localmente a partir da mensagem do usuário.",
      },
    };
  }

    private async callModel(messages: any[]) {
    // Adicionamos o "response_format" para travar o Qwen em formato JSON
    const body = { 
      model: this.model, 
      messages, 
      temperature: 0.0, 
      max_tokens: 800,
      response_format: { type: "json_object" } 
    };

    const res = await fetch(this.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey
          ? { Authorization: `Bearer ${this.apiKey}` }
          : {}),
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) throw new Error(`Erro IA ${res.status}: ${await res.text()}`);
    
    const j: any = await res.json();
    
    // Mapeamento seguro: tenta ler o padrão OpenAI e cai para o padrão nativo Ollama se necessário
    const content = j.choices?.[0]?.message?.content ?? j.message?.content ?? j.response;
    
    if (!content) throw new Error("Resposta inesperada da IA. Resposta bruta: " + JSON.stringify(j));
    return content;
  }


  public async sendAbrirLoteRequest(userMessage: string): Promise<AbrirLoteOutput> {
    const messages = [...this.buildSystemPrompt("abrir_lote"), { role: "user", content: userMessage }];
    try {
      const content = await this.callModel(messages);
      const parsed = this.extractJson(content);
      const v = AbrirLoteSchema.safeParse(parsed);
      if (v.success) return v.data;
    } catch {
      // O modelo pequeno pode ignorar response_format; nesse caso usamos a mensagem original.
    }

    return this.extractAbrirLoteFromMessage(userMessage);
  }

    // US-002: Chamado pelo endpoint /api/lancar-insumo
  public async sendLancarInsumoRequest(userMessage: string): Promise<LancarInsumoOutput> {
    const dataAtual = new Date().toISOString().split('T')[0]; // Pega a data de hoje no formato YYYY-MM-DD
    
    const systemPrompt = `Responda SOMENTE com JSON válido para action 'lancar_insumo'.
Gere OBRIGATORIAMENTE um 'insumoId' aleatório (ex: "INS-999").
Se o usuário disser "ontem", calcule a data correta baseando-se que hoje é ${dataAtual}.

Formato exigido: 
{ 
  "action": "lancar_insumo", 
  "payload": { 
    "insumoId": "INS-123", 
    "tipo": "racao", 
    "quantidade": 50, 
    "unidade": "kg", 
    "precoUnitario": 4.50, 
    "fornecedor": "AgroPet", 
    "tanqueId": "02", 
    "dataCompra": "YYYY-MM-DD" 
  } 
}`;

    const messages = [{ role: "system", content: systemPrompt }, { role: "user", content: userMessage }];
    const content = await this.callModel(messages);
    const parsed = this.extractJson(content);
    
    const v = LancarInsumoSchema.safeParse(parsed);
    if (!v.success) throw new Error("Structured output inválido (insumo): " + JSON.stringify(v.error.format()));
    return v.data;
  }
}