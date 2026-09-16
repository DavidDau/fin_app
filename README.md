# Personal Financial Management App

> A simple personal finance app for tracking income, controlling expenses, building savings, managing debt, tracking investments, and working toward financial goals.

**Status:** 🚧 In Development
**Version:** `0.1.0`
**Primary Currency:** RWF

---

## 1. Product Goal

Help users understand and improve their finances through a simple cycle:

```text
EARN → PLAN → SPEND → SAVE / PAY DEBT / INVEST → REVIEW → ADJUST
```

The app should answer:

- How much money came in?
- Where did it go?
- Am I following my plan?
- How much have I saved?
- How much debt remains?
- How are my financial goals progressing?
- How has my financial position changed?

The application provides tracking, calculations, and insights. It does **not** make financial decisions for the user.

---

## 2. MVP Features

### Dashboard

- Monthly income
- Expenses
- Savings
- Debt payments
- Available cash
- Budget progress
- Savings goals
- Debt progress
- Recent transactions
- Net worth

### Transactions

Track:

- Income
- Expenses
- Savings
- Debt payments
- Investments

Each transaction includes:

```text
Amount
Category
Date
Payment method
Need / Want
Description
Note
```

### Budget

Create a monthly plan and compare:

```text
Planned vs Actual
```

For each category:

- Planned amount
- Actual amount
- Remaining
- Variance
- Status

The app must support **variable monthly income**.

### Savings Goals

Track:

- Goal
- Target amount
- Current amount
- Progress
- Target date
- Contributions

Examples:

- Emergency fund
- Land
- Education
- Business
- Retirement

### Debt

Track:

- Original balance
- Remaining balance
- Interest rate
- Minimum payment
- Due date
- Payment history

### Investments

Basic tracking of:

- Investment
- Type
- Amount invested
- Current value
- Gain/loss

No personalized investment recommendations.

### Reports

Provide:

- Income and expenses
- Spending by category
- Planned vs actual
- Savings progress
- Debt progress
- Month-to-month comparisons
- Net worth

---

## 3. Core Financial Model

```text
User
 ├── Income
 ├── Transactions
 ├── Budgets
 │    └── Budget Categories
 ├── Savings Goals
 ├── Debts
 └── Investments
```

### Key calculations

```text
Net Cash Flow = Income - Expenses

Savings Rate = Savings / Income × 100

Investment Rate = Investments / Income × 100

Goal Progress = Current Amount / Target Amount × 100

Net Worth = Assets - Liabilities
```

The system must clearly distinguish **planned values** from **actual financial activity**.

Money should use decimal-safe monetary types rather than floating-point arithmetic.

---

## 4. Main User Flow

### First-Time Setup

```text
Sign Up
  ↓
Financial Setup
  ↓
Income
  ↓
Initial Budget
  ↓
Savings Goals
  ↓
Existing Debt
  ↓
Starting Financial Position
  ↓
Dashboard
```

### Daily Flow

```text
Dashboard
  ↓
+
  ↓
Income / Expense / Saving / Debt / Investment
  ↓
Save
  ↓
Financial data updates
```

### Monthly Flow

```text
Set Expected Income
  ↓
Create Budget
  ↓
Track Transactions
  ↓
Track Savings / Debt / Investments
  ↓
Review Planned vs Actual
  ↓
Monthly Review
  ↓
Create Next Month's Plan
```

---

## 5. Architecture

Use a clean separation:

```text
Frontend
    ↓
API
    ↓
Business Logic
    ↓
Database
```

### Initial Stack

**Frontend**

- React
- Vite
- TypeScript/JavaScript
- CSS

**Backend**

- Python
- FastAPI

**Database**

- PostgreSQL
- SQLAlchemy

**Testing**

- Pytest
- Frontend testing tools as appropriate

**Deployment**

- Docker
- Git/GitHub
- Cloud deployment

### Suggested Structure

```text
financial-app/
├── frontend/
│   └── src/
│       ├── components/
│       ├── pages/
│       ├── services/
│       ├── hooks/
│       └── utils/
│
├── backend/
│   └── app/
│       ├── api/
│       ├── models/
│       ├── schemas/
│       ├── services/
│       ├── repositories/
│       └── tests/
│
├── database/
│   └── migrations/
│
├── docs/
├── .env.example
└── README.md
```

---

## 6. Security & Data Integrity

The application handles private financial information.

Implement:

- Authentication
- Authorization
- Password hashing
- User-level data isolation
- Backend ownership checks
- Input validation
- Secure environment variables
- Decimal-safe money handling
- Database transactions for related financial operations
- Preservation of financial history

Users must never access another user's financial data.

---

## 7. MVP Roadmap

### Phase 1: Foundation

- [ ] Repository setup
- [ ] Frontend setup
- [ ] Backend setup
- [ ] PostgreSQL
- [ ] Database migrations
- [ ] Authentication
- [ ] User model

### Phase 2: Core Finance

- [ ] Categories
- [ ] Income
- [ ] Transactions
- [ ] Transaction history
- [ ] Filtering

### Phase 3: Budget

- [ ] Monthly budgets
- [ ] Budget categories
- [ ] Planned vs actual
- [ ] Variable income support

### Phase 4: Savings & Debt

- [ ] Savings goals
- [ ] Contributions
- [ ] Debt tracking
- [ ] Debt payments

### Phase 5: Dashboard & Reports

- [ ] Dashboard
- [ ] Financial summaries
- [ ] Spending analysis
- [ ] Monthly reports
- [ ] Net worth

### Phase 6: Investments

- [ ] Investment tracking
- [ ] Current value
- [ ] Gain/loss

### Phase 7: Testing & Deployment

- [ ] Unit tests
- [ ] API tests
- [ ] Financial calculation tests
- [ ] Security testing
- [ ] Responsive testing
- [ ] Production deployment

---

## 8. Future Features

Not part of the MVP:

- Bank integrations
- Mobile-money integrations
- Automatic transaction imports
- Recurring transactions
- Advanced investment analytics
- Financial forecasting
- Automated financial insights
- Multiple currencies
- Family/shared finances
- Advanced notifications
- PDF reports

Build these only after the core financial workflow is stable.

---

## 9. Definition of Done

A feature is complete when:

- [ ] UI works
- [ ] Backend works
- [ ] Data persists correctly
- [ ] Validation works
- [ ] Authentication/authorization works
- [ ] Financial calculations are correct
- [ ] Loading states exist
- [ ] Empty states exist
- [ ] Error states exist
- [ ] Responsive behavior works
- [ ] Relevant tests pass
- [ ] Existing functionality still works

---

## 10. Guiding Principle

> **Know where your money goes, know where you want it to go, and understand the difference.**

The MVP should make financial tracking easy enough to use every day while providing enough information to make better financial decisions over time.

**Project Status:** 🚧 Planning / MVP Development
