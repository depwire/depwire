helper <- function() {
  1
}

run <- function() {
  helper()
  lapply(list(1), function(value) helper())
}

wrapper(
  callback = function() {
    helper()
  }
)
