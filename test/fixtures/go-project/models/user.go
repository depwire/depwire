package models

import "fmt"

type User struct {
	ID    int
	Name  string
	Email string
	Role  string
}

func NewUser(name, email string) *User {
	return &User{
		Name:  name,
		Email: email,
		Role:  "user",
	}
}

func (u *User) IsAdmin() bool {
	return u.Role == "admin"
}

func (u *User) String() string {
	return fmt.Sprintf("%s <%s>", u.Name, u.Email)
}
