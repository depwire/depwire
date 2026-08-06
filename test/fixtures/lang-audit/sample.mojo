fn process() -> Int:
    var local = 1
    fn helper() -> Int:
        return process()
    return helper()

struct Worker:
    fn process(self) -> Int:
        var local = 2
        return local
