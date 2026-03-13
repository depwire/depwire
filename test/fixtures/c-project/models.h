#ifndef MODELS_H
#define MODELS_H

#define MAX_NAME_LEN 64
#define MAX_EMAIL_LEN 128

typedef struct {
    int id;
    char name[MAX_NAME_LEN];
    char email[MAX_EMAIL_LEN];
} User;

typedef enum {
    ROLE_ADMIN,
    ROLE_MEMBER,
    ROLE_GUEST
} UserRole;

typedef int UserId;

#endif
