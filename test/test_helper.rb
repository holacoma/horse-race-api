ENV["RAILS_ENV"] ||= "test"
require_relative "../config/environment"
require "rails/test_help"
require "ostruct"

OmniAuth.config.test_mode = true

module ActiveSupport
  class TestCase
    # fork-based parallelization is not available on Windows
    parallelize(workers: Gem.win_platform? ? 1 : :number_of_processors)
  end
end
