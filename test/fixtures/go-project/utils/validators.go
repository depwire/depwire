package utils

import "regexp"

var emailRegex = regexp.MustCompile(`^[\w.-]+@[\w.-]+\.\w+$`)

func ValidateEmail(email string) bool {
	return emailRegex.MatchString(email)
}

func ValidateName(name string) bool {
	return len(name) >= 2
}
