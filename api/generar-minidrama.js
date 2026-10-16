export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido. Usa POST." });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Falta configurar GEMINI_API_KEY en Vercel." });
  }

  try {
    const body = req.body || {};
    const idea = String(body.idea || body.sinopsis || "").trim();
    const referencia = String(body.referencia || "").trim();
    const modo = String(body.modo || "drama").trim();
    const estilo = String(body.estilo || "Cinematográfico realista").trim();
    const cantidad = Math.max(3, Math.min(20, Number(body.cantidad) || 10));
    const generos = Array.isArray(body.generos) ? body.generos.slice(0, 8) : [];

    if (idea.length < 10) {
      return res.status(400).json({ error: "Describe la idea con al menos 10 caracteres." });
    }

    const prompt = `
Eres showrunner, guionista y director creativo especializado en minidramas verticales.
Crea una biblia narrativa ORIGINAL, completa y coherente a partir de la idea del usuario.
La duración normal de cada episodio es de 30 a 90 segundos; los episodios especiales pueden durar hasta 120 segundos.
Modo narrativo: ${modo}
Estilo visual: ${estilo}
Géneros preferidos: ${generos.join(", ") || "elige los más adecuados"}
Idea del usuario: ${idea}
Referencia opcional: ${referencia || "ninguna"}

Si hay una obra de referencia, úsala solo como inspiración temática general. No copies personajes, escenas, diálogos, nombres propios ni tramas reconocibles. Crea personajes y acontecimientos originales.
Si el modo es fantasía de cultivo espiritual, puedes incluir dantian, Qi, meridianos, reinos de cultivo, sectas, maestros, técnicas, artefactos, rivalidades, romance y venganza; establece reglas claras y respétalas.
Crea exactamente ${cantidad} episodios. Cada episodio debe tener un gancho inicial, un conflicto concreto y un cierre que invite a ver el siguiente.
Diseña entre 4 y 8 personajes relevantes con descripciones físicas específicas y consistentes, edad aparente, personalidad, motivación, vestuario distintivo y papel.
Devuelve exclusivamente JSON válido en español, sin Markdown, con esta estructura:
{
 "titulo":"...",
 "frasePromocional":"...",
 "generos":["..."],
 "estiloVisual":"...",
 "premisa":"...",
 "sinopsis":"...",
 "descripcion":"Descripción atractiva de la serie",
 "mundo":"...",
 "reglasContinuidad":["..."],
 "arcoPrincipal":"...",
 "personajes":[
  {"nombre":"...","edad":"...","apariencia":"Descripción física concreta: rostro, cabello, ojos, complexión, rasgos distintivos","personalidad":"...","vestuario":"...","motivacion":"...","rol":"Protagonista"}
 ],
 "episodios":[
  {"numero":1,"titulo":"...","duracionSegundos":60,"resumen":"...","ganchoInicial":"...","conflicto":"...","finalGancho":"..."}
 ]
}
No añadas campos fuera del esquema. Asegura que todos los nombres y rasgos sean consistentes en toda la serie.
`;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.8 }
        })
      }
    );

    const data = await response.json();
    if (!response.ok) {
      console.error("Gemini generar-minidrama:", response.status, data);
      return res.status(502).json({
        error: "Gemini no pudo crear la serie.",
        details: data.error?.message || "Error del proveedor de IA."
      });
    }

    const textContent = (data.candidates?.[0]?.content?.parts || [])
      .map(part => part.text || "").join("").trim();
    if (!textContent) return res.status(502).json({ error: "Gemini devolvió una respuesta vacía." });

    let result;
    try { result = JSON.parse(textContent); }
    catch {
      console.error("JSON inválido de generar-minidrama:", textContent);
      return res.status(502).json({ error: "Gemini devolvió JSON inválido. Inténtalo de nuevo." });
    }

    if (!result.titulo || !Array.isArray(result.personajes) || !Array.isArray(result.episodios)) {
      return res.status(502).json({ error: "La respuesta de IA no contiene la estructura de serie esperada." });
    }
    if (result.episodios.length !== cantidad) {
      return res.status(502).json({ error: "La IA no generó la cantidad exacta de episodios solicitada. Inténtalo otra vez." });
    }

    result.personajes = result.personajes.map((p, i) => ({
      id: `ia-personaje-${Date.now()}-${i}`,
      nombre: String(p.nombre || `Personaje ${i + 1}`),
      edad: String(p.edad || ""),
      apariencia: String(p.apariencia || ""),
      personalidad: String(p.personalidad || ""),
      vestuario: String(p.vestuario || ""),
      motivacion: String(p.motivacion || ""),
      rol: String(p.rol || "Personaje secundario")
    }));

    result.episodios = result.episodios.map((ep, i) => ({
      id: `ia-episodio-${Date.now()}-${i}`,
      numero: i + 1,
      titulo: String(ep.titulo || `Episodio ${i + 1}`),
      duracionSegundos: Math.max(30, Math.min(120, Number(ep.duracionSegundos) || 60)),
      resumen: String(ep.resumen || ""),
      ganchoInicial: String(ep.ganchoInicial || ""),
      conflicto: String(ep.conflicto || ""),
      finalGancho: String(ep.finalGancho || ""),
      guion: "",
      storyboard: []
    }));

    return res.status(200).json({ success: true, serie: result });
  } catch (error) {
    console.error("Error interno generar-minidrama:", error);
    return res.status(500).json({ error: "Ocurrió un error interno al generar el minidrama." });
  }
}
