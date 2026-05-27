package middleware

import (
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// window holds the request count and the moment the window started.
type window struct {
	mu       sync.Mutex
	count    int
	resetAt  time.Time
}

// RateLimiter holds all per-key windows and the limiter configuration.
type RateLimiter struct {
	mu       sync.Mutex
	windows  map[string]*window
	limit    int           // max requests per period
	period   time.Duration // length of each window
}

// NewRateLimiter creates a limiter that allows `limit` requests per `period`.
// A background goroutine cleans up expired windows every 2×period.
func NewRateLimiter(limit int, period time.Duration) *RateLimiter {
	rl := &RateLimiter{
		windows: make(map[string]*window),
		limit:   limit,
		period:  period,
	}
	go rl.cleanup()
	return rl
}

// allow returns (remaining, resetAt, allowed).
func (rl *RateLimiter) allow(key string) (int, time.Time, bool) {
	rl.mu.Lock()
	w, ok := rl.windows[key]
	if !ok {
		w = &window{}
		rl.windows[key] = w
	}
	rl.mu.Unlock()

	w.mu.Lock()
	defer w.mu.Unlock()

	now := time.Now()

	// Start a new window if this is the first request or the previous window expired
	if w.resetAt.IsZero() || now.After(w.resetAt) {
		w.count = 0
		w.resetAt = now.Add(rl.period)
	}

	w.count++
	remaining := rl.limit - w.count
	if remaining < 0 {
		remaining = 0
	}

	return remaining, w.resetAt, w.count <= rl.limit
}

// cleanup removes windows that have been expired for longer than one period,
// preventing unbounded memory growth.
func (rl *RateLimiter) cleanup() {
	ticker := time.NewTicker(2 * rl.period)
	defer ticker.Stop()
	for range ticker.C {
		now := time.Now()
		rl.mu.Lock()
		for key, w := range rl.windows {
			w.mu.Lock()
			expired := !w.resetAt.IsZero() && now.After(w.resetAt.Add(rl.period))
			w.mu.Unlock()
			if expired {
				delete(rl.windows, key)
			}
		}
		rl.mu.Unlock()
	}
}

// RateLimit returns a Gin middleware that limits requests per IP.
// limit = max requests per minute (mapped from cfg.RateLimit).
//
// Response headers:
//
//	X-RateLimit-Limit     – configured limit
//	X-RateLimit-Remaining – requests left in current window
//	X-RateLimit-Reset     – Unix timestamp when window resets
//	Retry-After           – seconds until window resets (only on 429)
func RateLimit(rl *RateLimiter) gin.HandlerFunc {
	return func(c *gin.Context) {
		key := c.ClientIP()

		remaining, resetAt, allowed := rl.allow(key)

		c.Header("X-RateLimit-Limit", fmt.Sprintf("%d", rl.limit))
		c.Header("X-RateLimit-Remaining", fmt.Sprintf("%d", remaining))
		c.Header("X-RateLimit-Reset", fmt.Sprintf("%d", resetAt.Unix()))

		if !allowed {
			retryAfter := int(time.Until(resetAt).Seconds()) + 1
			c.Header("Retry-After", fmt.Sprintf("%d", retryAfter))
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"error":       "rate limit exceeded",
				"retry_after": retryAfter,
			})
			return
		}

		c.Next()
	}
}
