import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

export function hmacMiddleware(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    res.status(500).json({ error: 'Server misconfiguration: missing GITHUB_WEBHOOK_SECRET' });
    return;
  }

  const signature = req.headers['x-hub-signature-256'] as string | undefined;
  if (!signature) {
    res.status(401).json({ error: 'Missing X-Hub-Signature-256 header' });
    return;
  }

  const rawBody: Buffer = req.body as Buffer;
  if (!Buffer.isBuffer(rawBody)) {
    res.status(400).json({ error: 'Missing or unparseable request body' });
    return;
  }

  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(rawBody);
  const expected = `sha256=${hmac.digest('hex')}`;

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  next();
}
