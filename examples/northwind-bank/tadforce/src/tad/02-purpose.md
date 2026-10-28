# Purpose, scope and references {#ch-purpose}

## Purpose of the document {#purpose}

This document describes the technical architecture of the Northwind Bank CRM platform as implemented. It is the reference for:

- the understanding of the solution by the bank's teams;
- run, corrective and evolutive maintenance;
- architecture and security reviews;
- knowledge transfer between Acme Integrators, Northwind Bank and its partners.

It is written for architects, application owners, operations and security teams, and the developers who will make the platform evolve.

## Scope {#scope}

| Included | Excluded |
|---|---|
| The Salesforce organization of Northwind Bank (production): data model, application components, automation, OmniStudio, user interface, integrations seen from Salesforce, access model, delivery and operations | Business data; internals of the core banking system, the SMS gateway, the document store, the identity provider and the mobile app; internals of the Financial Services Cloud and OmniStudio packages |

## References {#references}

| Ref. | Document | Purpose |
|---|---|---|
| DR-01 | Metadata of the Northwind Bank organization, retrieved in read-only mode | Source of every inventory and figure of this document |
| DR-02 | Salesforce Well-Architected (architect.salesforce.com) | Reading grid of chapter 13 |
| DR-03 | Salesforce Integration Patterns and Practices | Classification of the integration flows |

> [!NOTE]
> Northwind Bank and Acme Integrators are fictional. This example shows what TADForce produces on a small org.

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
