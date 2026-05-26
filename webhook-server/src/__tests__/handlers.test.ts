import request from 'supertest';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';

// --- Mocks ---
// Must be declared before any imports that load these modules

const mockNotify = jest.fn();
jest.mock('../notify', () => ({
  notify: mockNotify,
}));

// Mock the db module: provide a fake `prepare` that tracks inserts per (event_type, github_event_id)
const insertedEvents = new Set<string>();
const mockRun = jest.fn((eventType: string, eventId: string) => {
  const key = `${eventType}:${eventId}`;
  if (insertedEvents.has(key)) {
    return { changes: 0 };
  }
  insertedEvents.add(key);
  return { changes: 1 };
});
const mockPrepare = jest.fn(() => ({ run: mockRun }));
jest.mock('../../../db/client', () => ({
  db: {
    prepare: mockPrepare,
  },
}));

// --- App under test (imported after mocks) ---
import { createApp } from '../index';

// --- Helpers ---
const WEBHOOK_SECRET = 'test-secret';

function signPayload(secret: string, body: Buffer | string): string {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(body);
  return `sha256=${hmac.digest('hex')}`;
}

function loadFixture(name: string): string {
  return fs.readFileSync(path.join(__dirname, '../../fixtures', name), 'utf8');
}

describe('POST /webhook/github', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    process.env.GITHUB_WEBHOOK_SECRET = WEBHOOK_SECRET;
    process.env.NOTIFY_PHONE = '+5511999999999';
    insertedEvents.clear();
    mockNotify.mockClear();
    mockRun.mockClear();
    mockPrepare.mockClear();
    app = createApp();
  });

  afterEach(() => {
    delete process.env.GITHUB_WEBHOOK_SECRET;
    delete process.env.NOTIFY_PHONE;
  });

  // (a) valid HMAC returns 200
  it('returns 200 for a valid HMAC signature', async () => {
    const body = loadFixture('pr_opened.json');
    const sig = signPayload(WEBHOOK_SECRET, body);

    const res = await request(app)
      .post('/webhook/github')
      .set('x-hub-signature-256', sig)
      .set('x-github-event', 'pull_request')
      .set('content-type', 'application/json')
      .send(body);

    expect(res.status).toBe(200);
  });

  // (b) invalid HMAC returns 401
  it('returns 401 for an invalid HMAC signature', async () => {
    const body = loadFixture('pr_opened.json');

    const res = await request(app)
      .post('/webhook/github')
      .set('x-hub-signature-256', 'sha256=badhash')
      .set('x-github-event', 'pull_request')
      .set('content-type', 'application/json')
      .send(body);

    expect(res.status).toBe(401);
  });

  // (c) PR opened triggers notify() with correct message
  it('calls notify() with a message containing repo + PR number + title for PR opened', async () => {
    const body = loadFixture('pr_opened.json');
    const sig = signPayload(WEBHOOK_SECRET, body);

    await request(app)
      .post('/webhook/github')
      .set('x-hub-signature-256', sig)
      .set('x-github-event', 'pull_request')
      .set('content-type', 'application/json')
      .send(body);

    expect(mockNotify).toHaveBeenCalledTimes(1);
    const message: string = mockNotify.mock.calls[0][0];
    expect(message).toContain('namastex/github-monitor');
    expect(message).toContain('#42');
    expect(message).toContain('Add webhook support for GitHub events');
  });

  // Issue opened event calls notify() with message containing repo + issue number + title
  it('calls notify() with a message containing repo + issue number + title for issue opened', async () => {
    const body = loadFixture('issue_opened.json');
    const sig = signPayload(WEBHOOK_SECRET, body);

    await request(app)
      .post('/webhook/github')
      .set('x-hub-signature-256', sig)
      .set('x-github-event', 'issues')
      .set('content-type', 'application/json')
      .send(body);

    expect(mockNotify).toHaveBeenCalledTimes(1);
    const message: string = mockNotify.mock.calls[0][0];
    expect(message).toContain('namastex/github-monitor');
    expect(message).toContain('#7');
    expect(message).toContain('Webhook signature validation fails intermittently');
  });

  // (d) re-sending same PR fixture does NOT call notify() twice (dedup)
  it('does NOT call notify() twice when the same PR event is sent again (dedup)', async () => {
    const body = loadFixture('pr_opened.json');
    const sig = signPayload(WEBHOOK_SECRET, body);

    // First request
    await request(app)
      .post('/webhook/github')
      .set('x-hub-signature-256', sig)
      .set('x-github-event', 'pull_request')
      .set('content-type', 'application/json')
      .send(body);

    // Second request — same payload
    await request(app)
      .post('/webhook/github')
      .set('x-hub-signature-256', sig)
      .set('x-github-event', 'pull_request')
      .set('content-type', 'application/json')
      .send(body);

    // notify() should have been called exactly once
    expect(mockNotify).toHaveBeenCalledTimes(1);
  });

  // Security: malformed JSON returns 400, not 500
  it('returns 400 for malformed JSON body with valid HMAC', async () => {
    const body = 'not-json{{{';
    const sig = signPayload(WEBHOOK_SECRET, body);

    const res = await request(app)
      .post('/webhook/github')
      .set('x-hub-signature-256', sig)
      .set('x-github-event', 'pull_request')
      .set('content-type', 'application/json')
      .send(body);

    expect(res.status).toBe(400);
    expect(mockNotify).not.toHaveBeenCalled();
  });

  // Security: valid JSON but missing required fields returns 400
  it('returns 400 for valid JSON missing required payload fields', async () => {
    const body = JSON.stringify({ action: 'opened' }); // missing pull_request, repository
    const sig = signPayload(WEBHOOK_SECRET, body);

    const res = await request(app)
      .post('/webhook/github')
      .set('x-hub-signature-256', sig)
      .set('x-github-event', 'pull_request')
      .set('content-type', 'application/json')
      .send(body);

    expect(res.status).toBe(400);
    expect(mockNotify).not.toHaveBeenCalled();
  });

  // Security: null fields in payload return 400, not 500 (no null-dereference crash)
  it('returns 400 when pull_request field is null', async () => {
    const body = JSON.stringify({
      action: 'opened',
      number: 1,
      pull_request: null,
      repository: { full_name: 'owner/repo' },
    });
    const sig = signPayload(WEBHOOK_SECRET, body);

    const res = await request(app)
      .post('/webhook/github')
      .set('x-hub-signature-256', sig)
      .set('x-github-event', 'pull_request')
      .set('content-type', 'application/json')
      .send(body);

    expect(res.status).toBe(400);
    expect(mockNotify).not.toHaveBeenCalled();
  });

  // Security: unhandled event type does not echo back the event name
  it('returns 200 with no event name echoed for unknown event type', async () => {
    const body = loadFixture('pr_opened.json');
    const sig = signPayload(WEBHOOK_SECRET, body);

    const res = await request(app)
      .post('/webhook/github')
      .set('x-hub-signature-256', sig)
      .set('x-github-event', 'unknown_event_<script>alert(1)</script>')
      .set('content-type', 'application/json')
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('event');
  });
});
