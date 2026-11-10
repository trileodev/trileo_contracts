# @trileo/contracts

Neutral, versioned wire schemas for Trileo services. This package is build-time infrastructure and is not deployed as a service.

Edit only `schemas/v1/` and `subjects/v1.json`, then run `npm run generate`. Files under `generated/` are deterministic output.

Use the public package entry point from consumers. Do not deep-import generated internals or manually copy DTOs between services.

## Organization foundation

Organization-scoped operations use `OrganizationServiceRequest`, which adds a required
`organizationId` beside the trusted actor and correlation ID. The organization ID selects the
requested scope; it is not proof of membership. Main and Project must re-authorize each operation.

The envelope may also carry an optional `organizationRole` (`org_admin` | `member`). It is a
trusted membership fact with exactly one legitimate setter: the Gateway, which copies it from
Main's `organizations.get.v1` reply for that `organizationId` on every request. Main ignores any
`organizationRole` it receives and reads the role from its own membership table. Project relies on
it, and treats its absence as deny, on every subject whose envelope is `OrganizationServiceRequest`.
The AI service and every other publisher must never set it.
NATS has no publisher credentials yet, so this rule is enforced by review and a static check, not
by the transport. Organization context lives on this envelope; `ActorContext` is unchanged.
The existing `ServiceRequest` and owner-scoped `projects.*.v1` subjects remain unchanged.

The new `projects.*.v2` subjects use the existing project command/query payloads inside
`OrganizationServiceRequest` and return `OrganizationProjectResponse` (or
`OrganizationProjectsPageResponse` for list). The response includes the organization and the
actor's effective project role. Collaborator operations also use the organization envelope.

Organization create/list/get-personal, invitation list-mine and invitation acceptance use
`ServiceRequest`; Main resolves the scope from the authenticated user or invitation. Other
organization, membership and invitation operations use `OrganizationServiceRequest`. Responses
use the existing `ServiceResponse` wrapper. Removal/revocation operations return an empty data object.
Invitation acceptance must verify the actor's verified email matches the invitation; knowing
an invitation ID grants no authority. Requested member/collaborator roles in a payload are policy
inputs, never trusted actor roles; the only trusted organization role is the Gateway-set envelope
`organizationRole` described above.

## Organization members and invitations

Each subject's envelope, payload and reply `data` (inside `ServiceResponse`):

| Subject | Envelope | Payload | Reply `data` |
|---|---|---|---|
| `organizations.members.list.v1` | `OrganizationServiceRequest` | `ListOrganizationMembersQuery` | `OrganizationMembersPageResponse` |
| `organizations.members.get.v1` | `OrganizationServiceRequest` | `GetOrganizationMemberQuery` | `OrganizationMemberResponse` |
| `organizations.members.update.v1` | `OrganizationServiceRequest` | `UpdateOrganizationMemberCommand` | `OrganizationMemberResponse` |
| `organizations.members.remove.v1` | `OrganizationServiceRequest` | `RemoveOrganizationMemberCommand` | `{}` |
| `organizations.invitations.create.v1` | `OrganizationServiceRequest` with a required `idempotencyKey` | `CreateOrganizationInvitationCommand` | `OrganizationInvitationResponse` |
| `organizations.invitations.list.v1` | `OrganizationServiceRequest` | `ListOrganizationInvitationsQuery` | `OrganizationInvitationsPageResponse` |
| `organizations.invitations.revoke.v1` | `OrganizationServiceRequest` | `RevokeOrganizationInvitationCommand` | `{}` |
| `organizations.invitations.list-mine.v1` | `ServiceRequest` | `ListOrganizationInvitationsQuery` | `OrganizationInvitationsPageResponse` |
| `organizations.invitations.accept.v1` | `ServiceRequest` | `AcceptOrganizationInvitationCommand` | `OrganizationResponse` |
| `collaborators.purge-member.v1` | `InternalOrganizationCommandRequest` | `PurgeMemberCollaboratorsCommand` | `{}` |

`organizations.members.remove.v1` with the actor's own `userId` is how a member leaves. Page
responses carry `items` and an optional `nextCursor`; there is no total.

**Ordering, filtering and cursors.** A cursor is the `id` of the last item on the previous page.

- Members are ordered by `createdAt` ascending, then `id`. The cursor must be a membership `id` that
  currently exists in the requested organization; otherwise the reply is `400 VALIDATION_FAILED`
  with a `cursor` field error. That includes a member removed between pages, so the caller reloads
  from the first page.
- `organizations.invitations.list.v1` lists only **pending, unexpired** invitations of the
  organization, ordered by `expiresAt` ascending, then `id`. The cursor must be an invitation of
  this organization, in any status, so an invitation that is accepted, revoked or expires between
  pages does not break the next page. Any other cursor is `400 VALIDATION_FAILED`.
- `organizations.invitations.list-mine.v1` lists only **pending, unexpired** invitations addressed
  to the actor's verified email, excluding organizations the actor already belongs to, ordered by
  `expiresAt` ascending, then `id`. The cursor must be an invitation addressed to the actor's
  email, in any status. Any other cursor is `400 VALIDATION_FAILED`.

**Error codes.** Callers branch on `code`, never on `message`. New codes:

| Code | Status | `retryable` | When |
|---|---|---|---|
| `FORBIDDEN` | 403 | false | A `member` attempts an admin-only action; returned only after membership is confirmed |
| `ORGANIZATION_IS_PERSONAL` | 409 | false | Any invitation operation (list included), role change or removal on a personal organization |
| `LAST_ORGANIZATION_ADMIN` | 409 | false | The change would leave the organization with no `org_admin` |
| `ORGANIZATION_ALREADY_MEMBER` | 409 | false | Inviting a member's email; accepting while already a member (other than a replay of the same accept) |
| `ORGANIZATION_INVITATION_ALREADY_PENDING` | 409 | false | A pending, unexpired invitation exists for that email in that organization |
| `ORGANIZATION_INVITATION_NOT_PENDING` | 409 | false | Revoking or accepting an invitation that is accepted, revoked or expired |
| `ORGANIZATION_INVITATION_LIMIT_REACHED` | 429 | false | An invitation cap is reached; it eases only with time, a revocation or an expiry |
| `MEMBERSHIP_CLEANUP_PENDING` | 409 | true while the clean-up is in progress; false once it has failed | Accepting while the collaborator clean-up from an earlier removal of that user is unfinished |

These operations also use the existing `RESOURCE_NOT_FOUND` (a non-member and an unknown
organization, member or invitation look the same), `VALIDATION_FAILED` (including bad cursors),
`IDEMPOTENCY_CONFLICT` and `EMAIL_NOT_VERIFIED`.

**`InternalOrganizationCommandRequest`.** A service-to-service command envelope with no end-user
actor. It carries `version`, `correlationId`, an optional `causationId`, `organizationId` and
`payload`, and nothing else: no `actor`, no `organizationRole` and no `idempotencyKey`. Only the
Gateway builds an `ActorContext`, so a worker that acts with no user session uses this envelope
instead of inventing one. Each subject that uses it names exactly one publishing service. For
`collaborators.purge-member.v1` that service is **Main**: after a member is removed or leaves,
Main's relay asks Project to delete that user's collaborator rows on projects in `organizationId`.
Project re-scopes the delete by `organizationId`, treats zero deleted rows as success (the command
is idempotent and may be sent more than once), and accepts this subject only in this envelope.
NATS has no publisher credentials yet (D27), so the single-publisher rule is enforced by review and
a static check, not by the transport.

## Project uploads

### Write side (W4, D50)

Bytes travel Gateway → Project over NATS request-reply; Project is the only subscriber and the
Gateway the only publisher. All three use `OrganizationServiceRequest`.

| Subject | Payload → reply | Notes |
|---|---|---|
| `uploads.create.v1` | `CreateUploadCommand` → `UploadResponse` (`pending`) | Declares name, media type, size and SHA-256. **`idempotencyKey` is required by Project** (the shared envelope leaves it optional, so the schema cannot); a replay returns the same upload |
| `uploads.parts.put.v1` | `PutUploadPartCommand` → `UploadPartResponse` | One part: `partNumber` 1–160, `data` canonical padded base64 of at most 524,288 bytes (699,052 characters). Parts are sent in order; a part may be re-sent |
| `uploads.complete.v1` | `CompleteUploadCommand` → `UploadResponse` | `partCount` 1–160. Project assembles, checks size, hash and sniffed type, and ends the upload `ready` or `rejected` |

The browser never sees parts: it sends a JSON declare and then the raw bytes in one `PUT …/content`,
which the Gateway cuts into parts. The Gateway re-reads the caller's organization role before
`complete` (D53). At most 5 `pending` or `ready` uploads per project (D52); the stale-upload reaper
ends abandoned `pending` uploads as `failed` / `UPLOAD_EXPIRED`. No payload carries an organization,
uploader, status or storage field.

### Read side

`uploads.get.v1` (`GetUploadQuery` → `UploadResponse`) and `uploads.list.v1`
(`ListUploadsQuery` → `UploadsPageResponse`) use `OrganizationServiceRequest`. No service serves
or calls them yet; the first consumer is W8. Lists are ordered by `createdAt` descending,
then `id` descending; without a `status` filter every status is listed.

- `UploadResponse` never carries the storage driver or storage key (`additionalProperties: false`).
  Where bytes are stored is internal to Project.
- `organizationId`, `uploadedByUserId`, `status`, `statusReasonCode` and `readyAt` are
  server-decided. Clients never supply them.
- `MediaType` is a format, not an enum: the allowed list is `UPLOAD_ALLOWED_TYPES` config.
- `statusReasonCode` is a format, not an enum, so new codes need no contract change. A `pending`
  upload has neither `readyAt` nor a reason code; `ready` has `readyAt` and no reason code;
  `rejected` and `failed` have a reason code and no `readyAt`. Initial codes:

| Status | Code | Meaning |
|---|---|---|
| `rejected` | `TYPE_NOT_ALLOWED` | The sniffed type is not in `UPLOAD_ALLOWED_TYPES` |
| `rejected` | `TYPE_MISMATCH` | The sniffed type differs from the declared `mediaType` |
| `rejected` | `SIZE_LIMIT_EXCEEDED` | Over `UPLOAD_MAX_FILE_BYTES` |
| `rejected` | `SIZE_MISMATCH`, `HASH_MISMATCH` | The received bytes differ from the declaration |
| `failed` | `STORAGE_ERROR` | The storage driver failed |
| `failed` | `UPLOAD_EXPIRED` | The stale-upload reaper ended a `pending` upload |

These codes and their user-facing copy are unchanged by W4.

## Project sandboxes (2.1)

Project service is the only subscriber and the only owner of the sandbox lifecycle. All three
subjects use `OrganizationServiceRequest` and reply `SandboxResponse` inside `ServiceResponse`.

| Subject | Payload | Notes |
|---|---|---|
| `sandboxes.get.v1` | `GetSandboxQuery` | Reads the stored state. A project that was never started answers `not_provisioned` and nothing is created |
| `sandboxes.start.v1` | `StartSandboxCommand` | Sets the desired state to running and replies at once with the stored state; the first start of a project answers `provisioning` |
| `sandboxes.stop.v1` | `StopSandboxCommand` | Sets the desired state to stopped and replies at once; a project with no sandbox answers `not_provisioned` |

**Publisher.** The intended publisher is the Gateway, which forwards `organizationRole`; Project
treats its absence as deny. No Gateway route exists yet, so today only tests and the cluster
acceptance script publish these subjects. The AI service, Main and Frontend must never name them;
AI → Project sandbox calls will get their own subject family (D27).

**Payloads and trust.** Each payload is `{ projectId }` and nothing else: no organization (it is in
the envelope), namespace, object name, image, replicas, resources, runtime class, node or status.
`SandboxResponse` never carries a Service or DNS name, IP, port, node, pod, image or namespace;
Project derives the address from the project ID internally. `idempotencyKey` is not required:
start and stop are idempotent by desired state, and a key, if sent, is ignored.

**Polling.** Start and stop never wait on the cluster. `generation` is the operation identifier:
it rises by one on every change of desired state and on every new start after `failed`, and a
repeated start or stop returns the same generation. Poll `sandboxes.get.v1` until the status for
that generation is final (`running`, `stopped` or `failed`).

**Statuses.** `not_provisioned` (never stored; `generation` 0, reason code and timestamps null),
`provisioning`, `starting`, `running`, `stopping`, `stopped`, `failed`. Any stored status has
`generation` ≥ 1. The set already covers 2.2's hibernation; a new value would need a `.v2`
subject. Cluster trouble is never a synchronous error: it is `failed` with a reason code.

**Reason codes.** `statusReasonCode` is a format (`^[A-Z][A-Z0-9_]{1,63}$` with the strict
ending), not an enum, so new codes need no contract change. `failed` always has one. Initial codes:

| Status | Code | Meaning |
|---|---|---|
| `failed` | `IMAGE_PULL_FAILED` | The sandbox image could not be pulled |
| `failed` | `CAPACITY_UNAVAILABLE` | No room for the sandbox (unschedulable, quota exceeded, storage not bound in time) |
| `failed` | `RUNTIME_UNAVAILABLE` | The isolated runtime is missing or could not create the sandbox |
| `failed` | `START_FAILED` | The sandbox process crashed before it was ready |
| `failed` | `CLUSTER_UNAVAILABLE` | The cluster stayed unreachable past the deadline |
| `failed` | `PROVISION_TIMEOUT`, `START_TIMEOUT` | First provisioning, or a later start, passed its deadline with no other cause |
| `starting` | `RESTARTING` | The running sandbox lost readiness (crash, eviction, node restart) and is coming back |
| `stopping`, `stopped` | `USER_REQUESTED` | Stopped by `sandboxes.stop.v1` |
| `stopping`, `stopped` | `PROJECT_ARCHIVED` | The project was archived; restoring it does not start the sandbox |
| `stopping`, `stopped` | `IDLE` | Reserved for 2.2's hibernation; never set in 2.1 |

**Error codes.** New: `SANDBOX_RUNTIME_DISABLED` (503, `retryable: false`: start or stop while the
runtime is turned off; get still answers) and `SANDBOX_LIMIT_REACHED` (409, `retryable: false`:
the organization already has its maximum of live sandboxes). Reused: `VALIDATION_FAILED` (including
any other envelope or an extra payload field), `RESOURCE_NOT_FOUND`, `FORBIDDEN`, `INTERNAL_ERROR`.

**Screen mapping (for S5, 2.2/2.7/2.8).** `not_provisioned` and `provisioning` → setting up a new
project; `stopped` and `stopping` → sleeping; `starting` → waking; `running` → ready; `failed` →
couldn't wake.

Run `uv sync --frozen --extra dev` once, then `npm run check:generated`, `npm run verify`
and `npm run build`. CI runs those checks with Node 24 and Python 3.14. npm dependencies
remain pinned by the tracked package-lock.json.

