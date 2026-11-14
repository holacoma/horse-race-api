namespace :club do
  desc "Da (o saca) el permiso de usuario especial: ve el botón para adelantar travesías. Uso: bin/rails club:admin EMAIL=... [SACAR=1]"
  task admin: :environment do
    email = ENV.fetch("EMAIL") { abort "Falta EMAIL=..." }
    user = User.find_by(email: email) or abort "No hay ningún usuario con ese email (tiene que haber entrado con Google)."
    user.update!(admin: ENV["SACAR"] != "1")
    puts "#{user.username}: #{user.admin? ? 'es' : 'ya no es'} usuario especial."
  end
end
