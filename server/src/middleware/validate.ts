import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';

// Runtime request validation. Routes previously cast `req.body as {...}` (a
// compile-time-only assertion) and hand-checked fields. validateBody parses the
// body against a zod schema, returns 400 on failure, and replaces req.body with
// the parsed (and default-filled) value so handlers work with trusted input.

export function validateBody(schema: ZodTypeAny): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: result.error.errors[0]?.message ?? 'Invalid request body' });
      return;
    }
    req.body = result.data;
    next();
  };
}
