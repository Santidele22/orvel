import type { MessageTemplate } from '../../domain/message-template';

export type TemplateRepository = {
  list(): Promise<MessageTemplate[]>;
  get(id: string): Promise<MessageTemplate | null>;
  save(template: MessageTemplate): Promise<void>;
  delete(id: string): Promise<void>;
};
