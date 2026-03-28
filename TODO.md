# Merchant Settlement History Module - Implementation Plan

## Status: ✅ In Progress

### 1. [ ] Create backend/src/settlement/entities/settlement.entity.ts

- TypeORM entity with all AC fields + indexes matching migration

### 2. [ ] Create DTOs in backend/src/settlement/dto/

- settlement-detail.dto.ts
- settlements-query.dto.ts (pagination + filters)
- summary.dto.ts
- monthly-breakdown.dto.ts

### 3. [ ] Implement SettlementHistoryService

- backend/src/settlement/settlement-history.service.ts
- getMerchantSettlements(merchantId, query)
- getSummary(merchantId)
- getMonthlyBreakdown(merchantId)

### 4. [ ] Create Controllers

- backend/src/settlement/settlement.controller.ts
- /merchant/settlements\*, /merchant/settlements/summary, /merchant/settlements/breakdown
- /admin/settlements\*, /admin/settlements/pending

### 5. [ ] Create Module

- backend/src/settlement/settlement.module.ts
- Import TypeOrmModule.forFeature([Settlement]), dependencies

### 6. [ ] Update app.module.ts

- Add import SettlementModule

### 7. [ ] Clean up starter files

- Delete cron.ts, settlement.service.ts, settlement.worker.ts, settlement.entity.ts

### 8. [ ] Add Unit Tests

- settlement-history.service.spec.ts (AC test cases)

### 9. [ ] Follow-up

- Run migrations if needed
- npm run test
- Manual endpoint testing
