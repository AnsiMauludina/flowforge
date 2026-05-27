package config

import (
	"os"
	"strconv"
	"strings"
)

type Config struct {
	DBUrl            string
	RedisUrl         string
	JWTSecret        string
	Port             string
	Env              string
	RateLimit        int
	AnthropicAPIKey  string
	CORSOrigins      []string
}

func Load() *Config {
	corsOrigins := getEnvSlice("CORS_ORIGINS", []string{
		"http://localhost:3000",
		"http://localhost:3001",
		"http://localhost:5173",
	})
	return &Config{
		DBUrl:           getEnv("DB_URL", "postgres://flowforge:flowforge123@localhost:5432/flowforge?sslmode=disable"),
		RedisUrl:        getEnv("REDIS_URL", "localhost:6379"),
		JWTSecret:       getEnv("JWT_SECRET", "supersecretkey123"),
		Port:            getEnv("PORT", "8080"),
		Env:             getEnv("ENV", "development"),
		RateLimit:       getEnvInt("RATE_LIMIT", 100),
		AnthropicAPIKey: getEnv("ANTHROPIC_API_KEY", ""),
		CORSOrigins:     corsOrigins,
	}
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if val := os.Getenv(key); val != "" {
		if i, err := strconv.Atoi(val); err == nil {
			return i
		}
	}
	return fallback
}

// getEnvSlice reads a comma-separated env var into a string slice.
// Returns fallback when the var is unset or empty.
func getEnvSlice(key string, fallback []string) []string {
	val := os.Getenv(key)
	if val == "" {
		return fallback
	}
	parts := strings.Split(val, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if s := strings.TrimSpace(p); s != "" {
			out = append(out, s)
		}
	}
	return out
}