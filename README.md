# @trileo/contracts

Neutral, versioned wire schemas for Trileo services. This package is build-time infrastructure and is not deployed as a service.

Edit only `schemas/v1/` and `subjects/v1.json`, then run `npm run generate`. Files under `generated/` are deterministic output.

Use the public package entry point from consumers. Do not deep-import generated internals or manually copy DTOs between services.

