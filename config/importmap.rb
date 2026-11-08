# Pin npm packages by running ./bin/importmap

pin "application"
pin "@hotwired/stimulus", to: "stimulus.min.js"
pin "@hotwired/stimulus-loading", to: "stimulus-loading.js"
pin_all_from "app/javascript/controllers", under: "controllers"

# La carrera 3D (public/prototipos/carrera3d) se carga solo en la sala, con import(): sin precarga en las demás páginas.
pin "three", to: "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js", preload: false
pin "three/addons/loaders/GLTFLoader.js", to: "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js", preload: false
pin "three/addons/utils/BufferGeometryUtils.js", to: "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js", preload: false
