# Security policy

TADForce reads Salesforce orgs. Its security model is part of the product:

- **Read-only CLI calls.** Every Salesforce CLI command goes through an allow-list (`src/sf/sf.js`): listing, display, browser login, metadata listing, retrieve and queries only.
- **No business data.** SOQL is limited to org configuration objects and aggregates (`COUNT()`, `MAX(CreatedDate)`, grouped counts of users and assignments).
- **Isolated snapshot.** Metadata is retrieved into `tadforce/.snapshot` (git-ignored); the project's `force-app` is never modified.
- **No secrets in documents.** Credentials are never retrieved; `tadforce validate` blocks tokens, passwords, private keys and org IDs.
- **Local rendering.** HTML, PDF and DOCX are produced locally with your own browser; nothing is uploaded by TADForce.

Your AI agent sees the metadata and the documents it writes: choose an agent and a plan whose data policy fits your client's requirements.

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's *Report a vulnerability* (Security tab) or contact the maintainer privately. You will get an answer within 7 days.
