---
name: Bot package execution safety
description: Why uploaded bot archives stay inert until a separate isolated worker and official Meta setup exist.
---

## Rule
Never execute member-uploaded bot packages in the web or API process. Keep uploads private, label start actions and logs as simulation, and require a separately isolated persistent worker for real execution.

**Why:** A shared web/API process is not a sandbox for untrusted multi-user code; running packages there risks host data and other members.

**How to apply:** Any real-runtime work must execute out of process with resource, filesystem, and network limits, and return only safe status and logs to the app. Use official Facebook Page APIs, never personal profiles.