-- CreateTable
CREATE TABLE "payment_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "payment_id" TEXT NOT NULL,
    "order_id" TEXT,
    "merchant_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "customer_email" TEXT,
    "customer_phone" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL,
    "method" TEXT,
    "error_code" TEXT,
    "error_description" TEXT,
    "error_source" TEXT,
    "error_step" TEXT,
    "error_reason" TEXT,
    "raw_payload" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recovery_cases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "payment_event_id" UUID NOT NULL,
    "case_number" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "confidence" DOUBLE PRECISION,
    "failure_reason" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "nudge_count" INTEGER NOT NULL DEFAULT 0,
    "max_retries" INTEGER NOT NULL DEFAULT 3,
    "next_retry_at" TIMESTAMPTZ(6),
    "cooldown_until" TIMESTAMPTZ(6),
    "terminal" BOOLEAN NOT NULL DEFAULT false,
    "recovered_amount" DECIMAL(12,2),
    "recovered_at" TIMESTAMPTZ(6),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "recovery_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_decisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "recovery_case_id" UUID NOT NULL,
    "agent_name" TEXT NOT NULL,
    "model_used" TEXT,
    "action" TEXT NOT NULL,
    "confidence_score" DOUBLE PRECISION,
    "reasoning" TEXT NOT NULL,
    "parameters" JSONB,
    "guardrail_checks" JSONB,
    "execution_status" TEXT NOT NULL DEFAULT 'PENDING',
    "execution_result" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "agent_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "recovery_case_id" UUID NOT NULL,
    "from_state" TEXT,
    "to_state" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor_type" TEXT NOT NULL,
    "actor_id" TEXT,
    "metadata" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_events_payment_id_key" ON "payment_events"("payment_id");

-- CreateIndex
CREATE INDEX "payment_events_merchant_id_idx" ON "payment_events"("merchant_id");

-- CreateIndex
CREATE INDEX "payment_events_status_idx" ON "payment_events"("status");

-- CreateIndex
CREATE INDEX "payment_events_created_at_idx" ON "payment_events"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "recovery_cases_case_number_key" ON "recovery_cases"("case_number");

-- CreateIndex
CREATE INDEX "recovery_cases_payment_event_id_idx" ON "recovery_cases"("payment_event_id");

-- CreateIndex
CREATE INDEX "recovery_cases_status_idx" ON "recovery_cases"("status");

-- CreateIndex
CREATE INDEX "recovery_cases_terminal_idx" ON "recovery_cases"("terminal");

-- CreateIndex
CREATE INDEX "recovery_cases_created_at_idx" ON "recovery_cases"("created_at");

-- CreateIndex
CREATE INDEX "agent_decisions_recovery_case_id_idx" ON "agent_decisions"("recovery_case_id");

-- CreateIndex
CREATE INDEX "agent_decisions_action_idx" ON "agent_decisions"("action");

-- CreateIndex
CREATE INDEX "agent_decisions_execution_status_idx" ON "agent_decisions"("execution_status");

-- CreateIndex
CREATE INDEX "agent_decisions_created_at_idx" ON "agent_decisions"("created_at");

-- CreateIndex
CREATE INDEX "audit_log_entries_recovery_case_id_idx" ON "audit_log_entries"("recovery_case_id");

-- CreateIndex
CREATE INDEX "audit_log_entries_from_state_idx" ON "audit_log_entries"("from_state");

-- CreateIndex
CREATE INDEX "audit_log_entries_to_state_idx" ON "audit_log_entries"("to_state");

-- CreateIndex
CREATE INDEX "audit_log_entries_created_at_idx" ON "audit_log_entries"("created_at");

-- AddForeignKey
ALTER TABLE "recovery_cases" ADD CONSTRAINT "recovery_cases_payment_event_id_fkey" FOREIGN KEY ("payment_event_id") REFERENCES "payment_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_decisions" ADD CONSTRAINT "agent_decisions_recovery_case_id_fkey" FOREIGN KEY ("recovery_case_id") REFERENCES "recovery_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log_entries" ADD CONSTRAINT "audit_log_entries_recovery_case_id_fkey" FOREIGN KEY ("recovery_case_id") REFERENCES "recovery_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
