import express from 'express';
import { hmacMiddleware } from './middleware/hmac';
import { handlePullRequest } from './handlers/pull-request';
import { handleIssue } from './handlers/issue';

export function createApp(): express.Application {
  const app = express();

  // Raw body required for HMAC validation; 1mb limit prevents payload-based OOM
  app.use(express.raw({ type: '*/*', limit: '1mb' }));

  app.post(
    '/webhook/github',
    hmacMiddleware,
    (req: express.Request, res: express.Response) => {
      const event = req.headers['x-github-event'] as string | undefined;

      if (event === 'pull_request') {
        handlePullRequest(req, res);
      } else if (event === 'issues') {
        handleIssue(req, res);
      } else {
        res.status(200).json({ status: 'ignored' });
      }
    }
  );

  return app;
}

if (require.main === module) {
  const PORT = parseInt(process.env.PORT ?? '3001', 10);
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`Webhook server listening on port ${PORT}`);
  });
}
