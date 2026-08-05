# CFM Cash Flow Management

A **Power Apps Code App** for cash flow, AP (accounts payable), and treasury workflow management — built with React 19, TypeScript, and Vite, running on top of a Microsoft **Dataverse** backend.

The app is deployed as a Power Platform Code App (`power.config.json`) and communicates with Dataverse via a generated service/model layer (`src/generated`) plus a thin custom data-access layer (`src/lib`).

## Features / Pages

Navigation is controlled by `src/App.tsx` + `src/components/Sidebar.tsx`, and each page maps to a `PageKey`:

| Page key    | Component                              | Purpose                                                          |
|-------------|-----------------------------------------|-------------------------------------------------------------------|
| `cfs`       | `CashFlowStatement.tsx`                 | Cash Flow Statement dashboard (categories, net measures)         |
| `tms`       | `TmsHandoffPage.tsx`                    | Treasury Management System handoff tasks                         |
| `ap`        | `ApAgingTab.tsx`                        | AP Aging — vendor payable aging buckets, batch approval           |
| `pp`        | `PaymentPlanTab.tsx`                    | AP Payment Plan lines                                             |
| `pp-sc`     | `PaymentPlanSC.tsx`                     | Payment Plan — SC (Supply Chain) priority view                    |
| `adv`       | `AdvancePayments.tsx`                   | Advance payments tracking                                         |
| `treasury`  | `TreasuryTab.tsx`                       | Treasury decisions on payment plan lines                          |
| `config`    | `Configuration.tsx`                     | App configuration (role/access setup) — unrestricted              |

### Access control

Page visibility is role-gated via `src/lib/CurrentUserContext.tsx`:
1. Resolves the signed-in user's Azure AD object id via the Code App SDK (`@microsoft/power-apps/app`'s `getContext()`).
2. Joins it to the matching Dataverse `systemuserid`.
3. Looks up the user's role(s) in the `cfm_rolesecurity` table and resolves which `PageKey`s they're allowed to see (`ROLE_MENU_MAP` in `src/types/roleAccess.ts`).

Users with no assigned role see an "Access Denied" screen instead of the app shell.

## Tech stack

- **React 19** + **TypeScript** + **Vite** (build tool)
- **Microsoft Dataverse** as the data backend, accessed through generated services/models in `src/generated` (per Dataverse table, e.g. `Cfm_paymentplansService`)
- **Power Apps Code Apps SDK** (`@microsoft/power-apps`) for auth context and platform integration
- **lucide-react** for icons
- Plain CSS (`src/styles/*.css`) — no CSS framework

## Project structure

```
src/
  components/     UI pages and shared components (tabs, modals, sidebar, toasts)
  lib/            Data-access services, auth/role context, formatting utilities
  generated/      Auto-generated Dataverse models + services (per table) — do not hand-edit
  types/          Shared TypeScript types per domain (cashflow, apAging, apPaymentPlan, ...)
  styles/         Plain CSS stylesheets
  App.tsx         Page routing (PageKey switch) + role-gate wiring
  main.tsx        React entry point
power.config.json Power Platform Code App config (app id, environment, Dataverse connection/table refs)
.power/           Power Platform tooling metadata
```

## Getting started

```bash
npm install
npm run dev       # start Vite dev server (http://localhost:3000, per power.config.json)
```

Other scripts:

```bash
npm run build      # tsc -b && vite build → outputs to dist/ (buildPath in power.config.json)
npm run lint        # eslint .
npm run preview     # preview the production build locally
```

## Deploying as a Power Platform Code App

This app is registered as a Code App (see `appId` / `environmentId` in `power.config.json`) with a connection reference to Dataverse. Deployment uses the Power Platform CLI (`pac`):

```bash
npm run build
pac code push
```

This pushes the built `dist/` output to the configured Power Platform environment. Any new Dataverse tables/columns the app needs must be added to `databaseReferences` in `power.config.json` and regenerated via the Power Apps CLI codegen before they're usable from `src/generated`.

## Notes for contributors

- Files under `src/generated/` are auto-generated from the Dataverse schema — regenerate them via the Power Apps tooling rather than hand-editing.
- Several components carry comments like *"mirrors renderXyz() in CFM_APNew.html"* — this app is a rebuild of a legacy HTML/JS app, and those comments point at the original function the React code replaces, for behavioral parity checks.

## File-by-file reference

Everything below is under `src/`, grouped by folder. Use this as a map to jump straight to the right file.

### Root files

| File | What it does |
|---|---|
| `main.tsx` | React entry point. Mounts `<App />` into `#root` and loads the web fonts (Outfit, Inter, JetBrains Mono) used across the app. |
| `App.tsx` | Top-level page router. Holds the `activePage` state (a `PageKey`), renders `Sidebar` + the matching page component, and redirects a user away from a page they aren't allowed to see (via `CurrentUserContext`). Shows a full-screen "Access Denied" state for users with zero roles. |
| `App.css`, `index.css` | Base/global CSS (resets, root font setup). |
| `assets/` | Static images (`hero.png`, `react.svg`, `vite.svg`) — mostly template leftovers plus the hero image. |

### `components/` — pages and UI

| File | What it does |
|---|---|
| `CashFlowStatement.tsx` | The `cfs` page. Cash Flow Statement dashboard: fetches categories + net measures via `dataverseClient.ts`, aggregates them with `cashflowUtils.ts`, and renders the operating/investing/financing activity breakdown with year/month/BU filters. Includes the "Create Decision" flow and `RevenueSummaryBar`. |
| `RevenueSummaryBar.tsx` | Small summary strip shown on the Cash Flow Statement page — total revenue vs. target per BU/month, sourced from `cfm_revenuetargets`. |
| `TmsHandoffPage.tsx` | The `tms` page. Lists Treasury Management System handoff tasks (`cfm_tmshandoffs`) with search/filter/pagination, task status updates, and a "View" link built by `tmsLinkBuilder.tsx` that deep-links into the legacy Dynamics TMS model-driven app. |
| `ApAgingTab.tsx` | The `ap` page. AP Aging — vendor payables grouped into aging buckets (Current, 1-30, 31-60, 61-90, 90+), with Group/Bracket/BU filters, per-row selection, and a "Send to Plan" batch action that creates Payment Plan records. Has the reference implementation of the numbered pagination UI (`ap-page-btn` / `ap-page-dots` classes) that the other list pages copy. |
| `PaymentPlanTab.tsx` | The `pp` page (AP view of the Payment Plan). Lists `cfm_paymentplan` lines with status/treasury-status/BU filters, inline due-date and amount editing (with a mandatory reason + amount-change history), comments, and stage/decision badges. |
| `PaymentPlanSC.tsx` | The `pp-sc` page. Same `cfm_paymentplan` data as `PaymentPlanTab`, but from the Supply Chain (SC) angle — priority tagging, recommended action, and supply-risk-if-not-paid fields via `scPriorityService.ts`. |
| `AdvancePayments.tsx` | The `adv` page. Tracks `cfm_advancedpayments` — submission form, status workflow (Pending/Approved/Rejected/etc.), and a review/decision modal, using `advancePaymentService.ts`. |
| `TreasuryTab.tsx` | The `treasury` page. Treasury's view of `cfm_paymentplan` lines — lets Treasury set/change `treasuryStatus` (Pending/Paid/Scheduled/Clarification Required) per line via an edit modal, using `treasuryService.ts`. |
| `Configuration.tsx` | The `config` page. A small shell with a sub-screen switcher; currently hosts `RoleAccessConfig` (role/SLA config is stubbed as `"role" | "sla"` but only `role` is wired up). Not role-gated — always visible. |
| `RoleAccessConfig.tsx` | Admin UI to assign/remove app roles (Treasury, AP, SC / HR Head, CFO, Finance Director) to users, backed by `roleAccessService.ts` and the `cfm_rolesecurity` table. Includes a user search-as-you-type lookup. |
| `BudgetRequestPanel.tsx` | Sub-panel embedded in the Payment Plan pages: a Year + Region (Egypt/KSA) filtered grid of BU × Month budget request amounts (`cfm_requestbudget`), with a "Request Budget" button opening `Budgetrequestmodal.tsx`. Data via `apBudgetRequestService.ts`. |
| `Budgetrequestmodal.tsx` | Modal used by `BudgetRequestPanel` to create a new budget-request task/decision record (`cfm_tmshandoffs`) for a given year/region. |
| `TreasuryBudgetPanel.tsx` | Treasury-side counterpart to `BudgetRequestPanel` — same BU × Month grid, but editable: Treasury can enter/save budget amounts directly into `cfm_requestbudget` cells, via `treasuryBudgetService.ts`. |
| `CreateDecisionModal.tsx` | Generic "create a task/decision" modal reused across pages (Cash Flow Statement, AP Aging, Budget panels) — captures section name, priority, assignee (via `AssigneeLookup`), and due info, then writes a `cfm_tmshandoffs` record. |
| `AssigneeLookup.tsx` | Debounced type-ahead user picker (queries `SystemusersService`) used inside `CreateDecisionModal` to choose who a task is assigned to. |
| `Sidebar.tsx` | Left navigation rail. Defines the `PageKey` union type, renders nav items only for pages the current user's role allows (`useCurrentUser().allowedPages`), and groups the AP-related pages (`ap`, `pp`, `pp-sc`, `adv`, `treasury`) under one collapsible "AP" section. Also handles collapse/expand of the whole sidebar. |
| `Loader.tsx` | Full-page loading overlay (spinner + "Loading Data..." text) shown while a page's initial data fetch is in flight. |
| `InlineLoader.tsx` | Smaller inline spinner (with a custom `label`) used inside panels/sections instead of blocking the whole page. |

### `lib/` — data access, context, and utilities

| File | What it does |
|---|---|
| `dataverseClient.ts` | Fetch layer for the Cash Flow Statement page: builds Dataverse `$filter` query strings from year/month/group/BU selections and pulls `cfm_cashflowcategories` + `cfm_cashflownetmeasureses`. |
| `cashflowUtils.ts` | Pure helper functions for the Cash Flow Statement: month name lists, aggregating raw measure rows into totals, resolving which currency/activity a line belongs to, and splitting a number into whole/decimal parts for display. |
| `apAgingService.ts` | Fetches and shapes `cfm_finance_ap` rows for the AP Aging page (bucketing into aging tiers, filtering by group/bracket). Field list is intentionally kept in exact sync with the legacy app's `$select`. |
| `apPaymentPlanService.ts` | Core service for `cfm_paymentplan` — fetches/maps Payment Plan lines (`mapPaymentPlanRecord`), resolves badge styles for stage/decision, saves amount changes (with mandatory reason + writes to `cfm_amounthistories`), updates due dates/notes/status. Used by both `PaymentPlanTab` and (indirectly) `treasuryService.ts`. |
| `treasuryService.ts` | Treasury-specific reads/writes on top of the same `cfm_paymentplan` table — loading lines for the Treasury view and saving `treasuryStatus` changes. Reuses `apPaymentPlanService.ts` helpers rather than duplicating the field list. |
| `scPriorityService.ts` | Supply Chain-specific reads/writes on `cfm_scpriority`, used by `PaymentPlanSC.tsx` (priority, recommended action, supply-risk fields). |
| `advancePaymentService.ts` | Fetch/map/status logic for `cfm_advancedpayments`, including matching each row to its insurance company (`cfm_insurancecompanies`) where relevant. |
| `apBudgetRequestService.ts` | Shared budget-grid logic: region → BU-list mapping, fetching `cfm_requestbudget` rows, and pivoting them into a BU × Month grid (`buildBudgetGrid`). Consumed by both `BudgetRequestPanel` (AP, read-only) and `treasuryBudgetService.ts` (Treasury, editable). |
| `treasuryBudgetService.ts` | Extends `apBudgetRequestService.ts` with what the read-only AP panel doesn't need: per-cell record GUIDs (to know create vs. update) and the actual save operation for Treasury's editable budget grid. |
| `roleAccessService.ts` | CRUD for `cfm_rolesecurity` — list current role assignments, search users to assign, save a new assignment, delete one. Backs `RoleAccessConfig.tsx`. |
| `tmsLinkBuilder.tsx` | Resolves the Dataverse org URL and the TMS model-driven app's id so `TmsHandoffPage.tsx` can build a working deep link into the legacy Dynamics TMS app for a given record. |
| `CurrentUserContext.tsx` | React context/provider resolving "who is the signed-in user and what can they see." Uses the Code App SDK's `getContext()` to get the Azure AD identity, joins it to a Dataverse `systemuserid`, loads their roles, and exposes `allowedPages`, `canonicalRoles`, `noAccess`, etc. Wraps the whole app in `App.tsx`. |
| `ToastContext.tsx` | React context/provider for toast notifications (`info` / `success` / `alert`). Exposes `useToast().showToast(title, msg, type)`, used throughout the app for save/error feedback. |

### `types/` — shared TypeScript types (one file per domain)

| File | What it does |
|---|---|
| `cashflow.ts` | Types for `cfm_cashflowcategories` / `cfm_cashflownetmeasureses` rows plus the aggregated/derived shapes used by the Cash Flow Statement page. |
| `apAging.ts` | Types for the AP Aging screen — the raw `cfm_finance_ap` row shape actually selected, aging tiers/brackets, and the "staged for send to plan" vendor shape. |
| `apPaymentPlan.ts` | Types for `cfm_paymentplan` — status/treasury-status choice-value unions, the `PPLine` shape used across `PaymentPlanTab`/`PaymentPlanSC`/`TreasuryTab`, and badge style types. |
| `apBudgetRequest.ts` | Types for the budget-grid feature — `BudgetRegion`, `MonthKey`, `BudgetRequestRow`, `BudgetGrid`/`BudgetGridRow`, shared by both AP and Treasury budget panels. |
| `advancePayment.ts` | Types for `cfm_advancedpayments` — status codes/metadata (`advStatusMeta`) and the mapped `AdvancePayment`/`MatchedAdvCompany` shapes. |
| `roleAccess.ts` | Types for `cfm_rolesecurity` — the fixed `ROLE_OPTIONS` list, `RoleAccessRecord`, `UserSearchResult`, and (used by `Sidebar`/`App`) the role-to-page mapping. |

### `styles/` — CSS

| File | What it does |
|---|---|
| `AppShell.CSS` | Layout CSS for the app shell — sidebar, collapse/expand behavior, top-level page container. |
| `CashFlowStatement.css` | The largest stylesheet — shared styling for almost every "screen" in the app (filters bar, tables/grids, badges, pagination buttons `.ap-page-btn`/`.pp-pagination`, modals), despite the name it's imported by most pages, not just the Cash Flow Statement. |

### `generated/` — auto-generated Dataverse layer (do not hand-edit)

One `<Table>Model.ts` (row/field types) + `<Table>Service.ts` (CRUD calls: `getAll`, `get`, `create`, `update`, `delete`, generated from the Dataverse schema) per table referenced in `power.config.json`'s `databaseReferences`, plus `MicrosoftDataverseModel.ts`/`Service.ts` (org-level metadata, e.g. listing environments) and `CommonModels.ts` (shared plumbing types). `index.ts` re-exports the lot.

| Table (Dataverse logical name) | Generated files | Used by |
|---|---|---|
| `appmodule` | `AppmodulesModel/Service.ts` | `tmsLinkBuilder.tsx` (resolving the TMS model-driven app id) |
| `systemuser` | `SystemusersModel/Service.ts` | `AssigneeLookup.tsx`, `roleAccessService.ts` |
| `cfm_cashflowcategory` | `Cfm_cashflowcategoriesModel/Service.ts` | `dataverseClient.ts` |
| `cfm_cashflownetmeasures` | `Cfm_cashflownetmeasuresesModel/Service.ts` | `dataverseClient.ts` |
| `cfm_revenuetarget` | `Cfm_revenuetargetsModel/Service.ts` | `RevenueSummaryBar.tsx` |
| `cfm_tmshandoff` | `Cfm_tmshandoffsModel/Service.ts` | `TmsHandoffPage.tsx`, `CreateDecisionModal.tsx`, `Budgetrequestmodal.tsx` |
| `cfm_finance_ap` | `Cfm_finance_apsModel/Service.ts` | `apAgingService.ts`, `apPaymentPlanService.ts` |
| `cfm_paymentplan` | `Cfm_paymentplansModel/Service.ts` | `apPaymentPlanService.ts`, `treasuryService.ts` |
| `cfm_amounthistory` | `Cfm_amounthistoriesModel/Service.ts` | `apPaymentPlanService.ts` (amount-change audit trail) |
| `cfm_scpriority` | `Cfm_scprioritiesModel/Service.ts` | `scPriorityService.ts` |
| `cfm_advancedpayment` | `Cfm_advancedpaymentsModel/Service.ts` | `advancePaymentService.ts` |
| `cfm_insurancecompany` | `Cfm_insurancecompaniesModel/Service.ts` | `advancePaymentService.ts`, `apPaymentPlanService.ts` |
| `cfm_requestbudget` | `Cfm_requestbudgetsModel/Service.ts` | `apBudgetRequestService.ts`, `treasuryBudgetService.ts` |
| `cfm_rolesecurity` | `Cfm_rolesecuritiesModel/Service.ts` | `roleAccessService.ts`, `CurrentUserContext.tsx` |
| n/a (org metadata) | `MicrosoftDataverseModel/Service.ts` | `tmsLinkBuilder.tsx` (org URL lookup) |
