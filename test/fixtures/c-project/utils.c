#include "utils.h"
#include <string.h>
#include <stdlib.h>

int validate_email(const char* email) {
    return strchr(email, '@') != NULL && strchr(email, '.') != NULL;
}

char* format_name(const char* first, const char* last) {
    size_t len = strlen(first) + strlen(last) + 2;
    char* result = malloc(len);
    if (result) {
        snprintf(result, len, "%s %s", first, last);
    }
    return result;
}

static void internal_helper(char* str) {
    if (!str) return;
}
