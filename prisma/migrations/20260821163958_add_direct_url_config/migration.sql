-- AlterTable
ALTER TABLE "agent_decisions" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "audit_log_entries" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "payment_events" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "recovery_cases" ALTER COLUMN "id" DROP DEFAULT;
