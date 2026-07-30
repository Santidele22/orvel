# Three-Environment Architecture Specification

## Purpose

Establish local development, QA, and production environments that enable repeatable CI/CD promotion, preserve production isolation, reduce release risk, and maintain a $0 monthly infrastructure target under current free-tier limits.

## Requirements

### Requirement: Network-independent local development

Local development SHALL run against SQLite and SHALL NOT require a network connection to a shared database for the supported local workflow.

#### Scenario: Developer starts Orvel offline

- GIVEN the local dependencies are installed
- WHEN the developer starts the supported local workflow without network access
- THEN the application uses SQLite
- AND the supported local flows remain available

### Requirement: Shared remote development and QA

Dev-remote and QA SHALL share the single Supabase project `orvel-qa-dev` and SHALL use non-production data and credentials.

#### Scenario: QA build accesses backend services

- GIVEN a QA deployment is running
- WHEN it accesses Supabase services
- THEN it connects to `orvel-qa-dev`
- AND it does not use production credentials or data

### Requirement: Isolated production backend

Main SHALL use its own isolated Supabase project, `orvel-main`, with no shared database or secrets from non-production.

#### Scenario: Production deployment starts

- GIVEN the `main` branch has been promoted
- WHEN the production application initializes
- THEN it connects only to `orvel-main`
- AND non-production credentials are unavailable

### Requirement: Three Vercel deployment tracks

The frontend SHALL expose three Vercel deployment tracks: production from `main`, QA from `qa`, and previews from `dev` plus feature branches.

#### Scenario: Feature branch is pushed

- GIVEN a feature branch contains a frontend change
- WHEN Vercel processes the push
- THEN it creates or updates a preview deployment
- AND it does not replace QA or production

#### Scenario: Main branch is pushed

- GIVEN a change has been promoted to `main`
- WHEN Vercel processes the push
- THEN it deploys the production track for `orvel.app`

### Requirement: Automated branch deployment

GitHub Actions SHALL automatically run the approved deployment workflow on pushes to `qa` and `main`.

#### Scenario: QA receives a commit

- GIVEN a commit is pushed to `qa`
- WHEN the workflow starts
- THEN it deploys the QA-targeted application and backend assets
- AND a failed required check prevents successful promotion

### Requirement: Automated migration application

GitHub Actions SHALL automatically apply ordered, approved migrations to the target Supabase project on pushes to `qa` and `main`.

#### Scenario: Main contains a new migration

- GIVEN an approved additive migration is present on `main`
- WHEN the main promotion workflow runs
- THEN it applies the migration to `orvel-main` before declaring success
- AND migration failure stops the deployment workflow

### Requirement: Angular environment separation

Angular SHALL define separate `environment.qa.ts` and `environment.prod.ts` files and SHALL select them through explicit build configurations.

#### Scenario: QA build is compiled

- GIVEN the QA Angular build configuration is selected
- WHEN the dashboard is compiled
- THEN `environment.qa.ts` supplies QA-safe public configuration
- AND production configuration is not bundled

### Requirement: Additive database evolution

Post-cutover migrations SHALL be strictly additive. They SHALL NOT use `DROP TABLE` or other destructive changes unless a coordinated dual-write migration has been designed, approved, and executed.

#### Scenario: Proposed migration drops a table

- GIVEN a migration contains `DROP TABLE`
- WHEN CI validates the migration
- THEN promotion fails
- AND the change requires an approved dual-write and deprecation plan

#### Scenario: Compatible column is added

- GIVEN a migration adds a backward-compatible nullable column
- WHEN CI validates and applies the migration
- THEN existing application versions remain operational
- AND promotion may continue
