# Purpose, scope and references {#ch-purpose}

## Purpose of the document {#purpose}

<!-- tad:pending purpose.object -->

## Scope {#scope}

<!-- tad:pending purpose.scope -->

## References {#references}

<!-- tad:pending purpose.references -->

## Method {#method}

This document describes the architecture **as implemented** in the Salesforce organization of {{cfg:client.name}} ({{cfg:document.environment}}), as of {{cfg:document.date}}. It was produced from the metadata of the organization, retrieved in read-only mode, and from the inputs provided by {{cfg:client.name}} and {{cfg:integrator.name}}.

- Inventories and counts cover the components built for {{cfg:client.name}}. Components delivered by managed packages and unused standard samples are excluded.
- Each statement relies on the metadata, on a document provided by the project, or is explicitly marked as to be confirmed.
- Authentication parameters (identifiers, secrets, certificates) and business data are never reproduced.

<!-- tad:if facts.exclusions.applied -->
The following components exist in the organization but are outside the documented architecture:

@@ANNEX:exclusions@@
<!-- tad:endif -->

## Reading conventions {#conventions}

- Technical names (objects, fields, classes, flows, components) are written in monospace, for example `Account`. Business labels are written in quotes, for example « Customer ».
- Salesforce terms in common use (Lead, Queue, Record Type, Permission Set, Named Credential…) are kept as is.
- Diagrams share one colour code:

@@ANNEX:legend@@
