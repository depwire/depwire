int process() {
  int local = 1;
  int helper() {
    return process();
  }
  return helper();
}

class Worker {
  int process() {
    int local = 2;
    return local;
  }
}
