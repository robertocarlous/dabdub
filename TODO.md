# Profile Module Implementation TODO

Approved plan breakdown into logical steps. Mark [x] as completed.

## 1. Database Migration [x]

- Manual migration created: 1769990000000-AddUserProfileFields.ts
- \`npm run migration:run\` running

## 2. Update User Entity [x]

- Added bio, avatarKey, twitterHandle, instagramHandle
- Removed duplicate columns

## 3. Create Profile DTOs [x]

- ✓ all 4 DTOs

## 4. Create Profile Service [x]

- ✓ profile.service.ts
- ✓ profile.service.spec.ts

## 5. Create Profile Controller [x]

- ✓ profile.controller.ts

## 6. Create Profile Module [x]

- ✓ profile.module.ts

## 7. Update Existing Files [ ]

- Extend users/dto/update-profile.dto.ts (align with new)
- Extend users.service.ts update() for new fields
- Align users/dto/user-response.dto.ts with ProfileDto
- app.module.ts: import ProfileModule
- uploads: add AVATAR purpose (optional, reusing MERCHANT_LOGO)

## 8. R2 Public Avatar URLs [ ]

- Placeholder public URL in service (upgrade to presign later)

## 9. Testing [ ]

- Run \`cd backend && npm test profile\`
- Manual endpoints

## 10. Completion [ ]
# Referral Analytics Implementation Plan (#491)

## Steps to Complete:

### 1. Create new files
- [x] backend/src/referrals/referral-analytics.service.ts (all methods: getFunnelStats, getTopReferrers, getCohortComparison, getRewardSpend, getUserReferralStats)
- [x] backend/src/referrals/dto/referral-analytics.dto.ts (DTOs for responses)
- [x] backend/src/referrals/referral-analytics.processor.ts (BullMQ daily job 'compute-referral-analytics')
- [ ] backend/src/referrals/referral-analytics.service.spec.ts (unit tests)

### 2. Update existing files
- [x] backend/src/referrals/referrals.module.ts (import CacheModule, new service/processor)
- [x] backend/src/referrals/referrals.controller.ts (add public GET /track?ref=code for click tracking)
- [ ] backend/src/referrals/referral.service.spec.ts (add tests for interactions)
- [x] backend/src/admin/admin.controller.ts (add GET /admin/referrals/analytics, /admin/referrals/cohort, /admin/referrals/users/:userId)
- [x] backend/src/admin/admin.module.ts (inject ReferralModule or service)

### 3. Branch, commit, tests
- [ ] git checkout -b blackboxai/fix-491-referral-analytics
- [ ] npm test (ensure unit tests pass)
- [ ] cargo test (if contracts affected, unlikely)
- [ ] git add . &amp;&amp; git commit -m "fix(#491): implement referral analytics funnel, top referrers, cohorts, spend tracking + daily cache job"

### 4. Create PR
- [ ] gh pr create --title "fix(#491): Referral analytics — tracking funnel performance" --body "Implements all AC: FunnelStats, click tracking, top referrers, cohort comparison, reward spend, user stats, admin endpoints, daily BullMQ cache job. Tests added. Ready for review." --base main

**Progress: 0/15 complete**

