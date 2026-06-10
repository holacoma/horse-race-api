class Horse
  attr_reader :id, :name
  attr_accessor :position

  CATALOG = [
    { id:  1, name: "Secretariat"      }, { id:  2, name: "Man o' War"        },
    { id:  3, name: "Seabiscuit"       }, { id:  4, name: "Phar Lap"          },
    { id:  5, name: "Frankel"          }, { id:  6, name: "Winx"              },
    { id:  7, name: "Affirmed"         }, { id:  8, name: "Citation"          },
    { id:  9, name: "Seattle Slew"     }, { id: 10, name: "Zenyatta"          },
    { id: 11, name: "Ruffian"          }, { id: 12, name: "Cigar"             },
    { id: 13, name: "Hoof Hearted"     }, { id: 14, name: "Neigh Sayer"       },
    { id: 15, name: "Canter Do"        }, { id: 16, name: "Hay Fever"         },
    { id: 17, name: "Stable Genius"    }, { id: 18, name: "Gallop Poll"       },
    { id: 19, name: "Filly Mignon"     }, { id: 20, name: "Stirrup Trouble"   },
    { id: 21, name: "Pasture Bedtime"  }, { id: 22, name: "Mane Event"        },
    { id: 23, name: "Bridle Party"     }, { id: 24, name: "Horsepower"        },
    { id: 25, name: "Jockey McJockface" }, { id: 26, name: "El Pistolero"      },
    { id: 27, name: "Turbo Caballo"    }, { id: 28, name: "Don Trote"         },
    { id: 29, name: "Señor Galope"     }, { id: 30, name: "Viento Loco"       },
    { id: 31, name: "El Relámpago"     }, { id: 32, name: "Pata de Lana"      },
    { id: 33, name: "El Último"        }, { id: 34, name: "Cuatro Patas"      },
    { id: 35, name: "Don Comilón"      }, { id: 36, name: "El Mago"           }
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
