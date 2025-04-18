export interface IEvent<T = any> {
  on(eventName: string, callback: (...args: any[]) => void): () => void;
  emit(eventName: string, ...args: any[]): void;
  clear(): void;
} 