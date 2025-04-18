import type { IEvent } from '../types/eventTypes';

// Generic version of the Event class that can handle specific payload types
export class Event<T = any> implements IEvent {
  private listeners: Record<string, ((...args: any[]) => void)[]> = {};

  /**
   * Subscribe to an event
   * @param eventName Name of the event to listen for
   * @param callback Function to call when event occurs
   * @returns Function to unsubscribe
   */
  on(eventName: string, callback: (...args: any[]) => void): () => void {
    if (!this.listeners[eventName]) {
      this.listeners[eventName] = [];
    }
    this.listeners[eventName].push(callback);

    // Return unsubscribe function
    return () => {
      this.listeners[eventName] = this.listeners[eventName].filter(
        (listener) => listener !== callback
      );
    };
  }

  /**
   * Emit an event to all listeners
   * @param eventName Name of the event to emit
   * @param args Arguments to pass to listeners
   */
  emit(eventName: string, ...args: any[]): void {
    if (!this.listeners[eventName]) {
      return;
    }

    this.listeners[eventName].forEach((callback) => {
      try {
        callback(...args);
      } catch (error) {
        console.error(`Error in event listener for ${eventName}:`, error);
      }
    });
  }

  /**
   * Clear all event subscriptions
   */
  clear(): void {
    this.listeners = {};
  }
} 