import { Request, Response } from 'express';
import { db } from '../../../db/client';
import { notify } from '../notify';

interface IssuePayload {
  action: string;
  issue: {
    number: number;
    title: string;
    html_url: string;
    node_id: string;
  };
  repository: {
    full_name: string;
  };
}

function isValidPayload(p: unknown): p is IssuePayload {
  if (!p || typeof p !== 'object') return false;
  const o = p as Record<string, unknown>;
  return (
    typeof o['action'] === 'string' &&
    typeof o['issue'] === 'object' && o['issue'] !== null &&
    typeof (o['issue'] as Record<string, unknown>)['number'] === 'number' &&
    typeof (o['issue'] as Record<string, unknown>)['title'] === 'string' &&
    typeof (o['issue'] as Record<string, unknown>)['html_url'] === 'string' &&
    typeof (o['issue'] as Record<string, unknown>)['node_id'] === 'string' &&
    typeof o['repository'] === 'object' && o['repository'] !== null &&
    typeof (o['repository'] as Record<string, unknown>)['full_name'] === 'string'
  );
}

export function handleIssue(req: Request, res: Response): void {
  let raw: unknown;
  try {
    raw = JSON.parse((req.body as Buffer).toString('utf8'));
  } catch {
    res.status(400).json({ error: 'Invalid JSON payload' });
    return;
  }

  if (!isValidPayload(raw)) {
    res.status(400).json({ error: 'Malformed issues payload' });
    return;
  }

  const payload = raw;
  const { action, issue, repository } = payload;
  const repo = repository.full_name;
  const title = issue.title;
  const url = issue.html_url;
  const eventId = issue.node_id;

  let message: string;

  if (action === 'opened') {
    message = `[Issue Opened] ${repo} #${issue.number}: ${title}\n${url}`;
  } else if (action === 'closed') {
    message = `[Issue Closed] ${repo} #${issue.number}: ${title}\n${url}`;
  } else {
    res.status(200).json({ status: 'ignored' });
    return;
  }

  const insert = db.prepare(
    'INSERT OR IGNORE INTO notified_events (event_type, github_event_id) VALUES (?, ?)'
  );
  const result = insert.run('issues', `${action}:${eventId}`);

  if (result.changes > 0) {
    void notify(message); // fire-and-forget: don't block HTTP response
  }

  res.status(200).json({ status: 'ok' });
}
