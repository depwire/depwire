int process() {
    int local = 1;
    auto helper = [](){ return process(); };
    return helper();
}

class Worker {
public:
    int process() {
        int local = 2;
        return local;
    }
};
