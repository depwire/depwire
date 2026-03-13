#include "services.h"
#include "utils.h"
#include <string.h>

int validate_user(const User* user) {
    if (!user) return 0;
    return validate_email(user->email) && strlen(user->name) > 0;
}

int save_user(const User* user) {
    if (!validate_user(user)) return -1;
    return 0;
}

static int internal_check(const User* user) {
    return user->id > 0;
}
