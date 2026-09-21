# FinApp

FinApp is a responsive personal finance application for planning income, tracking spending, managing bills, and monitoring savings goals.

> **Current status:** The responsive frontend, authenticated PostgreSQL-backed financial workflows, CRUD operations, savings contributions, budget editing, token refresh, and deployment container setup are implemented. Production hosting, DNS, TLS termination, backups, and monitoring still need to be configured for the chosen provider.

## Local development

### Frontend

```powershell
npm install
npm run dev
```

Run the frontend unit tests with:

```powershell
npm test
```

The current frontend tests cover shared financial formatting utilities. Add feature and browser-flow coverage before production release.

### Backend

From the repository root, install the pinned Python dependencies and start the API:

```powershell
C:\Python313\python.exe -m pip install -r backend\requirements.txt
Push-Location backend
C:\Python313\python.exe -m uvicorn app.main:app --reload
Pop-Location
```

Copy `backend\.env.example` to `backend\.env` before connecting the API to a local PostgreSQL instance. The initial health endpoint is available at `http://127.0.0.1:8000/api/v1/health`.

### Database

Docker Desktop must be installed and running for the local PostgreSQL service.

Start the local PostgreSQL service with:

```powershell
docker compose up -d postgres
```

The database schema is defined in `backend\app\models.py` and created by the initial migration in `backend\migrations\versions`. To apply migrations:

```powershell
Push-Location backend
C:\Python313\python.exe -m alembic upgrade head
Pop-Location
```

Run schema tests with:

```powershell
Push-Location backend
C:\Python313\python.exe -m unittest discover -s tests
Pop-Location
```

For the complete development/test environment, install:

```powershell
C:\Python313\python.exe -m pip install -r backend\requirements-dev.txt
```

### Authentication

The backend now exposes:

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`

Set a strong `JWT_SECRET_KEY` in `backend\.env` before using authentication outside local development. Access tokens are short-lived JWTs; refresh tokens are stored only as SHA-256 hashes and are rotated when refreshed.

The frontend uses `http://127.0.0.1:8000` by default for the API. To use another backend URL, create a root `.env` file with:

```env
VITE_API_URL=http://127.0.0.1:8000
```

Start the backend before opening the frontend. The first screen allows a user to register or sign in, restores an existing session, and provides sign out from the workspace profile.

Saving onboarding setup updates the monthly plan and adds or updates matching bills and goals. It does not delete existing bills, goals, or savings contributions; use the dedicated Money center actions to remove records.

## Production deployment

The repository includes:

- `backend\Dockerfile` for the API and automatic Alembic migrations at container startup.
- `Dockerfile` and `nginx.conf` for the Vite build served as a single-page application.
- `docker-compose.prod.yml` for PostgreSQL, API, and frontend containers.
- `.env.production.example` documenting required production variables.
- `.github\workflows\ci.yml` for automated frontend and backend validation on pushes and pull requests.
- `ops\backup.ps1` and `ops\restore.ps1` for PostgreSQL backup and restore drills.

The frontend build and CI use Node.js 22, matching the supported engine for the current Vitest release.

### Backup and restore drill

Run these commands from the repository root on the Docker host:

```powershell
.\ops\backup.ps1 -EnvFile .env
.\ops\restore.ps1 -EnvFile .env -BackupFile .\backups\finapp-YYYYMMDD-HHMMSS.sql
```

Use `-ComposeProject finapp-staging` when drilling against an isolated staging Compose project.
For non-interactive automation, add `-ConfirmRestore` only after verifying the selected backup and target project.

Store backups outside the application host, encrypt them at rest, restrict access, and perform a restore drill before accepting production financial data.

To deploy on a Docker host:

1. Copy `.env.production.example` to `.env` and replace every placeholder with a strong secret or your real HTTPS origins.
2. Set `VITE_API_URL` to the public API origin without `/api/v1`; the frontend appends that path.
3. Put a TLS reverse proxy or managed HTTPS load balancer in front of the frontend and API, then set `FRONTEND_ORIGIN` to the exact frontend origin.
4. Run `docker compose --env-file .env -f docker-compose.prod.yml up -d --build`.
5. Verify `/health` and `/api/v1/health`, then confirm `alembic upgrade head` completed in the API logs.
6. Configure encrypted PostgreSQL backups, log retention, alerting, and a restore drill before accepting production users.

Do not commit `.env`, production passwords, or JWT secrets. The production settings reject the development JWT secret and non-production frontend origins when `APP_ENV=production`.

After the first sign-in, FinApp guides each user through a four-step setup:

1. Opening balance and expected monthly income.
2. Planned allocations and spending amounts.
3. Recurring bills and one-time debts.
4. Starter savings goals and monthly contributions.

The onboarding data is persisted per user in PostgreSQL and is used for the dashboard opening balance and income calculations. Browser local storage remains as a fallback for setup loading if the API is temporarily unavailable.

The setup persistence API is now available:

- `GET /api/v1/setup`
- `PUT /api/v1/setup`

These endpoints require the signed-in user's bearer token and persist the monthly plan, income source, allocations, bills/debts, and savings goals. The frontend saves onboarding through this API and uses browser storage only as a fallback if the API is temporarily unavailable.

Authenticated transaction endpoints are also available:

- `GET /api/v1/transactions`
- `POST /api/v1/transactions`
- `PUT /api/v1/transactions/{transaction_id}`
- `DELETE /api/v1/transactions/{transaction_id}`

Income and Expense entries from the frontend are now stored against the signed-in user in PostgreSQL and loaded back into the dashboard and Transactions view.

Bills have independent authenticated CRUD endpoints:

- `GET /api/v1/bills`
- `POST /api/v1/bills`
- `PUT /api/v1/bills/{bill_id}`
- `DELETE /api/v1/bills/{bill_id}`

The Bills view supports adding, editing, and deleting recurring payments and one-time debts. Bill records are scoped to the signed-in user and include an amount, frequency, and due day.

Goals and savings contributions have authenticated endpoints:

- `GET /api/v1/goals`
- `POST /api/v1/goals`
- `PUT /api/v1/goals/{goal_id}`
- `DELETE /api/v1/goals/{goal_id}`
- `POST /api/v1/goals/{goal_id}/contributions`

The Goals view displays contribution progress and supports creating, editing, and deleting goals as well as adding dated savings contributions.

Monthly budget allocations can be updated without replacing bills or goals:

- `PUT /api/v1/budget/allocations`

The Budget view allows users to edit existing categories, add new allocation categories, remove categories, and save planned amounts for the selected month.

The frontend automatically refreshes expired access tokens once through the rotating refresh-token endpoint, retries the failed request, and revokes the refresh token when the user signs out.

Monthly reporting is available at:

- `GET /api/v1/reports/monthly-summary?month_start=YYYY-MM-01`

The dashboard uses this summary to calculate opening balance, planned and actual income, expenses, available balance, and allocation spending for the selected month. Month-filtered transaction loading uses the complete calendar month range.

The Budget, Bills, Goals, and Reports views now read their values from the authenticated setup and monthly summary data. Empty states are shown when a signed-in user has not configured allocations, bills, or goals.

## Current frontend features

- FinApp coin-style branding.
- Dashboard with balance, income, expenses, savings, budget, goals, and recent transactions.
- Separate Income and Expense transaction actions with immediate dashboard updates.
- Budget, transactions, bills, goals, reports, and settings views.
- Month selector and light/dark theme controls.
- Collapsible desktop sidebar.
- Floating icon-only bottom navigation on mobile.
- Responsive layouts for mobile, tablet, and desktop resolutions.

## Project structure

```text
fin_app/
├── backend/          FastAPI service, SQLAlchemy, Alembic, and configuration
├── src/              React + TypeScript frontend
├── App_Documents/    Product, technical, UX, flow, and schema documentation
├── docker-compose.yml
└── package.json
```

The application is designed to work smoothly on desktop, tablet, and mobile screens while keeping the first version simple enough to build, deploy, and maintain.

---

## 1. Product Overview

The app helps a user answer five simple questions:

1. How much money did I receive?
2. Where should my money go?
3. How much have I spent?
4. How much do I have left?
5. How much am I saving toward my goals?

The main financial flow is:

```text
Income
   ↓
Budget / Allocation
   ↓
Actual Spending
   ↓
Remaining Money
   ↓
Savings and Goals
   ↓
Monthly Review
```

The app replaces the need to manually maintain a spreadsheet while keeping the useful ideas from the existing Budget Planner Dashboard.

---

## 2. Main Product Idea

The app is not only an expense tracker.

Its main purpose is to help the user **plan their money before spending it and then compare the plan with what actually happened**.

For example:

```text
Monthly Income
RWF 180,000

Transportation Budget
RWF 50,000

Spent
RWF 20,000

Remaining
RWF 30,000
```

If the user records another RWF 500 transportation expense, the app automatically updates:

```text
Budget:     RWF 50,000
Spent:      RWF 20,500
Remaining:  RWF 29,500
```

The user should never need to calculate these numbers manually.

---

# 3. Goals

## Primary Goals

- Make budgeting simple.
- Make expense recording fast.
- Show remaining money clearly.
- Support changing monthly income.
- Track bills.
- Track savings.
- Track financial goals.
- Keep historical monthly records.
- Work well on both laptop and mobile.
- Keep the application fast and easy to navigate.
- Use inexpensive/free infrastructure during the MVP stage.
- Keep the architecture ready for future authentication and additional users.

## Secondary Goals

- Help users understand spending habits.
- Show planned versus actual spending.
- Show savings progress.
- Reduce unnecessary spending through better visibility.
- Provide useful monthly and weekly reviews.

---

# 4. Target User

The initial application is designed primarily for an individual managing personal finances.

The first version should support:

- personal income;
- personal expenses;
- personal budgets;
- personal bills;
- personal savings;
- personal financial goals.

The architecture must still support multiple users so authentication and account separation can be added without rebuilding the application.

---

# 5. Core Features

## 5.1 Monthly Income

The user can enter their expected monthly income.

Example:

```text
September 2026

Salary              RWF 180,000
Side Income          RWF 20,000

Total Income         RWF 200,000
```

The application must support different income amounts each month.

It must not assume that the user earns the same amount every month.

---

## 5.2 Budget Allocation

The user divides their income into categories.

Example:

```text
Housing             RWF 50,000
Food                RWF 20,000
Transport           RWF 50,000
Utilities           RWF 12,000
Mobile              RWF 10,000
Wi-Fi               RWF 15,000
Education            RWF 5,000
Family               RWF 5,000
Savings              RWF 8,000
Personal             RWF 5,000
```

The application calculates:

```text
Total planned
Unallocated money
```

The system must clearly show if some income has not yet been allocated.

---

## 5.3 Expense Tracking

The user can record every expense.

Each transaction can contain:

- date;
- amount;
- category;
- sub-category;
- description;
- merchant;
- Need or Want;
- payment method;
- notes.

Example:

```text
Date:        18 September
Amount:      RWF 500
Category:    Transportation
Description: Motorcycle
Type:        Need
```

Small expenses must be supported.

There should be no minimum transaction amount.

---

## 5.4 Budget vs Actual

Every category should show:

```text
Planned
Actual
Remaining
Percentage Used
Status
```

Example:

```text
Transportation

Planned:      RWF 50,000
Actual:       RWF 31,500
Remaining:    RWF 18,500
Used:         63%
Status:       Within Budget
```

If spending goes above the planned amount:

```text
Planned:      RWF 50,000
Actual:       RWF 55,000
Remaining:    -RWF 5,000
Status:       Over Budget
```

---

# 6. Bills

Users can create recurring bills.

Examples:

- Rent;
- electricity;
- water;
- internet;
- phone;
- subscriptions;
- other regular payments.

Each bill contains:

```text
Name
Category
Due Day
Expected Amount
Active / Inactive
```

The application calculates the monthly status.

Possible states:

```text
Not Paid
Partially Paid
Paid
Overdue
```

A bill should be connected to actual transactions instead of relying on a manually selected "paid" button.

---

# 7. Savings

Users can create savings goals.

Examples:

```text
Emergency Fund
Land
Business
Investment
Retirement
Custom Goal
```

A goal contains:

```text
Goal Name
Target Amount
Current Amount
Monthly Target
Target Date
Status
```

Example:

```text
Emergency Fund

Target:       RWF 100,000
Saved:        RWF 40,000
Remaining:    RWF 60,000
Progress:     40%
```

Savings contributions should be connected to actual financial records so that savings and transaction data remain consistent.

---

# 8. Dashboard

The Dashboard is the main screen.

It should provide a quick overview of the selected month.

The Dashboard should show:

```text
Available Balance
Income
Expenses
Savings
Budget Status
Bills
Goals
Recent Transactions
```

The user should be able to understand their financial position without opening another page.

---

# 9. Monthly History

The user can select a month and review its information.

For example:

```text
August 2026
September 2026
October 2026
```

Each month keeps its own:

- income;
- budget;
- expenses;
- bills;
- savings;
- goals;
- financial results.

Changing the selected month must not modify another month's data.

---

# 10. Reports and Reviews

The application should provide simple financial summaries.

Examples:

- planned vs actual spending;
- spending by category;
- income vs expenses;
- savings rate;
- need vs want spending;
- monthly trends;
- largest spending categories;
- bill status;
- goal progress.

The reports should explain what happened rather than attempting to give professional financial advice.

---

# 11. Navigation

The main navigation should contain:

```text
Dashboard
Budget
Transactions
Bills
Goals
Reports
Settings
```

On desktop:

```text
Sidebar
   +
Main Content
```

On mobile:

```text
Top Header
   +
Main Content
   +
Bottom Navigation
```

The most frequently used actions should always be easy to reach.

The main action should be:

```text
Add Transaction
```

---

# 12. Technology Stack

## Frontend and Application

Use:

**Next.js**

with:

**TypeScript**

Next.js is preferred because it allows the application to use one project for:

- frontend pages;
- server-side logic;
- API endpoints;
- authentication integration;
- future PWA support.

This avoids unnecessary complexity during the MVP.

---

## Styling

Use:

**Tailwind CSS**

Tailwind should provide the base styling system.

Create reusable design tokens for:

- colors;
- spacing;
- typography;
- borders;
- radius;
- shadows;
- states.

Do not create completely different styles for every screen.

---

## UI Components

Use:

**shadcn/ui**

for reusable accessible components such as:

- buttons;
- dialogs;
- dropdowns;
- inputs;
- cards;
- tables;
- tabs;
- forms;
- alerts;
- navigation.

Components should be customized to match the application's design rather than using the default appearance everywhere.

---

## Forms and Validation

Use:

**React Hook Form**

for form handling.

Use:

**Zod**

for validation.

Validation should happen on both:

```text
Frontend
   +
Server
```

Frontend validation improves the user experience.

Server validation protects the actual data.

---

# 13. Database

Use:

**Supabase PostgreSQL**

Supabase provides PostgreSQL and additional services while keeping the MVP infrastructure simple.

The database will store:

- users;
- settings;
- categories;
- subcategories;
- monthly plans;
- income sources;
- budget lines;
- transactions;
- bills;
- goals;
- goal contributions.

PostgreSQL is preferred because the application's data is strongly structured and relational.

---

# 14. Authentication

Authentication should be designed into the architecture even if the first local prototype is initially used by one person.

Use:

**Supabase Auth**

Future authentication can support:

- email/password;
- email verification;
- password reset;
- session management;
- OAuth providers if needed;
- multiple users.

Every financial record must belong to a specific user.

The database must never allow one user to access another user's financial information.

Use Supabase Row Level Security for this separation.

---

# 15. Hosting

## Frontend and Application

Use:

**Vercel**

for deployment.

Benefits:

- simple Next.js deployment;
- GitHub integration;
- automatic deployments;
- preview deployments;
- HTTPS;
- easy environment variable management;
- suitable free tier for an MVP.

## Database

Use:

**Supabase**

for PostgreSQL and authentication.

This creates a simple deployment architecture:

```text
GitHub
   ↓
Vercel
   ↓
Next.js Application
   ↓
Supabase
   ↓
PostgreSQL
```

The MVP does not require a separate backend server.

---

# 16. Why This Stack

The stack should prioritize:

1. Free/low-cost MVP operation.
2. Fast navigation.
3. Simple development.
4. Easy deployment.
5. Responsive design.
6. Strong database support.
7. Authentication readiness.
8. Future scalability.
9. Minimal infrastructure to maintain.

The selected architecture avoids unnecessarily creating:

```text
React frontend
+
Separate FastAPI backend
+
Separate authentication service
+
Separate database server
```

for the first version.

That would introduce additional deployment and maintenance work without providing much value for this application's initial requirements.

If the application grows substantially, a separate backend can be introduced later without changing the core database model.

---

# 17. Application Architecture

Use a modular architecture.

```text
app/
├── dashboard/
├── budget/
├── transactions/
├── bills/
├── goals/
├── reports/
└── settings/

components/
├── ui/
├── dashboard/
├── budget/
├── transactions/
├── bills/
├── goals/
└── reports/

lib/
├── auth/
├── db/
├── calculations/
├── validation/
├── reports/
└── utils/

services/
├── budget/
├── transactions/
├── bills/
├── goals/
└── reports/

types/
├── budget.ts
├── transaction.ts
├── bill.ts
├── goal.ts
└── user.ts
```

The exact folder structure may change during implementation, but responsibilities must remain separated.

---

# 18. Data Flow

The basic data flow is:

```text
User
 ↓
Next.js UI
 ↓
Server Action / Route Handler
 ↓
Validation
 ↓
Business Logic
 ↓
Supabase PostgreSQL
 ↓
Calculated Result
 ↓
Next.js UI
```

Financial calculations should not exist only in the browser.

The server/database layer must be the trusted source for financial totals.

---

# 19. Core Financial Rules

## Remaining Budget

```text
Remaining = Planned - Actual
```

## Unallocated Income

```text
Unallocated =
Planned Income - Planned Outflows
```

## Closing Balance

```text
Closing Balance =
Opening Balance
+ Income
- Expenses
- Bills
- Savings
- Debt Payments
```

## Savings Rate

```text
Savings Rate =
Savings / Income × 100
```

If income is zero, the application must safely return zero rather than produce an error.

---

# 20. Money Handling

Money must never be handled using ordinary JavaScript floating-point calculations.

Use:

```text
PostgreSQL NUMERIC
```

for stored monetary values.

On the application side, use appropriate decimal-safe handling.

Example:

```text
RWF 500
```

must remain exactly:

```text
500
```

and not become:

```text
499.999999
```

Financial calculations must be tested carefully.

---

# 21. Database Structure

The main relationships are:

```text
User
 ├── Settings
 ├── Categories
 │    └── Subcategories
 ├── Monthly Plans
 │    ├── Income Sources
 │    └── Budget Lines
 ├── Transactions
 ├── Bills
 └── Goals
      └── Goal Contributions
```

Every user-owned table must contain a way to identify its owner directly or through a secure relationship.

---

# 22. Main Screens

## Dashboard

Purpose:

Give the user a quick picture of their money.

Contains:

- selected month;
- balance;
- income;
- expenses;
- savings;
- budget progress;
- bills;
- goals;
- recent transactions.

---

## Budget

Purpose:

Plan where the user's income should go.

Contains:

- monthly income;
- income sources;
- categories;
- planned amounts;
- actual amounts;
- remaining amounts;
- percentage used;
- unallocated money.

---

## Transactions

Purpose:

Record and review financial activity.

Contains:

- transaction list;
- filters;
- search;
- add transaction;
- edit transaction;
- delete transaction.

---

## Bills

Purpose:

Track regular payments.

Contains:

- bill name;
- due date;
- expected amount;
- amount paid;
- remaining;
- status.

---

## Goals

Purpose:

Track progress toward savings and financial goals.

Contains:

- goal name;
- target;
- current amount;
- remaining;
- monthly target;
- progress;
- target date.

---

## Reports

Purpose:

Help the user understand their financial behavior.

Contains:

- budget vs actual;
- category spending;
- income vs spending;
- savings;
- need vs want;
- monthly trends.

---

## Settings

Purpose:

Manage personal application preferences.

Contains:

- profile;
- currency;
- categories;
- theme;
- preferences;
- account settings.

---

# 23. Responsive Design

The application must be designed mobile-first.

## Mobile

The application should work comfortably on:

```text
320px+
```

The interface should use:

- single-column layouts;
- large touch targets;
- bottom navigation;
- mobile-friendly forms;
- stacked budget cards where tables become difficult to read.

## Tablet

Use:

- two-column layouts where appropriate;
- larger tables;
- expanded dashboard cards.

## Desktop

Use:

- sidebar navigation;
- multi-column dashboard;
- full budget tables;
- larger charts.

The application should not be a desktop application that is simply squeezed onto a mobile screen.

---

# 24. Design System

## Primary Color

```text
#FF6E00
```

Use this for:

- primary buttons;
- active navigation;
- important actions;
- progress highlights.

## Dark Theme

Primary dark background:

```text
#2D2B29
```

The dark theme should use neutral surfaces rather than making every component black.

## Light Theme

Use:

- warm/light background;
- white surfaces;
- dark text;
- subtle borders.

## Typography

Recommended:

```text
Inter
```

or a system sans-serif fallback.

Typography should prioritize readability.

---

# 25. User Experience Principles

The app should feel:

- simple;
- fast;
- calm;
- clear;
- personal;
- trustworthy.

The user should not need to understand financial terminology to use the app.

Instead of:

```text
Expense Variance
```

prefer:

```text
Over Budget
```

Instead of:

```text
Available Discretionary Allocation
```

prefer:

```text
Money Left
```

The application should explain numbers in normal language.

---

# 26. Performance Requirements

The application should feel fast during normal use.

Priorities:

- minimize unnecessary API requests;
- cache frequently used data;
- use server-side data fetching where appropriate;
- use optimistic UI only where it is safe;
- avoid unnecessary client-side JavaScript;
- lazy-load large reports/charts;
- paginate long transaction lists;
- index important database queries.

The Dashboard should not request every piece of data independently if a consolidated monthly summary can provide the required information efficiently.

---

# 27. Navigation Performance

Navigation between major screens should feel immediate.

Use Next.js routing and appropriate prefetching.

Frequently visited pages should be prefetched where useful.

Avoid full browser page reloads during normal navigation.

---

# 28. Security

The application will eventually contain private financial information.

Security is therefore part of the core architecture.

Requirements:

- secure authentication;
- hashed passwords through the authentication provider;
- HTTPS;
- Row Level Security;
- server-side validation;
- protected routes;
- secure session handling;
- no financial data in URLs unnecessarily;
- no secrets in frontend code;
- environment variables for private credentials;
- database backups;
- authorization checks on every protected operation.

Never trust:

```text
user_id
```

sent from the browser.

The authenticated session must determine the current user.

---

# 29. Authentication Architecture

The intended future flow is:

```text
User
 ↓
Login
 ↓
Supabase Auth
 ↓
Authenticated Session
 ↓
Next.js
 ↓
User ID
 ↓
Database Security Rules
 ↓
Only that user's data
```

A future version can add:

```text
Email Verification
Password Reset
Google Login
Two-Factor Authentication
Profile Management
```

without redesigning the financial database.

---

# 30. Error Handling

Errors should be understandable.

Bad:

```text
HTTP 422 Validation Error
```

Better:

```text
Please enter an amount greater than zero.
```

Examples:

```text
Could not save your transaction.
Please try again.
```

```text
This category is no longer available.
Please choose another category.
```

```text
Your session has expired.
Please log in again.
```

Never expose database errors, stack traces, API keys or internal implementation details to users.

---

# 31. Empty States

Every major page should have a useful empty state.

Example:

```text
No transactions yet.

Start by recording your first expense.

[Add Transaction]
```

Budget:

```text
No budget for this month.

Create your monthly plan to start tracking your money.

[Create Budget]
```

Goals:

```text
No goals yet.

Create a goal to start tracking your progress.

[Create Goal]
```

---

# 32. Transaction Rules

A transaction must contain at minimum:

```text
Date
Amount
Type
Category
```

Optional:

```text
Sub-category
Description
Merchant
Need/Want
Payment Method
Notes
```

Transaction types:

```text
Income
Expense
Bill Payment
Saving
Debt Payment
Transfer
```

The backend must check that the selected category is valid for the transaction type.

---

# 33. Category Rules

Categories can contain subcategories.

Example:

```text
Transportation
 ├── Motorcycle
 ├── Bus
 ├── Taxi
 └── Fuel
```

The user must not be able to select:

```text
Transportation
+
Electricity
```

if Electricity belongs to Utilities.

This prevents the type of unmatched category problem that can happen in spreadsheets.

---

# 34. Monthly Data Rules

Every monthly budget is its own record.

For example:

```text
August 2026
September 2026
October 2026
```

Changing September's budget must not change August's historical budget.

Transactions are tied to their actual dates.

Reports calculate the correct month using transaction dates.

---

# 35. Carry-Forward Balance

The application should support an opening balance.

Example:

```text
August closing balance
RWF 20,000

September opening balance
RWF 20,000
```

The first month can be manually initialized.

Future monthly opening balances should normally come from the previous month's closing balance.

---

# 36. Data Consistency

The application should have one source of truth.

For example, the Dashboard should not store:

```text
Transport spent = 20,000
```

as a separate manually maintained number.

Instead:

```text
Transactions
     ↓
Calculate Transport Actual
     ↓
Dashboard
```

This prevents the Dashboard and Transactions page from showing different numbers.

---

# 37. Testing Strategy

Testing must focus heavily on financial calculations.

## Unit Tests

Test:

- remaining budget;
- unallocated money;
- savings rate;
- bill status;
- goal progress;
- monthly totals;
- carry-forward balance.

## API/Server Tests

Test:

- authentication;
- authorization;
- transaction creation;
- transaction editing;
- transaction deletion;
- category validation;
- monthly filtering;
- bill calculations;
- goal calculations.

## UI Tests

Test:

- adding a transaction;
- editing a transaction;
- deleting a transaction;
- changing month;
- creating a budget;
- creating a goal;
- responsive navigation.

## End-to-End Test

The main test should follow:

```text
Register/Login
 ↓
Create Budget
 ↓
Add Income
 ↓
Add Expense
 ↓
Dashboard Updates
 ↓
Add Bill
 ↓
Pay Bill
 ↓
Create Goal
 ↓
Add Savings
 ↓
View Report
 ↓
Change Month
```

---

# 38. MVP Scope

The first release should contain:

```text
Authentication-ready architecture
Monthly income
Budget allocation
Categories
Subcategories
Expense tracking
Income tracking
Budget vs actual
Remaining budget
Dashboard
Bills
Savings
Goals
Monthly history
Reports
Need/Want tracking
Light/Dark theme
Responsive mobile design
Responsive desktop design
```

---

# 39. Features Not Included in MVP

Do not build these initially:

- bank account connections;
- automatic bank imports;
- investment trading;
- cryptocurrency trading;
- credit scoring;
- tax filing;
- complex accounting;
- financial product recommendations;
- AI financial advisor;
- household collaboration;
- advanced notifications;
- native Android/iOS application.

These can be considered after the core application is stable.

---

# 40. Future Expansion

The architecture should leave room for:

## Authentication

```text
Email verification
Password reset
OAuth
Two-factor authentication
```

## Multiple Accounts

```text
Cash
Bank
Mobile Money
Credit Card
```

## Recurring Transactions

```text
Monthly salary
Rent
Internet
Subscriptions
```

## Notifications

```text
Bill due
Budget nearly finished
Savings reminder
```

## Advanced Goals

```text
Emergency Fund
Land
Business
Investment
Retirement
```

## Investment Tracking

Future versions may track:

- investments;
- portfolio value;
- contributions;
- returns.

The MVP should only track investment contributions as financial goals/categories.

---

# 41. Project Development Rules

The development agent must follow these rules.

### Rule 1

Do not build features that are not part of the current scope without first documenting them.

### Rule 2

Do not invent financial calculations.

Use the defined financial rules.

### Rule 3

Financial calculations must be performed safely on the server side.

### Rule 4

The database is the source of truth.

### Rule 5

Every user's financial information must be isolated.

### Rule 6

Do not use floating-point numbers for money.

### Rule 7

Do not duplicate financial totals unnecessarily.

### Rule 8

Do not sacrifice mobile usability for desktop design.

### Rule 9

Do not create a separate page when a reusable component is sufficient.

### Rule 10

Do not add unnecessary libraries.

Every dependency should have a clear reason.

### Rule 11

Do not build the entire application before testing.

Build one feature completely, test it, then continue.

---

# 42. Recommended Build Order

Build in this order:

```text
1. Project Setup
       ↓
2. Database
       ↓
3. Authentication Architecture
       ↓
4. Categories
       ↓
5. Monthly Budget
       ↓
6. Transactions
       ↓
7. Financial Calculations
       ↓
8. Dashboard
       ↓
9. Bills
       ↓
10. Savings & Goals
       ↓
11. Reports
       ↓
12. Responsive Design
       ↓
13. Testing
       ↓
14. Security Review
       ↓
15. Deployment
```

Do not start with advanced charts or visual polish before the financial engine works correctly.

---

# 43. Definition of Done

The MVP is complete when a user can:

```text
Create an account
        ↓
Enter income
        ↓
Create a monthly budget
        ↓
Allocate income
        ↓
Record an expense
        ↓
See the category balance change
        ↓
Track bills
        ↓
Record savings
        ↓
Track goals
        ↓
View reports
        ↓
Switch between months
        ↓
Return later without losing data
```

The application must:

- work on mobile;
- work on desktop;
- persist data;
- calculate financial values correctly;
- protect user data;
- handle errors properly;
- pass core tests;
- deploy successfully;
- use a maintainable project structure.

---

# 44. Deployment Architecture

The target MVP architecture is:

```text
                    GitHub
                       |
                       v
                    Vercel
                       |
                Next.js Application
                 /              \
                /                \
          UI / Pages       Server Logic
                                |
                                v
                           Supabase
                         /           \
                        /             \
                  Supabase Auth    PostgreSQL
                                      |
                                      v
                              Financial Data
```

This architecture minimizes the number of services that need to be managed while still providing a path toward a larger application.

---

# 45. Environment Variables

The application should use environment variables.

Example:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Only public configuration should use `NEXT_PUBLIC_`.

Private service credentials must never be exposed to the browser.

Create:

```text
.env.local
.env.example
```

`.env.local` must never be committed to Git.

---

# 46. Local Development

Recommended setup:

```bash
git clone <repository>
cd <project>

npm install

npm run dev
```

The application should then be available locally through the Next.js development server.

Database configuration and environment setup should be documented separately in the project's setup guide.

---

# 47. Git Strategy

Use clear commits.

Examples:

```text
feat: add monthly budget
feat: add transaction tracking
feat: add savings goals
fix: correct monthly balance calculation
fix: prevent invalid category selection
refactor: simplify dashboard data loading
test: add budget calculation tests
```

Avoid large commits containing unrelated features.

---

# 48. Documentation Structure

The project should contain:

```text
README.md

/docs
├── PRD.md
├── TRD.md
├── APP_FLOW.md
├── UI_UX_DESIGN_BRIEF.md
├── BACKEND_SCHEMA.md
└── IMPLEMENTATION_PLAN.md
```

These documents are the project's product and development reference.

The README explains the project at a high level.

The individual documents contain the detailed specifications.

---

# 49. Final Product Principle

The application should remain focused on one simple idea:

```text
Plan your money.
Track your money.
See what is left.
Save for what matters.
```

Every feature should make one of these things easier.

If a proposed feature does not clearly support the user's ability to plan, track, understand, save or review their money, it should not be part of the MVP.

---

# 50. First Development Milestone

The first working version should achieve this:

```text
User
 ↓
Opens App
 ↓
Creates/Login Account
 ↓
Enters Monthly Income
 ↓
Creates Budget
 ↓
Sees Allocations
 ↓
Records RWF 500 Expense
 ↓
Budget Updates Immediately
 ↓
Remaining Amount Updates
 ↓
Dashboard Reflects New Data
```

Once this works reliably, bills, goals, reports and additional features can be built on top of the same financial foundation.
