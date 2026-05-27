const E164_RE = /^\+[1-9]\d{7,14}$/;

export async function notify(message: string): Promise<void> {
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

  const payload = {
    to: phone,
    text: message,
    ...(omniInstance ? { instanceId: omniInstance } : {}),
  };

  try {
    const response = await fetch(`${omniApiUrl}/api/v2/messages/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${omniApiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error('[notify] Omni returned', response.status, body);
    } else {
      console.log('[notify] Message sent successfully');
    }
  } catch (err) {
    console.error('[notify] Failed to send message:', err instanceof Error ? err.message : String(err));
  }
}
