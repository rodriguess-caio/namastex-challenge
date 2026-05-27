import { Request, Response } from 'express';
import { db } from '../../../db/client';
import { notify } from '../notify';

interface PullRequestPayload {
  action: string;
  number: number;
  pull_request: {
    title: string;
    html_url: string;
    merged: boolean;
    node_id: string;
  };
  repository: {
    full_name: string;
  };
}

function isValidPayload(p: unknown): p is PullRequestPayload {
  if (!p || typeof p !== 'object') return false;
  const o = p as Record<string, unknown>;
  return (
    typeof o['action'] === 'string' &&
    typeof o['number'] === 'number' &&
    typeof o['pull_request'] === 'object' && o['pull_request'] !== null &&
    typeof (o['pull_request'] as Record<string, unknown>)['title'] === 'string' &&
    typeof (o['pull_request'] as Record<string, unknown>)['html_url'] === 'string' &&
    typeof (o['pull_request'] as Record<string, unknown>)['node_id'] === 'string' &&
    typeof o['repository'] === 'object' && o['repository'] !== null &&
    typeof (o['repository'] as Record<string, unknown>)['full_name'] === 'string'
  );
}

export function handlePullRequest(req: Request, res: Response): void {
  let raw: unknown;
  try {
    raw = JSON.parse((req.body as Buffer).toString('utf8'));
  } catch {
    res.status(400).json({ error: 'Invalid JSON payload' });
    return;
  }

  if (!isValidPayload(raw)) {
    res.status(400).json({ error: 'Malformed pull_request payload' });
    return;
  }

  const payload = raw;
  const { action, number, pull_request, repository } = payload;
  const repo = repository.full_name;
  const title = pull_request.title;
  const url = pull_request.html_url;
  const eventId = pull_request.node_id;

  let message: string;

  if (action === 'opened') {
    message = `[PR Opened] ${repo} #${number}: ${title}\n${url}`;
  } else if (action === 'closed' && pull_request.merged) {
    message = `[PR Merged] ${repo} #${number}: ${title}\n${url}`;
  } else if (action === 'closed' && !pull_request.merged) {
    message = `[PR Closed] ${repo} #${number}: ${title}\n${url}`;
  } else {
    res.status(200).json({ status: 'ignored' });
    return;
  }

  const insert = db.prepare(
    'INSERT OR IGNORE INTO notified_events (event_type, github_event_id) VALUES (?, ?)'
  );
  const result = insert.run('pull_request', `${action}:${eventId}`);

  if (result.changes > 0) {
    void notify(message); // fire-and-forget: don't block HTTP response
  }

  res.status(200).json({ status: 'ok' });
}
