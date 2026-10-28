# @trileo/contracts

Neutral, versioned wire schemas for Trileo services. This package is build-time infrastructure and is not deployed as a service.

Edit only `schemas/v1/` and `subjects/v1.json`, then run `npm run generate`. Files under `generated/` are deterministic output.

Use the public package entry point from consumers. Do not deep-import generated internals or manually copy DTOs between services.

## Organization foundation

Organization-scoped operations use `OrganizationServiceRequest`, which adds a required
`organizationId` beside the trusted actor and correlation ID. The organization ID selects the
requested scope; it is not proof of membership. Main and Project must re-authorize each operation.
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
an invitation ID grants no authority. Requested member/collaborator roles are policy inputs,
never trusted actor roles.

Run `uv sync --frozen --extra dev` once, then `npm run check:generated`, `npm run verify`
and `npm run build`. CI runs those checks with Node 24 and Python 3.14. npm dependencies
remain pinned by the tracked package-lock.json.

