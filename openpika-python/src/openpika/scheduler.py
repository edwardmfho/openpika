"""Cron scheduler — runs cron jobs on their defined schedule.

Start as a background asyncio task:
    asyncio.create_task(run_scheduler(default_model))

Jobs are fired when `next_run` is in the past. After each run the job's
`last_run` and `next_run` fields are updated using the croniter library.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime

logger = logging.getLogger(__name__)


async def run_scheduler(default_model: str, interval_seconds: int = 60) -> None:
    """Continuously poll for due cron jobs. Call via asyncio.create_task()."""
    logger.info("Cron scheduler started (poll interval=%ds)", interval_seconds)
    while True:
        await asyncio.sleep(interval_seconds)
        try:
            await _tick(default_model)
        except Exception:
            logger.exception("Cron scheduler tick error")


async def _tick(default_model: str) -> None:
    try:
        from croniter import croniter
    except ImportError:
        logger.warning(
            "croniter not installed — cron scheduler is disabled. "
            "Run: pip install croniter"
        )
        return

    from openpika.agent import make_agent, run_agent
    from openpika.db import list_cron_jobs, update_cron_job

    now = datetime.now(UTC)
    jobs = await list_cron_jobs(enabled_only=True)

    for job in jobs:
        # Determine if the job is due
        due = True
        if job.next_run:
            try:
                next_run_dt = datetime.fromisoformat(job.next_run)
                # Make timezone-aware if naive (assume UTC)
                if next_run_dt.tzinfo is None:
                    next_run_dt = next_run_dt.replace(tzinfo=UTC)
                due = next_run_dt <= now
            except ValueError:
                due = True  # malformed timestamp → run now

        if not due:
            continue

        logger.info("Firing cron job '%s' (schedule: %s)", job.name, job.schedule)
        model = job.model or default_model

        try:
            agent, _ = await make_agent(model)
            reply, _ = await run_agent(agent, job.prompt, [])
            logger.info("Cron job '%s' completed: %.100s", job.name, reply)
        except Exception:
            logger.exception("Cron job '%s' failed", job.name)

        # Advance the schedule
        try:
            next_dt = croniter(job.schedule, now).get_next(datetime)
            await update_cron_job(
                job.id,
                last_run=now.isoformat(),
                next_run=next_dt.isoformat(),
            )
        except Exception:
            logger.exception("Failed to advance schedule for cron job '%s'", job.name)
