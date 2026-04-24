# Analytics Module

This module provides comprehensive analytics for the payment platform, including merchant performance metrics and top merchant identification.

## API Endpoints

### GET /api/v1/admin/analytics/merchants

Retrieves general merchant analytics including signup trends and activation rates.

#### Response Format

```json
{
  "generatedAt": "2026-04-24T10:00:00.000Z",
  "dailySignups": [
    {
      "date": "2026-04-01",
      "signups": 15
    }
  ],
  "activationRate": {
    "windowDays": 7,
    "activatedMerchants": 85,
    "totalMerchants": 100,
    "percentage": 85
  },
  "monthlyActiveMerchants": {
    "month": "2026-04",
    "count": 250
  }
}
```

### GET /api/v1/admin/analytics/top-merchants

Retrieves the top merchants ranked by total USD volume in the selected period.

#### Query Parameters

- `limit` (optional): Number of merchants to return (1-100, default: 10)
- `period` (optional): Time period for analysis (`7d`, `30d`, `90d`, default: `30d`)

#### Example Request

```bash
GET /api/v1/admin/analytics/top-merchants?limit=10&period=30d
```

#### Response Format

```json
{
  "merchants": [
    {
      "businessName": "Acme Corp",
      "volume": 125000.50,
      "paymentCount": 450,
      "settlementCount": 12,
      "country": "US"
    },
    {
      "businessName": "Global Payments Ltd",
      "volume": 98750.25,
      "paymentCount": 320,
      "settlementCount": 8,
      "country": "CA"
    }
  ],
  "period": "30d",
  "generatedAt": "2026-04-24T10:00:00.000Z"
}
```

## Top Merchants Features

- **Volume-based ranking**: Merchants ordered by total USD volume
- **Tie-breaking**: When volumes are equal, merchants are ordered by payment count
- **Period filtering**: Configurable time periods (7, 30, or 90 days)
- **Caching**: Results cached for 10 minutes for improved performance
- **Active merchants only**: Only includes merchants with `active` status
- **Confirmed payments only**: Only counts payments with status `confirmed`, `settling`, or `settled`

## Use Cases

- Identify platform's most valuable merchants
- Analyze merchant performance distribution
- Monitor merchant growth trends
- Platform capacity planning
- Business development prioritization
- Performance analysis and optimization