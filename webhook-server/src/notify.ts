import { spawnSync } from 'child_process';

const E164_RE = /^\+[1-9]\d{7,14}$/;
const HTTP_RE = /^https?:\/\//;

export function notify(message: string): void {
  const phone = process.env.NOTIFY_PHONE;
  const omniInstance = process.env.OMNI_INSTANCE;
  const omniApiUrl = process.env.OMNI_API_URL ?? 'http://localhost:8882';

  if (!phone) {
    console.error('[notify] NOTIFY_PHONE env var is not set');
    return;
  }

  if (!E164_RE.test(phone)) {
    console.error('[notify] NOTIFY_PHONE is not a valid E.164 number:', phone);
    return;
  }

  const args = ['send', '--to', phone, '--text', message];
  if (omniInstance) {
    args.unshift('--instance', omniInstance);
  }

  const result = spawnSync('omni', args, {
    env: { ...process.env, OMNI_API_URL: omniApiUrl },
    encoding: 'utf8',
  });

  if (result.error) {
    console.error('[notify] Failed to spawn omni:', result.error.message);
  } else if (result.status !== 0) {
    console.error('[notify] omni exited with status', result.status, result.stderr);
  }
}
