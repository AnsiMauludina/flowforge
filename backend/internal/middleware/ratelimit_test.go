package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func setupRateLimitRouter(limit int, period time.Duration) *gin.Engine {
	gin.SetMode(gin.TestMode)
	rl := NewRateLimiter(limit, period)
	r := gin.New()
	r.Use(RateLimit(rl))
	r.GET("/test", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})
	return r
}

func TestRateLimit_AllowsUnderLimit(t *testing.T) {
	r := setupRateLimitRouter(5, time.Minute)

	for i := 0; i < 5; i++ {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest(http.MethodGet, "/test", nil)
		req.RemoteAddr = "1.2.3.4:1234"
		r.ServeHTTP(w, req)
		assert.Equal(t, http.StatusOK, w.Code, "request %d should be allowed", i+1)
	}
}

func TestRateLimit_BlocksOverLimit(t *testing.T) {
	r := setupRateLimitRouter(3, time.Minute)

	for i := 0; i < 3; i++ {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest(http.MethodGet, "/test", nil)
		req.RemoteAddr = "5.6.7.8:1234"
		r.ServeHTTP(w, req)
		assert.Equal(t, http.StatusOK, w.Code)
	}

	// 4th request must be blocked
	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/test", nil)
	req.RemoteAddr = "5.6.7.8:1234"
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusTooManyRequests, w.Code)
	assert.NotEmpty(t, w.Header().Get("Retry-After"))
}

func TestRateLimit_ResetsAfterWindow(t *testing.T) {
	// Use a very short window so we can test reset within the test
	r := setupRateLimitRouter(2, 100*time.Millisecond)

	send := func(ip string) int {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest(http.MethodGet, "/test", nil)
		req.RemoteAddr = ip + ":1234"
		r.ServeHTTP(w, req)
		return w.Code
	}

	assert.Equal(t, http.StatusOK, send("9.9.9.9"))
	assert.Equal(t, http.StatusOK, send("9.9.9.9"))
	assert.Equal(t, http.StatusTooManyRequests, send("9.9.9.9"))

	// Wait for window to reset
	time.Sleep(120 * time.Millisecond)

	assert.Equal(t, http.StatusOK, send("9.9.9.9"), "should be allowed after window reset")
}

func TestRateLimit_IsolatesByIP(t *testing.T) {
	r := setupRateLimitRouter(1, time.Minute)

	for _, ip := range []string{"10.0.0.1", "10.0.0.2", "10.0.0.3"} {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest(http.MethodGet, "/test", nil)
		req.RemoteAddr = ip + ":1234"
		r.ServeHTTP(w, req)
		assert.Equal(t, http.StatusOK, w.Code, "first request from %s should be allowed", ip)
	}
}

func TestRateLimit_Headers(t *testing.T) {
	r := setupRateLimitRouter(10, time.Minute)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest(http.MethodGet, "/test", nil)
	req.RemoteAddr = "2.3.4.5:1234"
	r.ServeHTTP(w, req)

	assert.Equal(t, "10", w.Header().Get("X-RateLimit-Limit"))
	assert.Equal(t, "9", w.Header().Get("X-RateLimit-Remaining"))
	assert.NotEmpty(t, w.Header().Get("X-RateLimit-Reset"))
}
