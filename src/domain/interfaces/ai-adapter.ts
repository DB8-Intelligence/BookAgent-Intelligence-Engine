/**
 * Interface: IAIAdapter
 *
 * Contrato para adapters de inteligência artificial.
 * Permite trocar providers (OpenAI ↔ Gemini) sem modificar módulos.
 */

export interface IAIAdapter {
  /** Nome do provider (ex: "openai", "gemini") */
  readonly provider: string;

  /** Gera texto a partir de um prompt */
  generateText(prompt: string, options?: AITextOptions): Promise<string>;

  /** Analisa uma imagem e retorna descrição/classificação */
  analyzeImage(imagePath: string, prompt: string): Promise<string>;
}

export interface AITextOptions {
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}
