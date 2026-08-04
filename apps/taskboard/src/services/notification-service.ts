import type { Logger } from '@hivelet/core';

export interface NotificationPayload {
  title: string;
  detail?: string;
}

export class NotificationService {
  private readonly sent: NotificationPayload[] = [];

  constructor(private readonly logger: Logger) {}

  notify(kind: string, payload: NotificationPayload): void {
    this.sent.push(payload);
    this.logger.log(`[notify:${kind}] ${payload.title}${payload.detail ? ' — ' + payload.detail : ''}`);
  }

  history(): readonly NotificationPayload[] {
    return [...this.sent];
  }
}
