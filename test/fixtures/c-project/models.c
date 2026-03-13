#include "models.h"
#include <string.h>

User create_user(int id, const char* name, const char* email) {
    User user;
    user.id = id;
    strncpy(user.name, name, MAX_NAME_LEN - 1);
    strncpy(user.email, email, MAX_EMAIL_LEN - 1);
    return user;
}

static User empty_user(void) {
    User user = {0};
    return user;
}
