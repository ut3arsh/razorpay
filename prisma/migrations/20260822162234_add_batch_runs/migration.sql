-- CreateTable
CREATE TABLE "batch_runs" (
    "id" UUID NOT NULL,
    "batch_id" TEXT NOT NULL,
    "total_cases" INTEGER NOT NULL,
    "resolved" INTEGER NOT NULL,
    "escalated" INTEGER NOT NULL,
    "stopped_max_retries" INTEGER NOT NULL,
    "no_action" INTEGER NOT NULL,
    "retry_scheduled_pending" INTEGER NOT NULL,
    "nudge_sent_pending" INTEGER NOT NULL,
    "amount_recovered_paise" BIGINT NOT NULL,
    "amount_at_risk_paise" BIGINT NOT NULL,
    "recovery_rate_pct" DOUBLE PRECISION NOT NULL,
    "false_escalation_rate_pct" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "batch_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "batch_runs_batch_id_key" ON "batch_runs"("batch_id");
