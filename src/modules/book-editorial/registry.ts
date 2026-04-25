/**
 * Book Editorial Handler Registry
 *
 * Mapeia `BookStepName` → `IBookStepHandler`. É a única fonte de resolução
 * de handler para o processor.
 *
 * Registro explícito (não reflexivo): adicionar um novo handler exige
 * importar e chamar `register()`. Isso torna o grafo de módulos
 * inspecionável e impede handlers "fantasma".
 */

import type { BookStepName } from '../../domain/entities/book-editorial.js';
import type { IBookStepHandler } from '../../domain/interfaces/book-step-handler.js';

export class BookEditorialHandlerRegistry {
  private readonly handlers = new Map<BookStepName, IBookStepHandler>();

  register(handler: IBookStepHandler): void {
    if (this.handlers.has(handler.step)) {
      throw new Error(
        `[BookEditorialHandlerRegistry] Handler for step "${handler.step}" already registered`,
      );
    }
    this.handlers.set(handler.step, handler);
  }

  resolve(step: BookStepName): IBookStepHandler | null {
    return this.handlers.get(step) ?? null;
  }

  list(): BookStepName[] {
    return Array.from(this.handlers.keys());
  }
}
