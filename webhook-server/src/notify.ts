import { spawnSync } from 'child_process';

const E164_RE = /^\+[1-9]\d{7,14}$/;

export function notify(message: string): void {
  const phone = process.env.NOTIFY_PHONE;
  const omniInstance = process.env.OMNI_INSTANCE;
  const omniApiUrl = process.env.OMNI_API_URL ?? 'http://localhost:8882';
  const omniApiKey = process.env.OMNI_API_KEY;

  if (!phone) {
    console.error('[notify] NOTIFY_PHONE env var is not set');
    return;
  }

  if (!E164_RE.test(phone)) {
    console.error('[notify] NOTIFY_PHONE is not a valid E.164 number:', phone);
    return;
  }

  if (!omniApiKey) {
    console.error('[notify] OMNI_API_KEY env var is not set');
    return;
  }

  const payload = JSON.stringify({
    to: phone,
    text: message,
    ...(omniInstance ? { instanceId: omniInstance } : {}),
  });

  const result = spawnSync(
    'curl',
    [
      '-s', '-S', '-X', 'POST',
      `${omniApiUrl}/api/v2/messages/send`,
      '-H', 'Content-Type: application/json',
      '-H', `Authorization: Bearer ${omniApiKey}`,
      '-d', payload,
    ],
    { encoding: 'utf8' },
  );

  if (result.error) {
    console.error('[notify] Failed to spawn curl:', result.error.message);
  } else if (result.status !== 0) {
    console.error('[notify] curl exited with status', result.status, result.stderr);
  } else {
    console.log('[notify] Omni response:', result.stdout);
  }
}
