/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: ac, roles, Permission, permissions
 *
 * WHAT:  Derives the Better Auth organization access-control schema, the owner
 *        role, and ergonomic SCREAM_SNAKE permission constants from the
 *        RESOURCES registry.
 * WHY:   Single source of truth — adding a resource with `permissions: [...]`
 *        in RESOURCES auto-wires the statement, the owner-role grants, and the
 *        type union without touching this file.
 * WHERE: ac/roles imported by src/lib/better-auth/auth.ts and auth-client.ts;
 *        permission constants used across services, routers, and UI gating;
 *        depends on src/lib/resources.ts.
 */

/* Organization permission system — derived from RESOURCES.
 * Add a resource with `permissions: [...]` and the statement, owner role,
 * ergonomic constants, and type union all wire up automatically. */

import { createAccessControl } from 'better-auth/plugins/access'
import {
  defaultStatements,
  ownerAc,
} from 'better-auth/plugins/organization/access'
import {
  RESOURCE_ENTRIES,
  getOrganizationStatement,
  type Permission as DerivedPermission,
  type PermissionedResourceKey,
  type PermissionAction,
} from '@/lib/resources'

/* Better Auth's Statements constraint produces a union TS can't auto-collapse
 * to the target record shape when spreading defaultStatements (exact literal
 * tuples) with our derived statements (readonly string[]). Widening once here
 * is the documented escape hatch at the Better Auth boundary. */
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- documented Better Auth typing boundary
const organizationStatement = {
  ...defaultStatements,
  ...getOrganizationStatement(),
} as Record<string, readonly string[]>

/**
 * SOURCE OF TRUTH KEYWORDS: ac
 *
 * WHAT:  Better Auth AccessControl instance built from organizationStatement.
 * WHY:   Shared with both server (auth.ts) and client (auth-client.ts) so
 *        role checks are consistent on both sides of the wire.
 * WHERE: Imported by src/lib/better-auth/auth.ts and auth-client.ts.
 */
export const ac = createAccessControl(organizationStatement)

function buildOwnerRoleStatement(): Record<string, readonly string[]> {
  const ownerStatements: Record<string, readonly string[]> = {
    ...ownerAc.statements,
  }
  for (const [resource, actions] of Object.entries(getOrganizationStatement())) {
    ownerStatements[resource] = actions
  }
  return ownerStatements
}

/* The static owner role, auto-granted every action declared in RESOURCES.
 * Owners receive every verb you ever declare — never edit the owner grants
 * manually; add the verb to RESOURCES and it shows up here. */
const organizationOwner = ac.newRole(buildOwnerRoleStatement())

/**
 * SOURCE OF TRUTH KEYWORDS: roles
 *
 * WHAT:  Static role map passed to the organization plugin (currently just owner).
 * WHY:   Only `owner` is STATIC — every other member's permissions are stored
 *        as a JSON array on Member.role (dynamic per-org roles).
 * WHERE: Passed to organization() plugin in auth.ts and organizationClient() in auth-client.ts.
 */
export const roles = {
  owner: organizationOwner,
} as const

export type Permission = DerivedPermission

type CamelToScreamSnake<S extends string, Acc extends string = ''> =
  S extends `${infer Head}${infer Tail}`
    ? Head extends Uppercase<Head>
      ? Head extends Lowercase<Head>
        ? CamelToScreamSnake<Tail, `${Acc}${Head}`>
        : Acc extends ''
          ? CamelToScreamSnake<Tail, Head>
          : CamelToScreamSnake<Tail, `${Acc}_${Head}`>
      : CamelToScreamSnake<Tail, `${Acc}${Uppercase<Head>}`>
    : Acc

type PermissionConstants = {
  readonly [K in {
    [R in PermissionedResourceKey]: `${CamelToScreamSnake<R & string>}_${Uppercase<PermissionAction<R> & string>}`
  }[PermissionedResourceKey]]: Permission
}

function buildPermissionConstants(): PermissionConstants {
  const constants: Record<string, Permission> = {}
  for (const [resourceKey, def] of RESOURCE_ENTRIES) {
    if (!def.permissions) continue
    for (const action of def.permissions) {
      const constantName = `${resourceKey.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}_${action.toUpperCase()}`
      /* `action` widens to `string` because RESOURCE_ENTRIES is typed against
       * the broad `ResourceDefinition` shape (`permissions: readonly string[]`)
       * rather than each resource's `as const` tuple. The cast restores the
       * literal-union type that the runtime value always satisfies, since
       * `Permission` is generated from the same RESOURCES at the type level. */
      constants[constantName] = `${resourceKey}:${action}` as Permission
    }
  }
  /* The mapped-type narrowing of Record<string, Permission> to the fully-keyed
   * shape is a TS limitation — the loop above visits every required key by
   * construction (CamelToScreamSnake mirrors the runtime regex). */
  return constants as PermissionConstants
}

/**
 * SOURCE OF TRUTH KEYWORDS: permissions
 *
 * WHAT:  Frozen SCREAM_SNAKE record of every permission constant
 *        (e.g. `permissions.MEMBER_CREATE === 'member:create'`).
 * WHY:   Ergonomic, autocomplete-friendly access — prefer these over
 *        hand-typed `'resource:action'` literals at callsites.
 * WHERE: Imported by routers, services, and UI gating utilities.
 */
export const permissions: PermissionConstants = buildPermissionConstants()
