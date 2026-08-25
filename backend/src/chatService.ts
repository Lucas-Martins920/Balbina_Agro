import fetch from "node-fetch";
import { AbrirLoteSchema, LancarInsumoSchema, AbrirLoteOutput, LancarInsumoOutput } from "./schemas";
import { z } from "zod";

type ModelResponse = { choices?: any[]; };

export class ChatService {
  apiKey: string;
  apiUrl: string;
  model: string;

  constructor(apiKey: string, apiUrl = "http://localhost:11434/v1/chat/completions", model = "qwen2.5:1.5b") {
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
      // Removemos o Bearer Token obrigatório já que o Ollama local não autentica
      headers: { "Content-Type": "application/json" },
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
    const content = await this.callModel(messages);
    const parsed = this.extractJson(content);
    const v = AbrirLoteSchema.safeParse(parsed);
    if (!v.success) throw new Error("Structured output inválido: " + JSON.stringify(v.error.format()));
    return v.data;
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