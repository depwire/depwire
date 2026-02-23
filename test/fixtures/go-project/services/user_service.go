package services

import (
	"errors"
	"github.com/testuser/goproject/models"
	"github.com/testuser/goproject/config"
)

type UserService struct {
	dbURL string
	users map[int]*models.User
	nextID int
}

func NewUserService(dbURL string) *UserService {
	return &UserService{
		dbURL:  dbURL,
		users:  make(map[int]*models.User),
		nextID: 1,
	}
}

func (s *UserService) GetAll() ([]*models.User, error) {
	result := make([]*models.User, 0, len(s.users))
	for _, u := range s.users {
		result = append(result, u)
	}
	return result, nil
}

func (s *UserService) GetByID(id int) (*models.User, error) {
	user, ok := s.users[id]
	if !ok {
		return nil, errors.New("user not found")
	}
	return user, nil
}

func (s *UserService) Create(name, email string) (*models.User, error) {
	user := models.NewUser(name, email)
	user.ID = s.nextID
	s.nextID++
	s.users[user.ID] = user
	return user, nil
}
