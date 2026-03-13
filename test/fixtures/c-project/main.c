#include "models.h"
#include "services.h"
#include "utils.h"
#include <stdio.h>

int main(void) {
    User user = create_user(1, "Alice", "alice@example.com");
    int valid = validate_user(&user);
    printf("User valid: %d\n", valid);
    return 0;
}
