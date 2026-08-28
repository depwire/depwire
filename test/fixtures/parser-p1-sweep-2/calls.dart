int helper() {
  return 1;
}

int run() {
  return helper();
}

class Worker {
  int work() {
    return helper();
  }
}
