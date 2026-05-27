package config

import (
	"os"
	"strconv"
)

type Config struct {
	DBUrl            string
	RedisUrl         string
	JWTSecret        string
	Port             string
	Env              string
	RateLimit        int
	AnthropicAPIKey  string
}

func Load() *Config {
	return &Config{
		DBUrl:           getEnv("DB_URL", "postgres://flowforge:flowforge123@localhost:5432/flowforge?sslmode=disable"),
		RedisUrl:        getEnv("REDIS_URL", "localhost:6379"),
		JWTSecret:       getEnv("JWT_SECRET", "supersecretkey123"),
		Port:            getEnv("PORT", "8080"),
		Env:             getEnv("ENV", "development"),
		RateLimit:       getEnvInt("RATE_LIMIT", 100),
		AnthropicAPIKey: getEnv("ANTHROPIC_API_KEY", ""),
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