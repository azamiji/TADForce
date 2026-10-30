# Purpose, scope and references {#ch-purpose}

## Purpose of the document {#purpose}

<!-- tad:pending purpose.object -->

## Scope {#scope}

<!-- tad:pending purpose.scope -->

## References {#references}

<!-- tad:pending purpose.references -->

## Method {#method}

<!-- tad:if source.local -->
This document describes the architecture **as implemented** in the Salesforce DX project of {{cfg:client.name}}, as of {{cfg:document.date}}. It was produced from the metadata sources of the project
<!-- tad:else -->
This document describes the architecture **as implemented** in the Salesforce organization of {{cfg:client.name}} ({{cfg:document.environment}}), as of {{cfg:document.date}}. It was produced from the metadata of the organization, retrieved in read-only mode,
<!-- tad:endif -->
<!-- tad:if cfg.integrator.name -->
and from the inputs provided by {{cfg:client.name}} and {{cfg:integrator.name}}.
<!-- tad:else -->
and from the inputs provided by {{cfg:client.name}}.
<!-- tad:endif -->

<!-- tad:if cfg.scope.include -->
- Inventories and counts cover the components of the project scope (see Document control); standard objects and organization-wide settings are shared with the rest of the organization. Components delivered by managed packages or shipped by Salesforce are excluded.
<!-- tad:else -->
- Inventories and counts cover the components built for {{cfg:client.name}}. Components delivered by managed packages or shipped by Salesforce are excluded.
<!-- tad:endif -->
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
