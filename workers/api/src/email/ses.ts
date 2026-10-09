/**
 * Transactional email via Amazon SES — the SOLE email rail for deskl.ink.
 *
 * Calls the SES v2 SendEmail API, SigV4-signed with the account's AWS credentials via aws4fetch
 * (Workers-native). The sending domain (deskl.ink) is a verified SES domain identity with EasyDKIM.
 */
import { AwsClient } from 'aws4fetch';
import type { Env } from '../env.js';

export interface SendEmailInput {
  from: string; // "deskl.ink <login@deskl.ink>"
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface SendEmailResult {
  ok: boolean;
  status: number;
  messageId?: string;
  error?: string;
}

/** Send one transactional email through SES. Never throws — returns a structured result to log. */
export async function sendEmail(env: Env, input: SendEmailInput): Promise<SendEmailResult> {
  const region = env.SES_REGION ?? 'us-east-1';
  const accessKeyId = env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = env.AWS_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    return { ok: false, status: 0, error: 'ses_not_configured' };
  }
  const aws = new AwsClient({ accessKeyId, secretAccessKey, region, service: 'ses' });
  try {
    const res = await aws.fetch(`https://email.${region}.amazonaws.com/v2/email/outbound-emails`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        FromEmailAddress: input.from,
        Destination: { ToAddresses: [input.to] },
        Content: {
          Simple: {
            Subject: { Data: input.subject, Charset: 'UTF-8' },
            Body: {
              Text: { Data: input.text, Charset: 'UTF-8' },
              Html: { Data: input.html, Charset: 'UTF-8' },
            },
          },
        },
      }),
    });
    if (res.ok) {
      const body = (await res.json().catch(() => ({}))) as { MessageId?: string };
      const result: SendEmailResult = { ok: true, status: res.status };
      if (body.MessageId) result.messageId = body.MessageId;
      return result;
    }
    return { ok: false, status: res.status, error: await res.text().catch(() => 'send_failed') };
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : 'ses_error' };
  }
}
