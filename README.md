# 📊 Business Market Monitor

![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)
![Express.js](https://img.shields.io/badge/Express.js-Backend-000000?logo=express&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-Database-4479A1?logo=mysql&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6%2B-F7DF1E?logo=javascript&logoColor=black)
![Nodemailer](https://img.shields.io/badge/Nodemailer-Email%20Alerts-2C3E50)

> A full-stack business intelligence platform for monitoring raw-material prices, managing price alerts, tracking market signals, and turning important price changes into actionable business notifications.

---

## 🎯 Problem Statement

Businesses that depend on raw materials such as **crude oil, packaging materials, chemicals, metals, and other commodities** are affected by frequent price fluctuations.

Monitoring these prices manually becomes difficult when a business needs to track multiple materials at the same time.

### Common problems include:

- Manually checking prices repeatedly
- Missing important price changes
- Tracking multiple material thresholds
- Maintaining historical price records
- Remembering when a price condition has been reached
- Manually notifying the responsible person
- Lack of a centralized view of price activity and alerts

### The Core Problem

> **How can a business continuously monitor important material prices and automatically notify the right person when a predefined price condition is reached?**

---

## 💡 The Solution

**Business Market Monitor** provides a centralized system where businesses can:

```text
Track Materials
      ↓
Record Prices
      ↓
Define Alert Rules
      ↓
Evaluate Price Conditions
      ↓
Create Alert Events
      ↓
Send Email Notification
      ↓
Maintain Alert History
```

The goal is to reduce manual price monitoring and convert market-price changes into **actionable business alerts**.

---

## 🚀 Overview

Business Market Monitor is a full-stack web application designed around the workflow of monitoring business-critical raw-material prices.

A business can currently:

- Track raw materials
- Add and retrieve material prices
- Maintain historical price data
- Create price alert rules
- Automatically evaluate price conditions
- Generate alert events
- Send email notifications through SMTP
- Track email delivery status
- View alert history
- Access historical price trends
- View market news through the dashboard

The system is being developed incrementally using a layered backend architecture.

---

# ✨ Key Features

## 📦 Material Tracking

Businesses can manage the materials that are relevant to their operations.

### Supported capabilities

- Business-specific tracked materials
- Custom materials
- Track / untrack materials
- Unit of measurement support
- Business-level ownership and isolation

Each business works with its own tracked-material data.

---

## 💰 Price Tracking

The system supports manual price recording for tracked materials.

### Each price point contains

- Material
- Price
- Recorded At
- Source

### Example

```text
Crude Oil

₹350 → ₹360 → ₹400 → ₹543
```

Historical observations are preserved instead of overwriting previous values.

Price records are intentionally treated as **insert-only historical data**.

---

## 🚨 Price Alert Engine

Businesses can define price conditions such as:

```text
Price Above ₹500
Price Below ₹300
```

Currently supported conditions:

- `PRICE_ABOVE`
- `PRICE_BELOW`

When a new price is recorded, the alert engine evaluates the active rules for that material.

### Alert Flow

```text
New Price
    ↓
Active Alert Rules
    ↓
Condition Evaluation
    ↓
Matching Rule
    ↓
Alert Event
    ↓
Email Notification
```

---

## 📧 Email Notifications

When a configured price condition is triggered, the system sends an email notification through SMTP.

The notification contains:

- Material name
- Alert condition
- Threshold price
- Triggered price
- Triggered time

### Delivery Lifecycle

```text
PENDING
   ↓
SENT
```

or

```text
PENDING
   ↓
FAILED
```

Email delivery status is stored with the alert event.

The current alert-to-email workflow has been tested successfully using **Gmail SMTP**.

---

## 📜 Alert History

Every triggered alert is stored as an alert event.

The system records information such as:

- Triggered time
- Alert rule
- Triggered price
- Threshold price snapshot
- Condition snapshot
- Notification channel
- Delivery status

This provides an auditable history of alert activity.

### Example

```text
Price Above ₹543
Triggered Price: ₹1350.45
Delivery Status: SENT
```

---

## 📈 Historical Price Trends

The application provides access to historical price information for tracked materials.

The trend module supports:

- Historical price data
- Date-based filtering
- Pagination
- Multi-material comparison
- Chronological price series

The returned data is structured for chart-ready consumption.

---

## 📰 Market News

A dedicated news module is included for integrating relevant market news into the monitoring dashboard.

The dashboard provides a centralized place for businesses to view market-related information alongside their tracked materials and alerts.

---

# 🏗️ System Architecture

The backend follows a layered architecture designed to keep responsibilities separated.

```text
                    Frontend
                       ↓
                     Routes
                       ↓
                  Controllers
                       ↓
                    Services
                       ↓
                 Repositories
                       ↓
                    MySQL
```

### External Services

External integrations such as email are kept separate from the core business logic.

```text
Business Logic
      ↓
Notification Service
      ↓
Mailer
      ↓
SMTP Provider
      ↓
User Email
```

---

# 🚨 Alert Architecture

The complete price-alert workflow is designed as:

```text
User Adds Price
       ↓
Price Controller
       ↓
Price Ingestion Service
       ↓
Price Repository
       ↓
Alert Evaluation Service
       ↓
Active Alert Rules
       ↓
Condition Check
       ↓
Alert Event Repository
       ↓
Notification Service
       ↓
Email Template
       ↓
Mailer / Nodemailer
       ↓
SMTP
       ↓
User Email
       ↓
Delivery Status Update
```

This separation allows the alert engine, notification logic, email transport, and database access to evolve independently.

---

# 🔐 Engineering & Security

The project focuses on practical backend engineering and data integrity rather than only basic CRUD operations.

## Parameterized SQL

Database queries use parameterized statements to reduce SQL injection risks.

## Business Data Isolation

Business-owned resources are scoped using `business_id` so that data belonging to one business is not exposed to another business.

## Immutable Price History

Historical price points are stored as separate records instead of overwriting previous observations.

## Alert Event Snapshots

When an alert is triggered, the system stores the relevant threshold, condition, and triggered price at that moment.

This preserves the historical state of the alert.

## Environment-Based Configuration

Environment-specific configuration and secrets are loaded through environment variables.

Sensitive configuration such as:

- Database credentials
- JWT secrets
- SMTP credentials

is not intended to be committed to the repository.

## Layered Architecture

The application separates:

```text
HTTP Layer
    ↓
Business Logic
    ↓
Data Access
    ↓
Database
```

This makes the codebase easier to maintain and extend.

---

# 🛠️ Tech Stack

## Backend

- Node.js
- Express.js
- MySQL
- mysql2
- Nodemailer
- JWT
- bcrypt
- node-cron

## Frontend

- HTML
- CSS
- JavaScript

## Development

- Git
- GitHub
- Database migrations
- Environment-based configuration

---

# 📂 Project Architecture

High-level backend structure:

```text
backend/
│
├── src/
│   ├── config/
│   ├── constants/
│   ├── controllers/
│   ├── database/
│   ├── email/
│   │   └── templates/
│   ├── jobs/
│   ├── middleware/
│   ├── migrations/
│   ├── repositories/
│   ├── routes/
│   ├── services/
│   ├── utils/
│   └── validators/
│
├── logs/
├── scripts/
├── .env
├── package.json
└── server.js
```

The architecture is organized so that database queries, business logic, HTTP handling, validation, and external integrations remain separated.

---

# 📌 Development Progress

The project is being developed incrementally through multiple phases.

| Phase | Module | Status |
|---|---|---|
| Phase 1 | Project Foundation | ✅ |
| Phase 2 | Authentication | ✅ |
| Phase 3 | Business Profile | ✅ |
| Phase 4 | Knowledge Base | ✅ |
| Phase 5 | Material Tracking | ✅ |
| Phase 6 | Price Tracking Foundation | ✅ |
| Phase 7 | Price Monitoring | ✅ |
| Phase 8 | Market News | ✅ |
| Phase 9 | Alert Rules & Email Alerts | ✅ |
| Phase 10 | Dashboard | ✅ |
| Phase 11 | Historical Trends | ✅ |

---

# 🔄 Current Working Workflow

The currently functional price-alert workflow is:

```text
Tracked Material
       ↓
Add Price
       ↓
Store Price
       ↓
Evaluate Active Alert Rules
       ↓
Create Alert Event
       ↓
Send Email
       ↓
Update Delivery Status
       ↓
View Alert History
```

### Tested Example

```text
Material:
Crude Oil

Alert:
Price Above ₹543

Triggered Price:
₹1350.45

Result:
Email Sent Successfully
```

---

# 📸 Screenshots

Screenshots of the application can be added here as the UI continues to evolve.

### Dashboard

<img width="1920" height="1028" alt="image" src="https://github.com/user-attachments/assets/cd6978aa-bbcb-4bba-a0df-ab39a535fc85" />



### Alert Rules

<img width="1920" height="1027" alt="image" src="https://github.com/user-attachments/assets/a27722f2-81bb-4b62-bab1-9495e4990e85" />


### Alert History

<img width="1920" height="1032" alt="image" src="https://github.com/user-attachments/assets/b5b02ad8-58f3-4e8d-b21b-7792c2eaafd5" />


### Email Notification

<img width="959" height="1600" alt="WhatsApp Image 2026-08-26 at 4 34 16 PM" src="https://github.com/user-attachments/assets/b3e9faf7-2388-4aae-9933-3636de508d4d" />


---

# 🗺️ Roadmap

The project is designed to evolve from manual monitoring into a more automated market-monitoring platform.

### Planned improvements

- Automated market-price ingestion
- Scheduled price ingestion
- Scheduled alert evaluation
- Automated news ingestion
- Additional market-data sources
- Additional notification channels
- More advanced alert conditions
- Rich price charts
- Price-change analytics
- Automated testing
- CI/CD
- Production deployment
- Monitoring and observability

---

# ⚙️ Local Setup

## 1. Clone the Repository

```bash
git clone https://github.com/subhash446/business-market-monitor.git
cd business-market-monitor
```

## 2. Install Dependencies

```bash
cd backend
npm install
```

## 3. Configure Environment Variables

Create a `.env` file using the project's environment configuration.

Example:

```env
DB_HOST=localhost
DB_PORT=3306
DB_NAME=business_market_monitor
DB_USER=root
DB_PASSWORD=your_password

JWT_ACCESS_SECRET=your_access_secret
JWT_REFRESH_SECRET=your_refresh_secret

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_app_password
SMTP_FROM_EMAIL=your_email@gmail.com
```

> ⚠️ Never commit `.env` or real credentials to GitHub.

For Gmail SMTP, use an appropriate **App Password** rather than exposing your normal Gmail password.

## 4. Start the Server

```bash
node server.js
```

The API runs on:

```text
http://localhost:5000
```

Health check:

```text
/api/v1/health
```

---

# 🎯 Project Vision

The long-term goal is to move businesses from:

```text
Manual Price Checking
        ↓
Manual Monitoring
        ↓
Manual Decisions
```

towards:

```text
Market Data
     ↓
Automated Monitoring
     ↓
Rule Evaluation
     ↓
Actionable Alerts
     ↓
Business Decision
```

The broader vision is to turn raw market data into **timely, business-relevant intelligence**.

---

## 👨‍💻 Author

**Subhash Kumar Yadav**

B.Tech Information Technology

- **GitHub:** [subhash446](https://github.com/subhash446)
- **LinkedIn:** [Subhash Kumar Yadav](https://www.linkedin.com/in/subhash-kumar-yadav-062111266/)

---

## 📌 Project Status

🟢 **Active Development**

The core material tracking, price recording, alert evaluation, email notification, delivery-status tracking, and alert-history workflow is currently functional.

The project is continuing toward greater automation, richer market intelligence, and production readiness.
