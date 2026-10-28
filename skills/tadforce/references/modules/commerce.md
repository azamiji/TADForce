# Commerce (B2B / D2C on Lightning, B2C Commerce connector, Order Management)

**Detected by** `WebStore`, `WebCart`, `ProductCatalog`, `BuyerGroup`, `BuyerAccount`, entitlement policies; Order Management by `OrderSummary`, `FulfillmentOrder`, `ReturnOrder`.

## Document

| Chapter | What |
|---|---|
| 5 Functional | Buyer journey (browse, search, cart, checkout, payment, order), account management, reorder; order lifecycle (summary, fulfilment, returns, refunds) |
| 6 Data | Catalog and categories, products and price books, buyer groups and entitlements, carts, orders and order summaries |
| 8 UI | Store site (LWR template, components), search configuration, guest browsing |
| 9 Integrations | Checkout integrations (pricing, inventory, shipping, tax, payment gateway), ERP for orders and stock, product information management |
| 10 Security | Buyer licences, store guest access, payment data never stored in Salesforce |

## Read

`objects/WebStore` and commerce objects, store `experiences`/`digitalExperiences`, Apex classes implementing commerce extension points (`commercestorefront`, `sfdc_checkout.*` interfaces), named credentials of payment and tax providers, flows of the checkout.

## Draw

Sequence of checkout with each external call; state diagram of the order summary.

## Watch out

B2C Commerce (Salesforce Commerce Cloud on its own platform) is a separate system: treat it as an external system unless the documents say otherwise.
