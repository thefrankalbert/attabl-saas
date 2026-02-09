'use server';

import { z } from 'zod';
import { logger } from '@/lib/logger';
import {
  getAuthenticatedUserWithTenant,
  AuthError,
  type AuthenticatedUserWithTenant,
} from '@/lib/auth/get-session';

/**
 * Safe Action wrapper for Server Actions.
 *
 * Provides:
 * - Automatic Zod input validation
 * - Automatic authentication + tenant authorization
 * - Centralized error handling with logger
 * - Structured return type { success, data?, error? }
 *
 * Usage:
 *   export const myAction = createSafeAction(mySchema, async ({ input, ctx }) => {
 *     // input is validated, ctx has { user, tenantId, role, supabase }
 *     return { myData: 'value' };
 *   });
 */

export type SafeActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

interface SafeActionContext {
  ctx: AuthenticatedUserWithTenant;
}

interface SafeActionHandlerArgs<TInput> extends SafeActionContext {
  input: TInput;
}

/**
 * Creates a server action with Zod validation and authentication.
 *
 * @param schema - Zod schema for input validation
 * @param handler - Async function receiving validated input and auth context
 * @returns Server action that returns SafeActionResult
 */
export function createSafeAction<TInput, TOutput>(
  schema: z.ZodType<TInput>,
  handler: (args: SafeActionHandlerArgs<TInput>) => Promise<TOutput>,
): (rawInput: TInput) => Promise<SafeActionResult<TOutput>> {
  return async (rawInput: TInput): Promise<SafeActionResult<TOutput>> => {
    // 1. Validate input with Zod
    const parseResult = schema.safeParse(rawInput);

    if (!parseResult.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parseResult.error.issues) {
        const path = issue.path.join('.');
        if (!fieldErrors[path]) fieldErrors[path] = [];
        fieldErrors[path].push(issue.message);
      }

      return {
        success: false,
        error: 'Données invalides',
        fieldErrors,
      };
    }

    // 2. Authenticate + authorize
    let ctx: AuthenticatedUserWithTenant;
    try {
      ctx = await getAuthenticatedUserWithTenant();
    } catch (err) {
      if (err instanceof AuthError) {
        return { success: false, error: err.message };
      }
      logger.error('Authentication failed', err);
      return { success: false, error: "Erreur d'authentification" };
    }

    // 3. Execute handler
    try {
      const data = await handler({ input: parseResult.data, ctx });
      return { success: true, data };
    } catch (err) {
      logger.error('Safe action error', err, {
        userId: ctx.user.id,
        tenantId: ctx.tenantId,
      });

      if (err instanceof AuthError) {
        return { success: false, error: err.message };
      }

      return {
        success: false,
        error: 'Une erreur est survenue. Veuillez réessayer.',
      };
    }
  };
}
