class Horse
  attr_reader :id, :name
  attr_accessor :position

  CATALOG = [
    { id: 1, name: "Thunder" },
    { id: 2, name: "Lightning" },
    { id: 3, name: "Storm" },
    { id: 4, name: "Blaze" },
    { id: 5, name: "Shadow" },
    { id: 6, name: "Spirit" }
  ].freeze

  def initialize(id:, name:)
    @id = id
    @name = name
    @position = 0.0
  end

  def self.all
    CATALOG.map { |attrs| new(**attrs) }
  end

  def self.find(id)
    attrs = CATALOG.find { |h| h[:id] == id }
    new(**attrs) if attrs
  end
end
