process <- function() {
  local <- 1
  helper <- function() {
    process()
  }
  helper()
}

Worker <- setRefClass("Worker", methods = list(
  process = function() {
    local <- 2
    local
  }
))
