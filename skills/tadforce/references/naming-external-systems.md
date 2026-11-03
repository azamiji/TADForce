# Naming external systems and imposing the client's terms

A wrong system name in a client document is the fastest way to lose the reader's trust. It happens when a name is inferred from a field (`LegacyCoreId__c`), a class (`CoreBankingClient`) or a host (`api-int-07.example`). TADForce forbids it.

## Where systems come from

`tadforce facts` groups the endpoints seen from Salesforce — named credentials, external credentials, remote sites, CSP trusted sites, auth providers, connected apps, call centers — and matches them with `knowledge/glossary.yml › systems`. Unmatched endpoints land in `facts/questions.json › systems`.

```yaml
systems:
  - id: core
    name: "Core banking"                         # exactly as the client says it
    description: "System of record for accounts and contracts"
    match: ["Core_API", "api.core.example.com"]   # component names or hosts (sub-domains match)
actors:
  - name: "Branch advisors"
    channel: "Branch console"
terms:
  - use: "API Gateway"
    avoid: ["API passerelle", "middleware"]
    definition: "Single entry point exposing the internal services."   # goes to the glossary appendix
allow: [customerId, offerCode]   # identifiers quoted on purpose that are not metadata (API payload fields…)
```

## Rules

1. Ask, with the evidence: host, named credential, the classes or Integration Procedures that call it.
2. Propose a name only when the host is unambiguous about a vendor (`*.twilio.com` → Twilio).
3. Data teams, middleware and gateways are systems too: name them as the client does (« DATA », « API Gateway »).
4. Inbound callers (connected apps, Apex REST) are systems as well: who calls `/leads/v1/*`?
5. Once named, use the name everywhere — text, tables, sequence participants, flowchart nodes, and the `external` participants of the understanding model (`understand.md`): the model validator rejects an external participant whose name is not in `glossary.yml › systems`. An endpoint still unnamed is shown by its component (the named credential), never by a guessed system name.
6. Terms with `avoid` are checked by `tadforce validate` (whole words, case-insensitive).
