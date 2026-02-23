package main

import (
	"fmt"
	"github.com/testuser/goproject/models"
	"github.com/testuser/goproject/services"
	"github.com/testuser/goproject/config"
)

func main() {
	cfg := config.Load()
	svc := services.NewUserService(cfg.DatabaseURL)

	user, err := svc.Create("Alice", "alice@example.com")
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		return
	}

	fmt.Printf("Created user: %s (ID: %d)\n", user.Name, user.ID)

	users, _ := svc.GetAll()
	fmt.Printf("Total users: %d\n", len(users))
}
