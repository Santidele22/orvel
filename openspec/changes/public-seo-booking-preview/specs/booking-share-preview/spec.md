# Booking Share Preview Specification

## Purpose

Make public booking links preview as the **business** for non-JavaScript crawlers, while keeping the Angular PWA as the booking UX and keeping tenant URLs share-only (not a Google directory).

## Requirements

### Requirement: Resolved Booking Head Uses The Business Name

A non-JavaScript `GET` of `/booking/{slug}` MUST return HTML whose head describes the business when a public slug lookup returns a name. The title MUST be `{name} · Reservá turno | Orvel`. Canonical and Open Graph URLs MUST be `https://orvel.pro/booking/{slug}`. Robots on those tenant booking URLs MUST be `noindex, follow`.

#### Scenario: WhatsApp-style fetch sees the salon, not Orvel

- GIVEN a public booking slug whose lookup returns business name `Nails Nora`
- WHEN a non-JavaScript client performs `GET /booking/nails-nora`
- THEN the HTML `<title>` MUST be `Nails Nora · Reservá turno | Orvel`
- AND `og:title` MUST include `Nails Nora`
- AND canonical and `og:url` MUST be `https://orvel.pro/booking/nails-nora`
- AND the robots directive MUST be `noindex, follow`

#### Scenario: Closed account that still resolves keeps its public name

- GIVEN a slug whose public lookup still returns a business name for a closed account
- WHEN a non-JavaScript client performs `GET /booking/{slug}`
- THEN the head MUST use that returned name in title and Open Graph
- AND the response MUST NOT present a distinct closed-account “not found” share card

### Requirement: Privacy-Safe Booking Description

When a slug resolves to a name, the head description MUST be `{name}: reservá turno online.` and MAY append up to three **public active** service names. The description MUST NOT include prices. Crawler head content MAY include business `name`, slug, canonical `/booking/{slug}`, up to three public active service names, and the fallback Orvel Open Graph image. It MUST NOT include deposit alias or CBU, owner or support phone, emails, manage tokens, customer data, or closed-account internals beyond the public `name` the lookup already returns.

#### Scenario: Description lists at most three public services

- GIVEN a resolved business named `Nails Nora` with more than three public active services
- WHEN a non-JavaScript client fetches `/booking/{slug}`
- THEN `og:description` and the meta description MUST start with `Nails Nora: reservá turno online.`
- AND they MAY include at most three public active service names
- AND they MUST NOT include prices

#### Scenario: Privileged and customer fields never appear in the head

- GIVEN a resolved business whose public lookup payload also contains deposit alias, CBU, or owner phone
- WHEN a non-JavaScript client fetches `/booking/{slug}`
- THEN the HTML head MUST NOT contain deposit alias or CBU
- AND it MUST NOT contain owner or support phone numbers
- AND it MUST NOT contain emails, manage tokens, or customer data

#### Scenario: Preview uses only publicly readable data

- GIVEN a crawler request for `/booking/{slug}`
- WHEN the server builds the share head
- THEN it MUST use only publicly readable business and service data
- AND it MUST NOT load preview fields with privileged credentials

### Requirement: Unknown Slug Falls Back Without Breaking The SPA

An unknown booking slug MUST receive a generic Orvel head with `noindex`. The Angular booking SPA MUST still load. The unknown-slug share card MUST NOT be a distinct “not found” Open Graph identity.

#### Scenario: Unknown slug keeps a generic Orvel head and the PWA

- GIVEN a slug that public lookup does not resolve to a name
- WHEN a non-JavaScript client performs `GET /booking/{unknown}`
- THEN the HTML head MUST use a generic Orvel title
- AND robots MUST include `noindex`
- AND the document MUST still include the dashboard SPA shell so the PWA can load
- AND the response MUST NOT 404 the booking application

### Requirement: Nested Professional URLs Canonicalize To The Business

`/booking/{slug}/{professionalSlug}` MAY receive share-head handling, but canonical and Open Graph URLs MUST be the business URL `/booking/{slug}` on origin `https://orvel.pro`.

#### Scenario: Professional nested path does not become its own share URL

- GIVEN a resolved business slug `nails-nora` and a professional segment
- WHEN a non-JavaScript client performs `GET /booking/nails-nora/ana`
- THEN canonical MUST be `https://orvel.pro/booking/nails-nora`
- AND `og:url` MUST be `https://orvel.pro/booking/nails-nora`
- AND neither MUST be `https://orvel.pro/booking/nails-nora/ana`

### Requirement: Manage Booking URLs Are Not Tenant Previews

`/booking/manage` and manage URLs that identify the operator session by query token MUST be excluded from tenant share-head substitution. Those responses MUST keep the dashboard shell head and MUST still load the SPA.

#### Scenario: Manage path is not rewritten as a business card

- GIVEN path `/booking/manage`
- WHEN a non-JavaScript client requests it
- THEN the HTML head MUST NOT use a tenant business title pattern `{name} · Reservá turno | Orvel`
- AND the dashboard SPA shell MUST still load

#### Scenario: Manage query-token URLs are excluded

- GIVEN a `/booking` URL that carries a manage token in the query string
- WHEN a non-JavaScript client requests it
- THEN the HTML head MUST NOT be substituted with a tenant business preview
- AND manage tokens MUST NOT appear in canonical, Open Graph, or description tags

### Requirement: Share Head Changes Head Metadata Only

Share-head substitution MUST change only title, description, canonical, Open Graph, Twitter, and robots metadata. Scripts, the SPA mount, and PWA tags MUST remain intact. Checked-in dashboard `index.html` MUST keep static `<title>Orvel</title>` and `lang="es"`.

#### Scenario: Application shell tags survive crawler substitution

- GIVEN a resolved `GET /booking/{slug}`
- WHEN a non-JavaScript client inspects the HTML
- THEN scripts, the SPA root mount, and PWA tags MUST still be present
- AND only title, description, canonical, Open Graph, Twitter, and robots metadata MAY differ from the dashboard shell

#### Scenario: Dashboard source title contract stays locked

- GIVEN checked-in dashboard `index.html`
- WHEN this change ships
- THEN the static `<title>` in source MUST remain `Orvel`
- AND `lang` MUST remain `es`

### Requirement: Booking Share Image Matches Marketing

Booking Open Graph and Twitter images MUST use the same 1200×630 Orvel asset as marketing pages. They MUST NOT use `logo.png`.

#### Scenario: Booking og:image reuses the marketing asset

- GIVEN a `GET /booking/{slug}` HTML response
- WHEN a non-JavaScript client inspects `og:image` and `twitter:image`
- THEN both MUST reference the same 1200×630 Orvel asset used on marketing pages
- AND neither MUST reference `logo.png`

### Requirement: Tenant Slugs Are Not A Search Directory

Tenant booking URLs MUST remain share-only. They MUST NOT be added to the marketing sitemap. This change MUST NOT create a public business directory.

#### Scenario: Sitemap still has no tenant slugs

- GIVEN the marketing sitemap after this change
- WHEN a crawler reads its URL set
- THEN it MUST NOT contain `/booking/{slug}` entries for tenants

#### Scenario: Resolved tenant robots stay share-only

- GIVEN a resolved tenant booking URL
- WHEN a non-JavaScript client reads robots metadata
- THEN the directive MUST be `noindex, follow`
- AND it MUST NOT be `index, follow`

### Requirement: Booking UX Stays The Angular PWA

Human booking UX MUST remain the existing Angular PWA. This change MUST NOT Angular-SSR the dashboard and MUST NOT replace the booking body with a second marketing page.

#### Scenario: Operator share URL still opens the PWA

- GIVEN a customer or operator opens `/booking/{slug}` in a browser that executes JavaScript
- WHEN the application loads
- THEN the public booking PWA UX MUST be the same Angular booking surface as today
- AND the response MUST NOT require a separate booking page body for humans

### Requirement: Crawler GET Is Not The Unmodified Shell Title

A non-JavaScript `GET` of a resolved `/booking/{slug}` MUST NOT leave crawlers with only the static dashboard shell title `Orvel`. Hosting MUST apply share-head substitution before the booking path is indistinguishable from the unmodified SPA shell.

#### Scenario: Resolved slug is not advertised as Orvel

- GIVEN a slug whose public lookup returns a business name
- WHEN a non-JavaScript client performs `GET /booking/{slug}`
- THEN `<title>` MUST NOT be only `Orvel`
- AND `og:title` MUST NOT be only `Orvel`
