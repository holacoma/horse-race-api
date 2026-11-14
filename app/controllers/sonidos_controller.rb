# Soundboard (solo en desarrollo): lista los candidatos de public/sonidos/candidatos/<momento>/, guarda en
# elegidos.json cuál queda para cada momento y mueve los descartados a candidatos/descartados/<momento>/.
# Los archivos quedan fuera de git.
class SonidosController < ApplicationController
  RAIZ = Rails.public_path.join("sonidos", "candidatos")
  DESCARTADOS = RAIZ.join("descartados")
  ELEGIDOS = RAIZ.join("elegidos.json")
  NOTAS = RAIZ.join("notas.json")
  MARCAS = RAIZ.join("marcas.json")
  MEZCLA = RAIZ.join("mezcla.json")
  MEDIDAS = RAIZ.join("medidas.json")
  MOMENTOS = %w[sala inicio transformacion final].freeze
  EXTENSIONES = %w[.mp3 .ogg .wav .m4a .flac .webm].freeze
  NOMBRE = /\A[\w.\- ]+\z/

  def candidatos
    MOMENTOS.each { |m| FileUtils.mkdir_p(RAIZ.join(m)) }
    render json: {
      momentos: listar(RAIZ, except: DESCARTADOS), descartados: listar(DESCARTADOS).reject { |_, a| a.empty? },
      elegidos: elegidos, notas: notas, marcas: leer(MARCAS), mezcla: leer(MEZCLA), medidas: medidas, paleta: paleta
    }
  end

  # Marcas en un segundo de un tema: [{ t, tipo: "si" | "no", texto }]. Reemplaza la lista de ese tema.
  def marcas
    clave = params.require(:clave).to_s
    return head :unprocessable_entity unless clave_de_archivo?(clave)

    lista = Array(params[:marcas]).map { |m| { "t" => m[:t].to_f.round(1), "tipo" => m[:tipo] == "no" ? "no" : "si", "texto" => m[:texto].to_s.strip } }
    datos = leer(MARCAS).merge(clave => lista.sort_by { |m| m["t"] }.presence).compact
    File.write(MARCAS, JSON.pretty_generate(datos))
    render json: { marcas: datos }
  end

  # La mezcla deseada: { "<instrumento>": { nivel: 0..100, tono: "<nombre de la paleta>" | nil } }.
  def mezcla
    datos = params.require(:mezcla).permit!.to_h.select { |k, _| k.match?(NOMBRE) }.transform_values do |v|
      { "nivel" => v["nivel"].to_i.clamp(0, 100), "tono" => v["tono"].presence&.to_s }.compact
    end
    File.write(MEZCLA, JSON.pretty_generate(datos))
    render json: { mezcla: datos }
  end

  # Notas para Claude: "general" (para la próxima tanda) o "<momento>/<archivo>" (sobre un sonido). Vacía, se borra.
  def nota
    clave = params.require(:clave).to_s
    texto = params[:texto].to_s.strip
    return head :unprocessable_entity unless clave == "general" || clave_de_archivo?(clave)

    datos = notas.merge(clave => texto.presence).compact
    File.write(NOTAS, JSON.pretty_generate(datos))
    render json: { notas: datos }
  end

  def elegir
    momento = params.require(:momento).to_s
    archivo = params[:archivo].presence&.to_s
    valido = momento.match?(NOMBRE) && RAIZ.join(momento).directory? &&
      (archivo.nil? || (archivo.match?(NOMBRE) && RAIZ.join(momento, archivo).file?))
    return head :unprocessable_entity unless valido

    render json: { elegidos: guardar_elegido(momento, archivo) }
  end

  # Descarta (o, con volver: true, recupera) un archivo: lo mueve entre candidatos/<momento>/ y descartados/<momento>/.
  def descartar
    momento = params.require(:momento).to_s
    archivo = params.require(:archivo).to_s
    return head :unprocessable_entity unless momento.match?(NOMBRE) && archivo.match?(NOMBRE) && momento != DESCARTADOS.basename.to_s

    desde, hacia = [ RAIZ.join(momento), DESCARTADOS.join(momento) ]
    desde, hacia = hacia, desde if ActiveModel::Type::Boolean.new.cast(params[:volver])
    return head :not_found unless desde.join(archivo).file?

    FileUtils.mkdir_p(hacia)
    FileUtils.mv(desde.join(archivo), hacia.join(archivo))
    guardar_elegido(momento, nil) if elegidos[momento] == archivo
    head :no_content
  end

  private

  def listar(raiz, except: nil)
    return {} unless raiz.directory?

    carpetas = raiz.children.select { |d| d.directory? && d != except }
    carpetas.sort_by { |d| [ MOMENTOS.index(d.basename.to_s) || MOMENTOS.size, d.basename.to_s ] }.to_h do |dir|
      archivos = dir.children.select { |f| f.file? && EXTENSIONES.include?(f.extname.downcase) }.sort_by { |f| -f.mtime.to_f }
      [ dir.basename.to_s, archivos.map { |f| { nombre: f.basename.to_s, url: url(f), fecha: f.mtime.iso8601 } } ]
    end
  end

  def elegidos
    ELEGIDOS.file? ? JSON.parse(ELEGIDOS.read) : {}
  end

  def notas
    leer(NOTAS)
  end

  def leer(archivo)
    archivo.file? ? JSON.parse(archivo.read) : {}
  end

  def clave_de_archivo?(clave)
    clave.split("/").then { |p| p.size == 2 && p.all? { |x| x.match?(NOMBRE) } }
  end

  # Peso de cada instrumento por tema, medido con Demucs (script/musica/instrumentos.py).
  def medidas
    leer(MEDIDAS).transform_values { |m| m.except("mtime") }
  end

  # Timbres de la paleta (script/musica/paleta.json) que ya están generados en public/sonidos/paleta/.
  def paleta
    definicion = Rails.root.join("script", "musica", "paleta.json")
    return {} unless definicion.file?

    JSON.parse(definicion.read).filter_map do |e|
      archivo = Rails.public_path.join("sonidos", e["carpeta"], "#{e['nombre']}.mp3")
      next unless archivo.file?

      { "instrumento" => File.basename(e["carpeta"]), "nombre" => e["nombre"], "etiqueta" => e["etiqueta"], "url" => url(archivo) }
    end.group_by { |e| e.delete("instrumento") }
  end

  def guardar_elegido(momento, archivo)
    elegidos.merge(momento => archivo).compact.tap { |datos| File.write(ELEGIDOS, JSON.pretty_generate(datos)) }
  end

  def url(file)
    "/" + file.relative_path_from(Rails.public_path).each_filename.map { |parte| ERB::Util.url_encode(parte) }.join("/")
  end
end
