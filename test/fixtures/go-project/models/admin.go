package models

type AdminUser struct {
	User
	Permissions []string
}

func NewAdmin(name, email string, perms []string) *AdminUser {
	return &AdminUser{
		User: User{
			Name:  name,
			Email: email,
			Role:  "admin",
		},
		Permissions: perms,
	}
}

func (a *AdminUser) HasPermission(perm string) bool {
	for _, p := range a.Permissions {
		if p == perm {
			return true
		}
	}
	return false
}
