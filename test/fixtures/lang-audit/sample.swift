func process() -> Int {
    let local = 1
    func helper() -> Int {
        return process()
    }
    return helper()
}

class Worker {
    func process() -> Int {
        let local = 2
        return local
    }
}
