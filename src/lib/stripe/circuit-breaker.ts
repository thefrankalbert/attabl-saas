import { logger } from '@/lib/logger';

/**
 * Simple circuit breaker for external API calls (Stripe, etc.).
 *
 * States:
 * - CLOSED: requests pass through normally
 * - OPEN: requests are rejected immediately (service is down)
 * - HALF_OPEN: one probe request is allowed to test recovery
 *
 * Timeouts: all calls are wrapped with AbortSignal.timeout().
 */

type CircuitState = 'closed' | 'open' | 'half_open';

interface CircuitBreakerOptions {
  /** Name for logging */
  name: string;
  /** Number of consecutive failures before opening the circuit */
  failureThreshold?: number;
  /** How long (ms) the circuit stays open before trying half-open */
  resetTimeout?: number;
  /** Timeout (ms) for each individual call */
  callTimeout?: number;
}

class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly name: string;
  private readonly failureThreshold: number;
  private readonly resetTimeout: number;
  private readonly callTimeout: number;

  constructor(options: CircuitBreakerOptions) {
    this.name = options.name;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeout = options.resetTimeout ?? 30000; // 30s
    this.callTimeout = options.callTimeout ?? 10000; // 10s
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime >= this.resetTimeout) {
        this.state = 'half_open';
        logger.info(`Circuit breaker [${this.name}] transitioning to half-open`);
      } else {
        throw new Error(`Circuit breaker [${this.name}] is OPEN - service unavailable`);
      }
    }

    try {
      // Race the actual call against a timeout (Stripe SDK does not support AbortSignal)
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(`Circuit breaker [${this.name}] timeout after ${this.callTimeout}ms`),
              ),
            this.callTimeout,
          ),
        ),
      ]);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === 'half_open') {
      logger.info(`Circuit breaker [${this.name}] recovered - closing circuit`);
    }
    this.failureCount = 0;
    this.state = 'closed';
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half_open' || this.failureCount >= this.failureThreshold) {
      this.state = 'open';
      logger.error(`Circuit breaker [${this.name}] OPENED after ${this.failureCount} failures`);
    }
  }
}

/** Circuit breaker for Stripe API calls */
export const stripeCircuitBreaker = new CircuitBreaker({
  name: 'stripe',
  failureThreshold: 3,
  resetTimeout: 30000,
  callTimeout: 10000,
});

/**
 * Execute a Stripe API call with circuit breaker + timeout.
 *
 * Usage:
 *   const session = await withStripeBreaker(() => stripe.checkout.sessions.create({...}));
 */
export async function withStripeBreaker<T>(fn: () => Promise<T>): Promise<T> {
  return stripeCircuitBreaker.execute(() => fn());
}
