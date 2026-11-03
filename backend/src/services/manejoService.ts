import { loadConhecimento } from "../knowledgeLoader";

type ManejoResponse = {
  resposta: string;
  conhecimentoDisponivel: boolean;
};

type ModelResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  message?: {
    content?: string;
  };
  response?: string;
};

export class ManejoService {
  private readonly apiUrl: string;
  private readonly model: string;
  private readonly apiKey?: string;

  constructor(
    apiUrl = "http://localhost:11434/v1/chat/completions",
    model = "qwen2.5:1.5b",
    apiKey?: string
  ) {
    this.apiUrl = apiUrl;
    this.model = model;
    this.apiKey = apiKey;
  }

  async responder(pergunta: string): Promise<ManejoResponse> {
    const conhecimento = await loadConhecimento(process.cwd());

    if (Object.keys(conhecimento).length === 0) {
      return {
        resposta:
          "Não há conhecimento de manejo cadastrado localmente.",
        conhecimentoDisponivel: false,
      };
    }

    const mensagens = [
      {
        role: "system",
        content: `
Você é o suporte de manejo da Balbina Agro.

Responda em português, de forma objetiva.
Use somente o conhecimento local abaixo.
Não invente valores, recomendações ou parâmetros.
Se a pergunta não puder ser respondida pelo conhecimento local,
diga exatamente:
"Não há informação cadastrada para essa pergunta."

Conhecimento local:
${JSON.stringify(conhecimento)}
        `.trim(),
      },
      {
        role: "user",
        content: pergunta,
      },
    ];

    const response = await fetch(this.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey
          ? { Authorization: `Bearer ${this.apiKey}` }
          : {}),
      },
      body: JSON.stringify({
        model: this.model,
        messages: mensagens,
        temperature: 0,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Erro no serviço de manejo: ${response.status}`
      );
    }

    const result = (await response.json()) as ModelResponse;

    const resposta =
      result.choices?.[0]?.message?.content ??
      result.message?.content ??
      result.response;

    if (!resposta) {
      throw new Error(
        "O serviço de manejo retornou uma resposta vazia."
      );
    }

    return {
      resposta: resposta.trim(),
      conhecimentoDisponivel: true,
    };
  }
}