// =============================================================================
// HIREBYMINUTES — BACKEND CONNECTIVITY & COLD-START STATUS TRACKER
// =============================================================================
// Tracks backend health, Render free-tier cold start / spin-up state,
// and provides reactive subscribers for UI banners, skeletons, and retries.
// =============================================================================

export type BackendState = 'idle' | 'waking_up' | 'awake' | 'error';

export interface BackendStatusInfo {
  state: BackendState;
  message?: string;
  isSleeping: boolean;
  lastChecked: number;
}

type Listener = (status: BackendStatusInfo) => void;

class BackendStatusManager {
  private state: BackendState = 'idle';
  private message: string = '';
  private lastChecked: number = Date.now();
  private listeners: Set<Listener> = new Set();
  private activePendingRequests: number = 0;
  private wakingTimeoutId: any = null;

  public getStatus(): BackendStatusInfo {
    return {
      state: this.state,
      message: this.message,
      isSleeping: this.state === 'waking_up',
      lastChecked: this.lastChecked
    };
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const status = this.getStatus();
    this.listeners.forEach((listener) => {
      try {
        listener(status);
      } catch (err) {
        console.error('[BackendStatus] Error in listener callback:', err);
      }
    });
  }

  /**
   * Called when an API request begins.
   * If any request takes longer than 2.5 seconds (characteristic of Render cold starts),
   * mark the backend state as 'waking_up'.
   */
  public onRequestStart(): () => void {
    this.activePendingRequests++;

    if (!this.wakingTimeoutId && this.state !== 'awake') {
      this.wakingTimeoutId = setTimeout(() => {
        if (this.activePendingRequests > 0 && this.state !== 'awake') {
          this.setState('waking_up', 'Backend server is waking up from idle sleep (Render free tier). Live data will appear automatically.');
        }
      }, 2500);
    }

    let finished = false;
    return () => {
      if (finished) return;
      finished = true;
      this.activePendingRequests = Math.max(0, this.activePendingRequests - 1);
      if (this.activePendingRequests === 0 && this.wakingTimeoutId) {
        clearTimeout(this.wakingTimeoutId);
        this.wakingTimeoutId = null;
      }
    };
  }

  /**
   * Called when an API request succeeds (HTTP 2xx)
   */
  public onConnectionSuccess() {
    if (this.wakingTimeoutId) {
      clearTimeout(this.wakingTimeoutId);
      this.wakingTimeoutId = null;
    }
    this.setState('awake', 'Backend server is online and operational.');
  }

  /**
   * Called when a transient cold start error (502, 503, 504) or timeout occurs
   */
  public onColdStartDetected(message?: string) {
    this.setState('waking_up', message || 'Backend server is currently waking up (Render free tier). Retrying automatically...');
  }

  /**
   * Called when requests definitively fail after retries or prolonged timeout
   */
  public onConnectionError(errorMessage?: string) {
    if (this.wakingTimeoutId) {
      clearTimeout(this.wakingTimeoutId);
      this.wakingTimeoutId = null;
    }
    this.setState('error', errorMessage || 'Could not connect to the backend server. The service may still be starting up.');
  }

  public setState(state: BackendState, message?: string) {
    this.state = state;
    this.message = message || '';
    this.lastChecked = Date.now();
    this.notify();
  }
}

export const backendStatus = new BackendStatusManager();
