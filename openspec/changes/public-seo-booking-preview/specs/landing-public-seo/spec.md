# Landing Public SEO Specification

## Purpose

Make Orvel’s public marketing surface on `https://orvel.pro` crawlable and shareable as the page being viewed, without indexing private app surfaces or turning tenant booking slugs into a directory.

## Requirements

### Requirement: Per-URL Canonical And Open Graph URL

Every Layout-backed landing page MUST emit a self-referential canonical URL and `og:url` for the requested path using production origin `https://orvel.pro`. Non-home pages MUST NOT advertise `https://orvel.pro/` as their canonical or `og:url`.

#### Scenario: Home self-describes as the homepage

- GIVEN the landing home path `/`
- WHEN a non-JavaScript client requests that path
- THEN the HTML MUST include a canonical URL of `https://orvel.pro/`
- AND `og:url` MUST be `https://orvel.pro/`

#### Scenario: Plan page does not inherit the homepage URL

- GIVEN the landing path `/plan`
- WHEN a non-JavaScript client requests that path
- THEN the HTML MUST include a canonical URL of `https://orvel.pro/plan`
- AND `og:url` MUST be `https://orvel.pro/plan`
- AND neither value MUST be the homepage URL `https://orvel.pro/`

#### Scenario: Terms page self-canonicalizes

- GIVEN the landing path `/terminos-y-condiciones`
- WHEN a non-JavaScript client requests that path
- THEN the HTML MUST include a canonical URL of `https://orvel.pro/terminos-y-condiciones`
- AND `og:url` MUST be `https://orvel.pro/terminos-y-condiciones`

#### Scenario: Lanzamiento stays self-canonical

- GIVEN the landing path `/lanzamiento`
- WHEN a non-JavaScript client requests that path
- THEN the page MUST remain reachable without a 301 to `/`
- AND the HTML MUST include a canonical URL of `https://orvel.pro/lanzamiento`
- AND `og:url` MUST be `https://orvel.pro/lanzamiento`

### Requirement: Landing Language And Locale

Landing HTML MUST declare `lang="es-AR"` and Open Graph locale `es_AR`. This change MUST NOT alter dashboard shell language.

#### Scenario: Marketing documents use Argentine Spanish

- GIVEN a Layout-backed marketing page
- WHEN a non-JavaScript client requests it
- THEN the document language MUST be `es-AR`
- AND Open Graph locale MUST be `es_AR`

#### Scenario: Dashboard shell language is unchanged

- GIVEN checked-in dashboard `index.html`
- WHEN this change ships
- THEN that document MUST remain `lang="es"`

### Requirement: Marketing Robots File

The marketing origin MUST expose `robots.txt` that disallows private app surfaces and does not present tenant booking URLs as an indexable directory.

#### Scenario: Private surfaces are disallowed

- GIVEN `https://orvel.pro/robots.txt`
- WHEN a crawler fetches it
- THEN the file MUST disallow `/billing`
- AND it MUST disallow `/auth`
- AND it MUST disallow `/dashboard`
- AND it MUST disallow `/booking/manage`

### Requirement: Marketing-Only Sitemap

The marketing origin MUST expose a sitemap that lists only the public marketing URLs `/`, `/plan`, and `/terminos-y-condiciones`. The sitemap MUST NOT list `/lanzamiento`, tenant `/booking/{slug}` URLs, or private app surfaces.

#### Scenario: Sitemap contains only marketing URLs

- GIVEN the marketing sitemap
- WHEN a crawler reads its URL set
- THEN it MUST include `/` (or `https://orvel.pro/`)
- AND it MUST include `/plan`
- AND it MUST include `/terminos-y-condiciones`
- AND it MUST NOT include `/lanzamiento`
- AND it MUST NOT include any `/booking/{slug}` URL
- AND it MUST NOT include `/billing`, `/auth`, `/dashboard`, or `/booking/manage`

### Requirement: Billing And Auth Pages Are Not Indexed

`/billing/subscription` MUST send `noindex, nofollow`. Any leftover auth Layout pages MUST also send `noindex, nofollow`.

#### Scenario: Subscription billing is excluded from search

- GIVEN the path `/billing/subscription`
- WHEN a non-JavaScript client requests it
- THEN the HTML robots directive MUST be `noindex, nofollow`

#### Scenario: Leftover auth Layout pages are excluded from search

- GIVEN a leftover auth Layout page on the landing origin
- WHEN a non-JavaScript client requests it
- THEN the HTML robots directive MUST be `noindex, nofollow`

### Requirement: One H1 On Lanzamiento And Plan

`/lanzamiento` and `/plan` MUST each expose exactly one `h1`. Extra headings that currently compete as `h1` MUST be demoted so only one `h1` remains.

#### Scenario: Lanzamiento has a single H1

- GIVEN the path `/lanzamiento`
- WHEN a non-JavaScript client requests it
- THEN the HTML MUST contain exactly one `h1`

#### Scenario: Plan has a single H1

- GIVEN the path `/plan`
- WHEN a non-JavaScript client requests it
- THEN the HTML MUST contain exactly one `h1`

### Requirement: Custom Marketing 404

Unknown marketing paths MUST receive a custom landing 404 document rather than an unbranded empty response.

#### Scenario: Unknown marketing path returns a custom 404

- GIVEN a path that is not a defined landing route
- WHEN a client requests it on the marketing origin
- THEN the response MUST be HTTP 404
- AND the body MUST be the landing custom 404 document

### Requirement: Home-Only Organization And Software JSON-LD

The home path MUST include Organization and SoftwareApplication JSON-LD. Other landing pages MUST NOT inherit homepage identity JSON-LD.

#### Scenario: Home includes both JSON-LD types

- GIVEN the landing home path `/`
- WHEN a non-JavaScript client requests it
- THEN the HTML MUST include JSON-LD for Organization
- AND it MUST include JSON-LD for SoftwareApplication

#### Scenario: Non-home pages do not inherit homepage JSON-LD

- GIVEN a non-home Layout-backed path such as `/plan`
- WHEN a non-JavaScript client requests it
- THEN the HTML MUST NOT present Organization or SoftwareApplication JSON-LD that identifies the page as the Orvel homepage

### Requirement: Shared 1200 By 630 Open Graph Image

Marketing Open Graph and Twitter images MUST use one Orvel image whose dimensions are 1200×630. The 800×400 wordmark `logo.png` MUST NOT be used as `og:image` or `twitter:image`.

#### Scenario: Marketing share image is the 1200 by 630 asset

- GIVEN a Layout-backed marketing page
- WHEN a non-JavaScript client inspects Open Graph and Twitter image tags
- THEN `og:image` MUST reference the shared 1200×630 Orvel asset
- AND `twitter:image` MUST reference that same asset
- AND neither tag MUST reference `logo.png`

### Requirement: Footer Instagram Profile URL

The landing footer Instagram control MUST point at the Orvel Instagram profile.

#### Scenario: Footer Instagram is a real profile URL

- GIVEN a Layout-backed marketing page that renders the footer
- WHEN a client inspects the Instagram footer link
- THEN `href` MUST be `https://www.instagram.com/orvel.pro/`
- AND `href` MUST NOT be `#`
