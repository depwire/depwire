def process
  local = 1
  helper = lambda { process }
  helper.call
end

class Worker
  def process
    local = 2
    local
  end
end
