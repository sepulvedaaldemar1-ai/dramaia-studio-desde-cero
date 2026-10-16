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
    const serie = body.serie || {};
    const episodio = body.episodio || {};
    const personajes = Array.isArray(serie.personajes) ? serie.personajes : [];
    const numero = Math.max(1, Number(episodio.numero) || 1);
    const tituloSerie = String(serie.titulo || serie.nombre || "Minidrama").slice(0, 160);
    const tituloEpisodio = String(episodio.titulo || `Episodio ${numero}`).slice(0, 160);
    const resumen = String(episodio.resumen || "").trim();
    const duracion = Math.max(30, Math.min(120, Number(episodio.duracionSegundos) || 60));

    if (!resumen) {
      return res.status(400).json({ error: "El episodio necesita un resumen antes de generar el guion." });
    }

    const personajesTexto = personajes.map((p, i) => {
      const nombre = String(p.nombre || `Personaje ${i + 1}`);
      return `- ${nombre}; edad: ${p.edad || "no especificada"}; apariencia: ${p.apariencia || "mantener el diseño ya establecido"}; personalidad: ${p.personalidad || "según la biblia narrativa"}; vestuario: ${p.vestuario || p.ropa || "coherente con la escena"}; rol: ${p.rol || "secundario"}; motivación: ${p.motivacion || "según la historia"}`;
    }).join("\n");

    const prompt = `
Eres guionista profesional de minidramas verticales. Escribe el guion completo y filmable de un episodio original.
SERIE: ${tituloSerie}
GÉNEROS: ${(serie.generos || []).join(", ") || "según la biblia"}
MUNDO Y CONTINUIDAD: ${serie.mundo || "respetar los datos proporcionados"}
REGLAS DE CONTINUIDAD: ${JSON.stringify(serie.reglasContinuidad || [])}
ARCO PRINCIPAL: ${serie.arcoPrincipal || serie.sinopsis || ""}
EPISODIO ${numero}: ${tituloEpisodio}
RESUMEN: ${resumen}
GANCHO INICIAL: ${episodio.ganchoInicial || ""}
CONFLICTO: ${episodio.conflicto || ""}
GANCHO FINAL: ${episodio.finalGancho || ""}
DURACIÓN OBJETIVO: ${duracion} segundos (normalmente 30–90; especial hasta 120).
PERSONAJES Y DISEÑO QUE DEBES RESPETAR:
${personajesTexto || "Usa solo los personajes establecidos en la biblia de la serie."}

REQUISITOS:
- Guion completo, no un resumen ni una escaleta.
- Abre con una imagen, acción, revelación o frase que enganche desde los primeros segundos.
- Escribe escenas concretas con localización y momento del día.
- Incluye acciones visuales filmables, diálogos naturales con el nombre del personaje antes de cada parlamento, pausas y reacciones.
- Mantén consistentes nombres, aspecto, vestuario, relaciones, poderes, conocimientos y hechos previos.
- No introduzcas personajes nuevos importantes ni contradigas la biblia narrativa.
- Cierra con el gancho final indicado o una versión más potente que conserve su sentido.
- Para fantasía de cultivo espiritual, respeta las reglas establecidas de Qi, dantian, meridianos, reinos, técnicas y artefactos; no concedas poderes sin preparación.
- Evita copiar texto o escenas de obras de referencia.
- Mantén una longitud adecuada para la duración indicada y ritmo de minidrama vertical.
Devuelve exclusivamente JSON válido en español:
{
 "titulo":"...",
 "numero":${numero},
 "duracionSegundos":${duracion},
 "guion":"Guion completo con saltos de línea escapados correctamente",
 "resumenContinuidad":"Hechos que deben recordarse en episodios posteriores",
 "personajesEnEscena":["Nombre exacto"],
 "ganchoFinal":"..."
}
No uses Markdown fuera del JSON.
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
      console.error("Gemini generar-guion-episodio:", response.status, data);
      return res.status(502).json({
        error: "Gemini no pudo generar el guion.",
        details: data.error?.message || "Error del proveedor de IA."
      });
    }

    const texto = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("").trim();
    if (!texto) return res.status(502).json({ error: "Gemini devolvió una respuesta vacía." });

    let resultado;
    try { resultado = JSON.parse(texto); }
    catch {
      console.error("JSON inválido de generar-guion-episodio:", texto);
      return res.status(502).json({ error: "Gemini devolvió JSON inválido. Inténtalo de nuevo." });
    }

    if (!String(resultado.guion || "").trim()) {
      return res.status(502).json({ error: "La respuesta no contiene un guion completo." });
    }

    return res.status(200).json({
      success: true,
      guion: String(resultado.guion),
      episodio: {
        titulo: String(resultado.titulo || tituloEpisodio),
        numero,
        duracionSegundos: Math.max(30, Math.min(120, Number(resultado.duracionSegundos) || duracion)),
        resumenContinuidad: String(resultado.resumenContinuidad || ""),
        personajesEnEscena: Array.isArray(resultado.personajesEnEscena) ? resultado.personajesEnEscena : [],
        ganchoFinal: String(resultado.ganchoFinal || episodio.finalGancho || "")
      }
    });
  } catch (error) {
    console.error("Error interno generar-guion-episodio:", error);
    return res.status(500).json({ error: "Ocurrió un error interno al generar el guion." });
  }
}
