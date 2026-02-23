package config

import "os"

const (
	DefaultPort    = 3000
	DefaultDBURL   = "sqlite:///db.sqlite3"
	MaxRetries     = 3
)

type Config struct {
	DatabaseURL string
	Port        int
	Debug       bool
}

func Load() *Config {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = DefaultDBURL
	}

	return &Config{
		DatabaseURL: dbURL,
		Port:        DefaultPort,
		Debug:       os.Getenv("DEBUG") == "true",
	}
}
