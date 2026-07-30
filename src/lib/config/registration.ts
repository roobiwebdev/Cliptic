/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: REGISTRATION_OPEN
 *
 * WHAT:  Boolean indicating whether self-serve sign-up is allowed.
 * WHY:   Set NEXT_PUBLIC_REGISTRATION_OPEN=false to put the app in
 *        invitation-only mode; the auth.ts databaseHooks.user.create.before
 *        hook enforces this server-side as a last line of defense.
 * WHERE: Read by auth.ts (server gate) and the sign-up UI (hide form).
 */
export const REGISTRATION_OPEN =
  process.env['NEXT_PUBLIC_REGISTRATION_OPEN'] !== 'false'
