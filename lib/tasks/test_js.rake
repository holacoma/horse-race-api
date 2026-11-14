# Tests de JavaScript (node:test, sin dependencias): por ahora, la música de la carrera (test/javascript/).
namespace :test do
  desc "Corre los tests de JavaScript con node --test"
  task :js do
    sh "node", "--test", "test/javascript/"
  end
end
