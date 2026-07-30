/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: getRequestForensics, ForensicData
 *
 * WHAT:  Captures the client IP and user-agent for audit-log forensic fields.
 * WHY:   ipAddress / userAgent are WRITE-ONLY — recorded for incident response
 *        but never returned by service-layer selects (see AUDIT_LOG_SAFE_SELECT).
 * WHERE: Called by the auto-audit path in protectedProcedure; depends on
 *        getClientIp from src/lib/rate-limit.ts.
 */

import 'server-only'
import { headers } from 'next/headers'
import { getClientIp } from '@/lib/rate-limit'

export interface ForensicData {
  ipAddress: string | null
  userAgent: string | null
}

/* Audit-log forensic capture. ipAddress / userAgent are write-only — never
 * returned by service-layer selects (see AUDIT_LOG_SAFE_SELECT). */
export async function getRequestForensics(): Promise<ForensicData> {
  const requestHeaders = await headers()
  const rawUserAgent = requestHeaders.get('user-agent')
  const userAgent = rawUserAgent && rawUserAgent.length > 0 ? rawUserAgent : null
  return {
    ipAddress: getClientIp(requestHeaders),
    userAgent,
  }
}
