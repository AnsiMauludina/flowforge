package scheduler

import (
	"context"
	"fmt"
	"log"
	"sync"

	"github.com/google/uuid"
	"github.com/robfig/cron/v3"
	"github.com/AnsiMauludina/flowforge/internal/model"
)

// TriggerFn is called when a cron job fires to execute a workflow.
// It receives a workflow and must create the run record + execute it.
type TriggerFn func(workflow *model.WorkflowDefinition, triggerType string)

// Scheduler manages cron jobs for all active scheduled workflows.
type Scheduler struct {
	cron      *cron.Cron
	entries   map[uuid.UUID]cron.EntryID // workflowID → cron entry ID
	mu        sync.Mutex
	triggerFn TriggerFn
	logger    *log.Logger
}

// New creates and starts a new Scheduler.
func New(triggerFn TriggerFn, logger *log.Logger) *Scheduler {
	if logger == nil {
		logger = log.Default()
	}
	s := &Scheduler{
		// Use seconds-level precision off — standard 5-field cron (min, hour, dom, mon, dow)
		cron:      cron.New(cron.WithLogger(cron.DiscardLogger)),
		entries:   make(map[uuid.UUID]cron.EntryID),
		triggerFn: triggerFn,
		logger:    logger,
	}
	s.cron.Start()
	return s
}

// LoadAll schedules every workflow that has a non-empty cron expression.
// Called once at startup.
func (s *Scheduler) LoadAll(workflows []model.WorkflowDefinition) {
	for _, wf := range workflows {
		wf := wf // capture loop var
		if err := s.Add(&wf); err != nil {
			s.logger.Printf("⚠️  scheduler: failed to schedule workflow %s (%s): %v",
				wf.Name, wf.ID, err)
		}
	}
	s.logger.Printf("✅ scheduler: loaded %d cron job(s)", len(s.entries))
}

// Add registers (or replaces) a cron job for a workflow.
// No-op if CronExpression is empty.
func (s *Scheduler) Add(wf *model.WorkflowDefinition) error {
	if wf.CronExpression == "" {
		return nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	// Remove existing entry for this workflow if any
	s.removeUnsafe(wf.ID)

	entryID, err := s.cron.AddFunc(wf.CronExpression, func() {
		s.logger.Printf("🕐 scheduler: triggering workflow %s (%s)", wf.Name, wf.ID)
		s.triggerFn(wf, "scheduled")
	})
	if err != nil {
		return fmt.Errorf("invalid cron expression %q for workflow %s: %w",
			wf.CronExpression, wf.ID, err)
	}

	s.entries[wf.ID] = entryID
	s.logger.Printf("📅 scheduler: scheduled workflow %s (%s) → %q",
		wf.Name, wf.ID, wf.CronExpression)
	return nil
}

// Remove cancels the cron job for a workflow, if any.
func (s *Scheduler) Remove(workflowID uuid.UUID) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.removeUnsafe(workflowID)
}

func (s *Scheduler) removeUnsafe(workflowID uuid.UUID) {
	if entryID, ok := s.entries[workflowID]; ok {
		s.cron.Remove(entryID)
		delete(s.entries, workflowID)
	}
}

// Count returns the number of active cron jobs.
func (s *Scheduler) Count() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.entries)
}

// Stop gracefully shuts down the scheduler and waits for running jobs.
func (s *Scheduler) Stop() context.Context {
	return s.cron.Stop()
}
