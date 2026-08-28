namespace Outer {
int helper() { return 1; }

class Worker {
public:
    int run();
};

int Worker::run() {
    return helper();
}
}
