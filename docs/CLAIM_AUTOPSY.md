# Superseded Sprint 11 Draft

This document described the earlier row-mutation prototype and is **not** the current API or deployment design.

For the immutable event-sourced architecture, schema, API, replay, compensation and migration policy use **[CLAIM_AUTOPSY_ARCHITECTURE.md](CLAIM_AUTOPSY_ARCHITECTURE.md)**.

The earlier 0014 schema must not be overwritten on any database where it was already applied. Prepare a forward-only migration for such environments.
